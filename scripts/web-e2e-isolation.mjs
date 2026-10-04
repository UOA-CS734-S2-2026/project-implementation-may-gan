import fs from "node:fs";
import { pathToFileURL } from "node:url";

function collectTests(suites, tests = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) tests.push(...(spec.tests ?? []).map((entry) => ({ ...entry, file: spec.file })));
    collectTests(suite.suites, tests);
  }
  return tests;
}

function parseReport(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if ((report.errors ?? []).length > 0) throw new Error(`Playwright report contains ${report.errors.length} error(s): ${reportPath}`);
  return report;
}

export function fixturePlan(report) {
  const pairs = new Map();
  for (const test of collectTests(report.suites)) {
    if (!test.file || !test.projectName) throw new Error("Playwright list report omitted a spec file or project name.");
    const key = `${test.file}\0${test.projectName}`;
    pairs.set(key, { file: test.file, project: test.projectName });
  }
  if (pairs.size === 0) throw new Error("No web E2E spec and project pairs were discovered.");
  return [...pairs.values()].sort((left, right) => left.file.localeCompare(right.file) || left.project.localeCompare(right.project));
}

export function summarizeReports(reports) {
  let passed = 0;
  let skipped = 0;
  let failed = 0;
  for (const report of reports) {
    for (const test of collectTests(report.suites)) {
      const status = test.results?.at(-1)?.status ?? test.status;
      if (status === "passed") passed += 1;
      else if (status === "skipped") skipped += 1;
      else failed += 1;
    }
  }
  if (failed > 0) throw new Error(`Web E2E reports contain ${failed} non-passing test(s).`);
  if (passed === 0) throw new Error("The complete web E2E run did not execute any passing tests.");
  return { passed, skipped, failed };
}

function main([command, ...paths]) {
  if (command === "plan" && paths.length === 1) {
    for (const item of fixturePlan(parseReport(paths[0]))) process.stdout.write(`${item.file}\t${item.project}\n`);
    return;
  }
  if (command === "summarize" && paths.length > 0) {
    const summary = summarizeReports(paths.map(parseReport));
    process.stdout.write(`Web E2E aggregate: ${summary.passed} passed, ${summary.skipped} skipped\n`);
    return;
  }
  throw new Error("Usage: web-e2e-isolation.mjs plan <list-report> | summarize <result-report>...");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
