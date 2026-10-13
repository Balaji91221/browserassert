export function validateContract(contract: Contract) {
  const { selector, expected, timeoutMs = 1000, pollMs = 50 } = contract;
  if (
    (expected !== null &&
      !["string", "number", "boolean"].includes(typeof expected)) ||
    (typeof expected === "number" && !Number.isFinite(expected)) ||
    typeof selector !== "string" ||
    !selector ||
    (contract.reload !== undefined && typeof contract.reload !== "boolean") ||
    (contract.operator !== undefined &&
      !["equals", "contains", "at_least", "at_most"].includes(
        contract.operator,
      )) ||
    (contract.operator === "contains" && typeof expected !== "string") ||
    (["at_least", "at_most"].includes(contract.operator ?? "") &&
      (typeof expected !== "number" || !Number.isFinite(expected))) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 60000 ||
    !Number.isFinite(pollMs) ||
    pollMs < 1
  )
    throw new Error("Invalid contract");
}
export type Observation = { value: unknown; source: string };
export interface BrowserAdapter {
  observe(selector: string, signal: AbortSignal): Promise<Observation>;
  reload?(signal: AbortSignal): Promise<void>;
}
export type Contract = {
  selector: string;
  expected: unknown;
  reload?: boolean;
  operator?: "equals" | "contains" | "at_least" | "at_most";
  timeoutMs?: number;
  pollMs?: number;
};
export type VerificationResult = {
  verdict: "verified" | "failed" | "unknown";
  reason: string;
  evidence: Observation[];
};
export async function verify(
  contract: Contract,
  adapter: BrowserAdapter,
  options: { signal?: AbortSignal } = {},
): Promise<VerificationResult> {
  const {
    selector,
    expected,
    reload = false,
    timeoutMs = 1000,
    pollMs = 50,
  } = contract;
  validateContract(contract);
  if (options.signal?.aborted)
    return {
      verdict: "unknown",
      reason: "Verification cancelled",
      evidence: [],
    };
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const evidence: Observation[] = [];
  let timedOut = false,
    inFlight = false;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<VerificationResult>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve({
        verdict: evidence.length && !inFlight ? "failed" : "unknown",
        reason:
          evidence.length && !inFlight
            ? "Expected value not observed by deadline"
            : "Observation deadline exceeded with incomplete evidence",
        evidence: [...evidence],
      });
    }, timeoutMs);
  });
  let cancelHandler: () => void;
  const cancelled = new Promise<VerificationResult>((resolve) => {
    cancelHandler = () => {
      timedOut = true;
      controller.abort();
      resolve({
        verdict: "unknown",
        reason: "Verification cancelled",
        evidence: [...evidence],
      });
    };
    options.signal?.addEventListener("abort", cancelHandler, { once: true });
  });
  const work = async (): Promise<VerificationResult> => {
    try {
      if (reload) {
        if (!adapter.reload)
          return {
            verdict: "unknown",
            reason: "Adapter does not support declared reload",
            evidence,
          };
        inFlight = true;
        await adapter.reload(controller.signal);
        inFlight = false;
        if (Date.now() >= deadline)
          return {
            verdict: "unknown",
            reason: "Reload exceeded deadline",
            evidence,
          };
      }
      while (!timedOut) {
        if (Date.now() >= deadline)
          return {
            verdict: evidence.length ? "failed" : "unknown",
            reason: "Observation window elapsed",
            evidence,
          };
        inFlight = true;
        const observation = await adapter.observe(selector, controller.signal);
        inFlight = false;
        if (Date.now() >= deadline)
          return {
            verdict: "unknown",
            reason: "Observation exceeded deadline",
            evidence,
          };
        if (timedOut) break;
        if (!observation || observation.source !== selector)
          throw new Error(
            "Observation source does not match requested selector",
          );
        evidence.push(observation);
        if (evaluatePredicate(observation.value, expected, contract.operator))
          return {
            verdict: "verified",
            reason: "Observed expected value",
            evidence,
          };
        if (Date.now() >= deadline)
          return {
            verdict: "failed",
            reason: "Observed value did not match within polling window",
            evidence,
          };
        await new Promise((r) =>
          setTimeout(r, Math.min(pollMs, Math.max(1, deadline - Date.now()))),
        );
      }
      return {
        verdict: "unknown",
        reason: "Observation deadline exceeded",
        evidence,
      };
    } catch (error) {
      return { verdict: "unknown", reason: String(error), evidence };
    }
  };
  try {
    return await Promise.race([work(), timeout, cancelled]);
  } finally {
    clearTimeout(timer!);
    options.signal?.removeEventListener("abort", cancelHandler!);
    controller.abort();
  }
}
/** Duck-typed Playwright Page adapter. No browser is created or closed by this library. */
export class PlaywrightAdapter implements BrowserAdapter {
  private page: any;
  constructor(page: any) {
    this.page = page;
  }
  async observe(selector: string, signal: AbortSignal): Promise<Observation> {
    signal.throwIfAborted();
    const locator = this.page.locator(selector);
    const count = await locator.count();
    if (count !== 1)
      throw new Error(`Expected exactly one matching element; found ${count}`);
    const value = await locator.evaluate((el: any) =>
      "value" in el ? el.value : el.textContent,
    );
    signal.throwIfAborted();
    return { value, source: selector };
  }
  async reload(signal: AbortSignal) {
    signal.throwIfAborted();
    await this.page.reload({ waitUntil: "domcontentloaded", timeout: 5000 });
    signal.throwIfAborted();
  }
}
export async function runDemo() {
  let current = "new";
  const adapter = {
    async reload() {
      current = "old";
    },
    async observe() {
      return { value: current, source: "#display-name" };
    },
  };
  return verify(
    {
      selector: "#display-name",
      expected: "new",
      reload: true,
      timeoutMs: 30,
      pollMs: 5,
    },
    adapter,
  );
}

