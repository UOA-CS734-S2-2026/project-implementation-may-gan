#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const shaPattern = /^[a-f0-9]{40}$/;

function fail(message) {
  throw new Error(`Refusing staging release: ${message}`);
}

function validSha(value) {
  return shaPattern.test(value ?? "");
}

export function selectReleaseCommit({ eventSha, inputSha, dispatchSha, mainSha, hasCommit, isAncestor }) {
  if (!validSha(mainSha)) fail("the fetched main ref does not name an immutable commit SHA.");

  if (eventSha) {
    if (!validSha(eventSha)) fail("the workflow_run commit SHA is invalid.");
    if (eventSha !== mainSha) fail("the successful CI commit is no longer the current main commit.");
    return eventSha;
  }

  if (inputSha) {
    if (!validSha(inputSha) || !hasCommit(inputSha)) {
      fail("the requested rollback commit SHA is invalid or unavailable.");
    }
    if (!isAncestor(inputSha, mainSha)) fail("the requested rollback commit is outside main history.");
    return inputSha;
  }

  if (!validSha(dispatchSha)) fail("the manual dispatch commit SHA is invalid.");
  if (dispatchSha !== mainSha) fail("main advanced before this manual dispatch was captured.");
  return dispatchSha;
}

export function selectMigrationMode({ eventSha, inputSha }) {
  // Any explicit SHA is an operator-selected historical release, including an
  // explicit SHA equal to main. Keep it verification-only rather than trusting
  // an input to claim it is safe to apply DDL.
  if (inputSha) return "rollback-verify-only";
  if (eventSha) return "forward";
  return "forward";
}

export function validateBrowserProxyMode(mode) {
  if (mode !== "true" && mode !== "false") {
    fail("STAGING_BROWSER_PROXY_ENABLED must be true or false.");
  }
  return mode;
}

function git(args, { cwd, stdio = "pipe" } = {}) {
  const result = execFileSync("git", args, { cwd, encoding: "utf8", stdio });
  return typeof result === "string" ? result.trim() : "";
}

export function captureRelease({ eventSha, inputSha, dispatchSha, toolingSha, browserProxyEnabled, cwd = process.cwd() }) {
  const mainSha = git(["rev-parse", "origin/main"], { cwd });
  const hasCommit = (sha) => {
    try {
      git(["cat-file", "-e", `${sha}^{commit}`], { cwd, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  const isAncestor = (ancestor, descendant) => {
    try {
      git(["merge-base", "--is-ancestor", ancestor, descendant], { cwd, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };

  if (!validSha(toolingSha)) fail("the workflow tooling commit SHA is invalid.");

  return {
    commitSha: selectReleaseCommit({ eventSha, inputSha, dispatchSha, mainSha, hasCommit, isAncestor }),
    migrationMode: selectMigrationMode({ eventSha, inputSha }),
    toolingSha,
    browserProxyEnabled: validateBrowserProxyMode(browserProxyEnabled),
  };
}

function writeOutputs({ commitSha, migrationMode, toolingSha, browserProxyEnabled }, outputPath) {
  const output = `commit_sha=${commitSha}\nmigration_mode=${migrationMode}\ntooling_sha=${toolingSha}\nbrowser_proxy_enabled=${browserProxyEnabled}\n`;
  if (outputPath) {
    appendFileSync(outputPath, output);
  } else {
    process.stdout.write(output);
  }
}

function main() {
  const release = captureRelease({
    eventSha: process.env.EVENT_SHA,
    inputSha: process.env.INPUT_SHA,
    dispatchSha: process.env.DISPATCH_SHA,
    toolingSha: process.env.TOOLING_SHA,
    browserProxyEnabled: process.env.STAGING_BROWSER_PROXY_ENABLED,
  });
  writeOutputs(release, process.env.GITHUB_OUTPUT);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
