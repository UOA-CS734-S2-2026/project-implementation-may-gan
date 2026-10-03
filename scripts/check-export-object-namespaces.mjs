import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** New object writers must use a reviewed namespace constructor. */
export function findFreeformObjectKeyAssignments(source) {
  const matches = [];
  const expression = /\b(?:objectKey|archiveObjectKey)\s*(?:=|:)\s*(['"`])/g;
  for (const match of source.matchAll(expression)) {
    matches.push(source.slice(0, match.index).split("\n").length);
  }
  return matches;
}

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(current));
    else if (entry.name.endsWith(".ts") && !/\.(?:test|integration\.test|fake|d)\.ts$/.test(entry.name)) result.push(current);
  }
  return result;
}

async function check() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const paths = ["apps/api/src", "packages/db/src"];
  const findings = [];
  for (const directory of paths) {
    for (const file of await sourceFiles(path.join(root, directory))) {
      const source = await readFile(file, "utf8");
      for (const line of findFreeformObjectKeyAssignments(source)) {
        findings.push(`${path.relative(root, file)}:${line}`);
      }
    }
  }
  if (findings.length > 0) {
    throw new Error(`Free-form object key assignments need reviewed constructors: ${findings.join(", ")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  check().catch((error) => {
    console.error(error instanceof Error ? error.message : "Object namespace check failed.");
    process.exitCode = 1;
  });
}
