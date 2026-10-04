import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureRelease, validateBrowserProxyMode, validatePushReadiness } from "./capture-staging-release.mjs";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function releaseRepository() {
  const root = mkdtempSync(join(tmpdir(), "dayli-staging-release-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test User"]);
  git(root, ["branch", "-M", "main"]);

  writeFileSync(join(root, "release.txt"), "first\n");
  git(root, ["add", "release.txt"]);
  git(root, ["commit", "--quiet", "-m", "first"]);
  const previousSha = git(root, ["rev-parse", "HEAD"]);

  writeFileSync(join(root, "release.txt"), "current\n");
  git(root, ["commit", "--all", "--quiet", "-m", "current"]);
  const currentSha = git(root, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/remotes/origin/main", currentSha]);

  return { root, previousSha, currentSha };
}

function withReleaseRepository(callback) {
  const repository = releaseRepository();
  try {
    callback(repository);
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
}

test("automatic staging releases accept only the current main commit", () => withReleaseRepository(({ root, previousSha, currentSha }) => {
  assert.deepEqual(captureRelease({
    eventSha: currentSha,
    toolingSha: currentSha,
    browserProxyEnabled: "false",
    pushReadiness: "false",
    cwd: root,
  }), { commitSha: currentSha, migrationMode: "forward", toolingSha: currentSha, browserProxyEnabled: "false", pushReadiness: "false" });

  assert.throws(() => captureRelease({
    eventSha: previousSha,
    toolingSha: currentSha,
    browserProxyEnabled: "false",
    pushReadiness: "false",
    cwd: root,
  }), /no longer the current main commit/);
}));

test("manual dispatch captures an explicit OAuth readiness request", () => withReleaseRepository(({ root, previousSha, currentSha }) => {
  assert.deepEqual(captureRelease({
    inputSha: previousSha,
    dispatchSha: currentSha,
    toolingSha: currentSha,
    browserProxyEnabled: "true",
    pushReadiness: "true",
    cwd: root,
  }), { commitSha: previousSha, migrationMode: "rollback-verify-only", toolingSha: currentSha, browserProxyEnabled: "true", pushReadiness: "true" });

  assert.deepEqual(captureRelease({
    inputSha: currentSha,
    dispatchSha: currentSha,
    toolingSha: currentSha,
    browserProxyEnabled: "false",
    pushReadiness: "false",
    cwd: root,
  }), { commitSha: currentSha, migrationMode: "rollback-verify-only", toolingSha: currentSha, browserProxyEnabled: "false", pushReadiness: "false" });

  assert.deepEqual(captureRelease({
    dispatchSha: currentSha,
    toolingSha: currentSha,
    browserProxyEnabled: "false",
    pushReadiness: "false",
    cwd: root,
  }), { commitSha: currentSha, migrationMode: "forward", toolingSha: currentSha, browserProxyEnabled: "false", pushReadiness: "false" });

  assert.throws(() => captureRelease({
    dispatchSha: previousSha,
    toolingSha: currentSha,
    browserProxyEnabled: "false",
    pushReadiness: "false",
    cwd: root,
  }), /main advanced before this manual dispatch was captured/);
}));

test("captured browser proxy and push-readiness modes must be explicit booleans", () => {
  assert.equal(validateBrowserProxyMode("true"), "true");
  assert.equal(validateBrowserProxyMode("false"), "false");
  assert.throws(() => validateBrowserProxyMode("enabled"), /must be true or false/);
  assert.equal(validatePushReadiness("true"), "true");
  assert.equal(validatePushReadiness("false"), "false");
  assert.throws(() => validatePushReadiness("enabled"), /must be true or false/);
});

test("release capture rejects an unpinned tooling revision", () => withReleaseRepository(({ root, currentSha }) => {
  assert.throws(() => captureRelease({
    dispatchSha: currentSha,
    toolingSha: "main",
    browserProxyEnabled: "false",
    pushReadiness: "false",
    cwd: root,
  }), /workflow tooling commit SHA is invalid/);
}));
