import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  verify,
  validateContract,
  type Contract,
  type BrowserAdapter,
  type VerificationResult,
} from "./index.ts";
export type VerificationPlan = {
  schemaVersion: 1;
  id: string;
  timeoutMs?: number;
  checks: Array<Contract & { id: string }>;
  authenticated?: Contract;
};
export type PlanResult = {
  schemaVersion: 1;
  planId: string;
  verdict: "verified" | "failed" | "unknown";
  checks: Array<{ id: string; result: VerificationResult }>;
  durationMs: number;
  cancelled: boolean;
};
export async function runPlan(
  plan: VerificationPlan,
  adapter: BrowserAdapter,
  options: { signal?: AbortSignal } = {},
): Promise<PlanResult> {
  if (
    plan.schemaVersion !== 1 ||
    typeof plan.id !== "string" ||
    !plan.id.trim() ||
    !Array.isArray(plan.checks) ||
    !plan.checks.length ||
    plan.checks.length > 100 ||
    new Set(plan.checks.map((c) => c?.id)).size !== plan.checks.length ||
    plan.checks.some((c) => !c || typeof c.id !== "string" || !c.id.trim())
  )
    throw new Error("Invalid verification plan");
  for (const contract of plan.checks) validateContract(contract);
  if (plan.authenticated) {
    validateContract(plan.authenticated);
    if (plan.authenticated.reload)
      throw new Error("Authentication observation cannot reload");
  }
  const budget = plan.timeoutMs ?? 10000;
  if (!Number.isFinite(budget) || budget < 1 || budget > 60000)
    throw new Error("Invalid plan deadline");
  const started = Date.now();
  const results: PlanResult["checks"] = [];
  const check = async (contract: Contract) => {
    const remaining = budget - (Date.now() - started);
    if (remaining <= 0)
      return {
        verdict: "unknown" as const,
        reason: "Plan deadline exceeded",
        evidence: [],
      };
    return verify(
      {
        ...contract,
        timeoutMs: Math.min(contract.timeoutMs ?? remaining, remaining),
      },
      adapter,
      options,
    );
  };
  if (plan.authenticated) {
    if (plan.authenticated.reload)
      throw new Error("Authentication observation cannot reload");
    const auth = await check(plan.authenticated);
    results.push({ id: "authentication", result: auth });
    if (auth.verdict !== "verified")
      return {
        schemaVersion: 1,
        planId: plan.id,
        verdict: "unknown",
        checks: results,
        durationMs: Date.now() - started,
        cancelled: !!options.signal?.aborted,
      };
  }
  for (const contract of plan.checks) {
    const result = await check(contract);
    results.push({ id: contract.id, result });
    if (options.signal?.aborted) break;
  }
  return {
    schemaVersion: 1,
    planId: plan.id,
    verdict: results.some((c) => c.result.verdict === "unknown")
      ? "unknown"
      : results.some((c) => c.result.verdict === "failed")
        ? "failed"
        : "verified",
    checks: results,
    durationMs: Date.now() - started,
    cancelled: !!options.signal?.aborted,
  };
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function renderReport(result: PlanResult): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BrowserAssert evidence</title><style>body{font:16px system-ui;background:#f4f7fa;color:#14233d;max-width:980px;margin:40px auto;padding:20px}article{background:white;border-radius:12px;padding:20px;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer}h1{font-size:32px}</style><h1>${escape(result.planId)}</h1><p>${escape(String(result.verdict).toUpperCase())} · ${escape(String(result.durationMs))} ms</p>${result.checks.map((c) => `<article><h2>${escape(c.id)} — ${escape(String(c.result.verdict))}</h2><p>${escape(c.result.reason)}</p><details><summary>Source evidence (${c.result.evidence.length})</summary><pre>${escape(JSON.stringify(c.result.evidence, null, 2))}</pre></details></article>`).join("")}</html>`;
}
export async function saveBundle(
  directory: string,
  plan: VerificationPlan,
  result: PlanResult,
  options: {
    redactSelectors?: string[];
    redactValues?: string[];
    screenshotPage?: any;
    maskSelectors?: string[];
  } = {},
) {
  await mkdir(directory, { recursive: false, mode: 0o700 });
  const selectors = new Set(options.redactSelectors ?? []);
  const secrets = options.redactValues ?? [];
  if (secrets.some((v) => !v)) throw new Error("Empty redaction token");
  const redact = (value: any): any => {
    if (typeof value === "string") {
      for (const secret of secrets)
        value = value.split(secret).join("[REDACTED]");
      return value;
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === "object") {
      const copy: any = {};
      for (const [k, v] of Object.entries(value)) copy[k] = redact(v);
      if (selectors.has(value.source)) copy.value = "[REDACTED]";
      if (selectors.has(value.selector)) copy.expected = "[REDACTED]";
      return copy;
    }
    return value;
  };
  const safeResult = redact(result),
    safePlan = redact(plan);
  const artifacts: Array<{ file: string; sha256: string }> = [];
  const save = async (file: string, data: string | Buffer) => {
    await writeFile(path.join(directory, file), data, {
      flag: "wx",
      mode: 0o600,
    });
    artifacts.push({
      file,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  };
  await save("result.json", JSON.stringify(safeResult, null, 2) + "\n");
  await save("plan.json", JSON.stringify(safePlan, null, 2) + "\n");
  await save("report.html", renderReport(safeResult));
  if (options.screenshotPage) {
    const masks = [
      ...new Set([
        ...(options.maskSelectors ?? []),
        ...(options.redactSelectors ?? []),
      ]),
    ];
    const image = await options.screenshotPage.screenshot({
      mask: masks.map((s) => options.screenshotPage.locator(s)),
      timeout: 5000,
    });
    await save("screenshot.png", image);
  }
  await save(
    "manifest.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        planId: safeResult.planId,
        verdict: safeResult.verdict,
        artifacts: [...artifacts],
      },
      null,
      2,
    ) + "\n",
  );
  return path.resolve(directory);
}
