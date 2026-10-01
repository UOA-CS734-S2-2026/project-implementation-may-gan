import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{40}$/;

function fail() {
  throw new Error("invalid staging release attribution");
}

export function readStagingReleaseAttribution(source) {
  const lines = source.split("\n").filter(Boolean);
  if (lines.length !== 2) fail();
  const values = new Map(lines.map((line) => line.split("=", 2)));
  if (values.size !== 2 || !SHA.test(values.get("release_sha")) || !SHA.test(values.get("automation_sha"))) fail();
  return { releaseSha: values.get("release_sha"), automationSha: values.get("automation_sha") };
}

function main() {
  try {
    const attribution = readStagingReleaseAttribution(readFileSync(process.env.ATTRIBUTION_FILE ?? "", "utf8"));
    if (!process.env.GITHUB_OUTPUT) fail();
    appendFileSync(process.env.GITHUB_OUTPUT, `release_sha=${attribution.releaseSha}\nautomation_sha=${attribution.automationSha}\n`);
    process.stdout.write("staging_auth_smoke release_attribution=verified\n");
  } catch {
    process.stderr.write("staging_auth_smoke release_attribution=invalid\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
