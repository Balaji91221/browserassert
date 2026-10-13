import test from "node:test";
import assert from "node:assert/strict";
import { verify, runDemo, PlaywrightAdapter } from "../src/index.ts";
test("misleading success before reload fails persistence", async () =>
  assert.equal((await runDemo()).verdict, "failed"));
test("persistent setting verifies with evidence", async () => {
  let reloaded = false;
  const result = await verify(
    { selector: "#x", expected: "saved", reload: true },
    {
      async reload() {
        reloaded = true;
      },
      async observe() {
        assert.equal(reloaded, true);
        return { value: "saved", source: "#x" };
      },
    },
  );
  assert.equal(result.verdict, "verified");
  assert.equal(result.evidence.length, 1);
});
test("missing evidence is unknown, not failed", async () => {
  assert.equal(
    (
      await verify(
        { selector: "#x", expected: 1 },
        {
          async observe() {
            throw new Error("Browser closed");
          },
        },
      )
    ).verdict,
    "unknown",
  );
});
test("unsupported reload is unknown", async () =>
  assert.equal(
    (
      await verify(
        { selector: "#x", expected: 1, reload: true },
        {
          async observe() {
            return { value: 1, source: "#x" };
          },
        },
      )
    ).verdict,
    "unknown",
  ));
test("hanging adapter is bounded", async () => {
  const start = Date.now();
  const r = await verify(
    { selector: "#x", expected: 1, timeoutMs: 20 },
    {
      observe() {
        return new Promise(() => {});
      },
    },
  );
  assert.equal(r.verdict, "unknown");
  assert.ok(Date.now() - start < 500);
});
test("eventual observation succeeds", async () => {
  let i = 0;
  assert.equal(
    (
      await verify(
        { selector: "#x", expected: 2, pollMs: 1 },
        {
          async observe() {
            return { value: ++i, source: "#x" };
          },
        },
      )
    ).verdict,
    "verified",
  );
});
test("adapter rejects ambiguous selectors", async () => {
  const adapter = new PlaywrightAdapter({
    locator() {
      return {
        async count() {
          return 2;
        },
      };
    },
  });
  assert.equal(
    (await verify({ selector: "input", expected: "x" }, adapter)).verdict,
    "unknown",
  );
});

test("wrong-source evidence cannot verify a contract", async () =>
  assert.equal(
    (
      await verify(
        { selector: "#status", expected: "Saved" },
        {
          async observe() {
            return { source: "#unrelated", value: "Saved" };
          },
        },
      )
    ).verdict,
    "unknown",
  ));
test("poll intervals do not cause an early failed verdict", async () => {
  const start = Date.now();
  const result = await verify(
    { selector: "#x", expected: "yes", timeoutMs: 50, pollMs: 100 },
    {
      async observe() {
        return { source: "#x", value: "no" };
      },
    },
  );
  assert.equal(result.verdict, "failed");
  assert.ok(Date.now() - start >= 40);
});
