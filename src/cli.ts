#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { runDemo, verify, runPlan, saveBundle, renderReport } from "./index.ts";
try {
  const command = process.argv[2] ?? "demo";
  let result;
  if (command === "demo") result = await runDemo();
  else if (command === "report") {
    const result = JSON.parse(await readFile(process.argv[3], "utf8"));
    await writeFile(process.argv[4], renderReport(result), { flag: "wx" });
    console.log(process.argv[4]);
    process.exit(0);
  } else if (command === "run") {
    const plan = JSON.parse(await readFile(process.argv[3], "utf8"));
    const observations = JSON.parse(await readFile(process.argv[4], "utf8"));
    if (plan.authenticated || plan.checks.some((c: any) => c.reload))
      throw new Error(
        "Recordings cannot establish authentication or reload state",
      );
    let i = 0;
    result = await runPlan(plan, {
      async observe() {
        if (i >= observations.length) throw new Error("Recording exhausted");
        return observations[i++];
      },
    });
    if (process.argv[5]) await saveBundle(process.argv[5], plan, result);
  } else if (command === "check-recording") {
    const contract = JSON.parse(await readFile(process.argv[3], "utf8"));
    const observations = JSON.parse(await readFile(process.argv[4], "utf8"));
    let i = 0;
    if (contract.reload)
      throw new Error("Recorded observations cannot verify a live reload");
    result = await verify(contract, {
      async observe() {
        if (i >= observations.length) throw new Error("Recording exhausted");
        return observations[i++];
      },
    });
  } else
    throw new Error(
      "Usage: browserassert demo | check-recording contract.json observations.json",
    );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode =
    result.verdict === "verified" ? 0 : result.verdict === "failed" ? 1 : 2;
} catch (error) {
  console.error(String(error));
  process.exitCode = 2;
}
