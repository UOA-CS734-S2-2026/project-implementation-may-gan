#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const shaPattern = /^[a-f0-9]{40}$/;

function fail(message) {
  throw new Error(`Hosted mutation authorization denied: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function assertAuthorizedManifest(source, expectedSha) {
  if (!shaPattern.test(expectedSha ?? "")) fail("the expected commit SHA is invalid.");

  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    fail("the checked-in manifest is not valid JSON.");
  }

  if (!isPlainObject(manifest) || !Number.isInteger(manifest.version) || manifest.version !== 1 || typeof manifest.state !== "string") {
    fail("the checked-in manifest has an unknown schema.");
  }

  if (manifest.state === "deny") {
    if (!hasOnlyKeys(manifest, ["version", "state"])) fail("the deny manifest has unknown fields.");
    fail("the checked-in manifest holds all hosted mutations.");
  }

  if (manifest.state !== "allow" || !hasOnlyKeys(manifest, ["version", "state", "commit"]) || !shaPattern.test(manifest.commit ?? "")) {
    fail("the checked-in manifest has an unknown authorization state.");
  }
  return manifest.commit;
}

export function assertCurrentCheckout(expectedSha, cwd) {
  let currentSha;
  try {
    currentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    fail("the guard could not read the checked-out commit.");
  }
  if (currentSha !== expectedSha) fail("the default branch advanced after this run was queued.");
}

export function assertAuthorizedCommit(commit, cwd) {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd, stdio: "ignore" });
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd, stdio: "ignore" });
  } catch {
    fail("the authorized commit is not in the live main history.");
  }
}

export function checkAuthorization({ expectedSha, manifestPath, cwd }) {
  if (!expectedSha) fail("EXPECTED_SHA is required.");
  assertCurrentCheckout(expectedSha, cwd);
  let source;
  try {
    source = readFileSync(manifestPath, "utf8");
  } catch {
    fail("the checked-in manifest is missing.");
  }
  const commit = assertAuthorizedManifest(source, expectedSha);
  assertAuthorizedCommit(commit, cwd);
  return commit;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const cwd = process.cwd();
  const expectedSha = argumentValue("--expected-sha") ?? process.env.EXPECTED_SHA;
  const manifestPath = resolve(cwd, argumentValue("--manifest") ?? ".github/hosted-mutation-authorization.json");
  const commit = checkAuthorization({ expectedSha, manifestPath, cwd });
  console.log(commit);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