/** Observe an already-started Playwright download; never repeats the initiating action. */
export async function verifyDownload(
  download: {
    failure(): Promise<string | null>;
    path(): Promise<string | null>;
    suggestedFilename(): string;
  },
  options: {
    timeoutMs?: number;
    expectedFilename?: string;
    minBytes?: number;
  } = {},
): Promise<VerificationResult> {
  const { timeoutMs = 5000, expectedFilename, minBytes = 1 } = options;
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isInteger(minBytes) ||
    minBytes < 0
  )
    throw new Error("Invalid download contract");
  const deadline = Date.now() + timeoutMs;
  const expired = () => ({
    verdict: "unknown" as const,
    reason: "Download deadline exceeded",
    evidence: [],
  });
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<VerificationResult>((r) => {
    timer = setTimeout(
      () =>
        r({
          verdict: "unknown",
          reason: "Download deadline exceeded",
          evidence: [],
        }),
      timeoutMs,
    );
  });
  const work = async (): Promise<VerificationResult> => {
    try {
      const failure = await download.failure();
      if (Date.now() >= deadline) return expired();
      if (failure)
        return {
          verdict: "failed",
          reason: `Download failed: ${failure}`,
          evidence: [],
        };
      const file = await download.path();
      if (Date.now() >= deadline) return expired();
      if (!file)
        return {
          verdict: "unknown",
          reason: "No local download artifact",
          evidence: [],
        };
      const { stat } = await import("node:fs/promises");
      const info = await stat(file);
      const name = download.suggestedFilename();
      if (Date.now() >= deadline) return expired();
      const evidence = [
        { source: "download", value: { name, bytes: info.size } },
      ];
      if (
        !info.isFile() ||
        info.size < minBytes ||
        (expectedFilename !== undefined && name !== expectedFilename)
      )
        return {
          verdict: "failed",
          reason: "Downloaded artifact does not satisfy contract",
          evidence,
        };
      return {
        verdict: "verified",
        reason: "Download completed and artifact matches contract",
        evidence,
      };
    } catch (error) {
      return { verdict: "unknown", reason: String(error), evidence: [] };
    }
  };
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export function evaluatePredicate(
  value: unknown,
  expected: unknown,
  operator: Contract["operator"] = "equals",
): boolean {
  if (operator === "equals") return Object.is(value, expected);
  if (operator === "contains")
    return (
      typeof value === "string" &&
      typeof expected === "string" &&
      value.includes(expected)
    );
  if (
    typeof value !== "number" ||
    typeof expected !== "number" ||
    !Number.isFinite(value) ||
    !Number.isFinite(expected)
  )
    return false;
  return operator === "at_least" ? value >= expected : value <= expected;
}
export { runPlan, saveBundle, renderReport } from "./plan.ts";
export type { VerificationPlan, PlanResult } from "./plan.ts";
