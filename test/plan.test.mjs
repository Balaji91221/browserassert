import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { verify, runPlan, saveBundle, renderReport } from "../src/index.ts";
test("caller cancellation produces unknown and terminates wait", async () => {
  const controller = new AbortController();
  const pending = verify(
    { selector: "#x", expected: "done", timeoutMs: 5000 },
    {
      observe() {
        return new Promise(() => {});
      },
    },
    { signal: controller.signal },
  );
  controller.abort();
  assert.equal((await pending).reason, "Verification cancelled");
});
test("unauthenticated plan does not verify protected checks", async () => {
  let n = 0;
  const r = await runPlan(
    {
      schemaVersion: 1,
      id: "x",
      timeoutMs: 20,
      authenticated: { selector: "#auth", expected: "signed in" },
      checks: [{ id: "private", selector: "#private", expected: "ok" }],
    },
    {
      async observe(s) {
        n++;
        return { source: s, value: "signed out" };
      },
    },
  );
  assert.equal(r.verdict, "unknown");
  assert.equal(r.checks.length, 1);
});
test("supported predicates and invalid config", async () => {
  assert.equal(
    (
      await verify(
        { selector: "#x", expected: "saved", operator: "contains" },
        {
          async observe() {
            return { source: "#x", value: "Item saved" };
          },
        },
      )
    ).verdict,
    "verified",
  );
  await assert.rejects(
    verify(
      { selector: "#x", expected: "1", operator: "at_least" },
      {
        async observe() {
          return { source: "#x", value: 2 };
        },
      },
    ),
    /Invalid/,
  );
});
test("redacted evidence bundle does not overwrite and carries hashes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "browser-bundle-"));
  try {
    const out = path.join(dir, "bundle");
    const plan = {
      schemaVersion: 1,
      id: "sensitive",
      checks: [{ id: "sensitive", selector: "#secret", expected: "sensitive" }],
    };
    const result = await runPlan(plan, {
      async observe(s) {
        return { source: s, value: "sensitive" };
      },
    });
    await saveBundle(out, plan, result, {
      redactSelectors: ["#secret"],
      redactValues: ["sensitive"],
    });
    for (const f of [
      "plan.json",
      "result.json",
      "report.html",
      "manifest.json",
    ])
      assert.ok(
        !(await readFile(path.join(out, f), "utf8")).includes("sensitive"),
      );
    const manifest = JSON.parse(
      await readFile(path.join(out, "manifest.json")),
    );
    assert.equal(manifest.artifacts.length, 3);
    await assert.rejects(saveBundle(out, plan, result), /EEXIST/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("all contracts are validated before any browser access", async () => {
  let touches = 0;
  await assert.rejects(
    runPlan(
      {
        schemaVersion: 1,
        id: "bad",
        checks: [
          { id: "a", selector: "#a", expected: "x", reload: true },
          { id: "b", selector: "#b", expected: "x", timeoutMs: -1 },
        ],
      },
      {
        async reload() {
          touches++;
        },
        async observe(s) {
          touches++;
          return { source: s, value: "x" };
        },
      },
    ),
    /Invalid/,
  );
  assert.equal(touches, 0);
});

test("download verification distinguishes failed, unavailable and incorrect artifacts", async () => {
  const { verifyDownload } = await import("../src/index.ts");
  const dir = await mkdtemp(path.join(os.tmpdir(), "download-check-"));
  try {
    const { writeFile } = await import("node:fs/promises");
    const file = path.join(dir, "file.txt");
    await writeFile(file, "abc");
    const adapter = {
      async failure() {
        return null;
      },
      async path() {
        return file;
      },
      suggestedFilename() {
        return "file.txt";
      },
    };
    assert.equal(
      (
        await verifyDownload({
          ...adapter,
          async failure() {
            return "connection lost";
          },
        })
      ).verdict,
      "failed",
    );
    assert.equal(
      (
        await verifyDownload({
          ...adapter,
          async path() {
            return null;
          },
        })
      ).verdict,
      "unknown",
    );
    assert.equal(
      (await verifyDownload(adapter, { expectedFilename: "different.txt" }))
        .verdict,
      "failed",
    );
    assert.equal(
      (await verifyDownload(adapter, { minBytes: 10 })).verdict,
      "failed",
    );
    assert.equal(
      (
        await verifyDownload(
          {
            ...adapter,
            failure() {
              return new Promise(() => {});
            },
          },
          { timeoutMs: 20 },
        )
      ).verdict,
      "unknown",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("report escapes verdict fields loaded from untrusted JSON", () => {
  const html = renderReport({
    planId: "x",
    verdict: "<img src=x onerror=bad>",
    durationMs: "<svg onload=bad>",
    checks: [
      {
        id: "x",
        result: { verdict: "<img onerror=bad>", reason: "x", evidence: [] },
      },
    ],
  });
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<IMG"));
  assert.ok(!html.includes("<svg"));
});

test("late synchronous observations cannot verify after the deadline", async () => {
  const r = await verify(
    { selector: "#x", expected: "ok", timeoutMs: 10 },
    {
      async observe() {
        const stop = Date.now() + 35;
        while (Date.now() < stop) {}
        return { source: "#x", value: "ok" };
      },
    },
  );
  assert.equal(r.verdict, "unknown");
});
test("hanging later observation keeps a prior mismatch inconclusive", async () => {
  let calls = 0;
  const r = await verify(
    { selector: "#x", expected: "ok", timeoutMs: 30, pollMs: 1 },
    {
      observe() {
        if (++calls === 1)
          return Promise.resolve({ source: "#x", value: "no" });
        return new Promise(() => {});
      },
    },
  );
  assert.equal(r.verdict, "unknown");
  assert.equal(r.evidence.length, 1);
});
test("late synchronous download metadata cannot verify after deadline", async () => {
  const { verifyDownload } = await import("../src/index.ts");
  const r = await verifyDownload(
    {
      async failure() {
        return null;
      },
      async path() {
        return new URL(import.meta.url).pathname;
      },
      suggestedFilename() {
        const stop = Date.now() + 35;
        while (Date.now() < stop) {}
        return "plan.test.mjs";
      },
    },
    { timeoutMs: 10 },
  );
  assert.equal(r.verdict, "unknown");
});
