import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const result = spawnSync(process.execPath, ["scripts/check-api-drizzle-queries.mjs", "--fixtures"], {
  cwd: resolve(import.meta.dirname, ".."),
  encoding: "utf8",
});

if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
