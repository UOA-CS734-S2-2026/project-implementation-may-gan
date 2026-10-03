import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const names = ["privacy", "terms"];
const mode = process.argv.includes("--check")
  ? "check"
  : process.argv.includes("--release")
    ? "release"
    : "write";

let failed = false;
for (const name of names) {
  const source = resolve(root, "packages/legal-content", `${name}.json`);
  const asset = resolve(root, "apps/mobile/assets/legal", `${name}.json`);
  const sourceText = await readFile(source, "utf8");
  const document = JSON.parse(sourceText);
  validateDocument(document, source);

  if (mode === "release") {
    if (document.status !== "approved" || !document.effectiveDate) {
      console.error(`${name}.json is a draft or has no approved effective date.`);
      failed = true;
    }
    continue;
  }

  if (mode === "check") {
    let assetText = "";
    try {
      assetText = await readFile(asset, "utf8");
    } catch {
      console.error(`Missing generated mobile asset: ${asset}`);
      failed = true;
      continue;
    }
    if (assetText !== sourceText) {
      console.error(`Mobile legal asset differs from canonical content: ${name}.json`);
      failed = true;
    }
  } else {
    await writeFile(asset, sourceText);
    console.log(`Synced ${name}.json`);
  }
}

if (failed) process.exitCode = 1;

function validateDocument(document, source) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`${source} must contain an object.`);
  }
  if (document.schemaVersion !== 1 || !names.includes(document.id)) {
    throw new Error(`${source} has an unsupported schema or document ID.`);
  }
  if (!['draft', 'approved'].includes(document.status)) {
    throw new Error(`${source} has an invalid publication status.`);
  }
  if (document.status === "approved" && !/^\d{4}-\d{2}-\d{2}$/.test(document.effectiveDate ?? "")) {
    throw new Error(`${source} needs an approved effective date.`);
  }
  if (document.status === "draft" && document.effectiveDate !== null) {
    throw new Error(`${source} must not give a draft an effective date.`);
  }
  if (!Array.isArray(document.sections) || document.sections.length === 0) {
    throw new Error(`${source} has no sections.`);
  }
  const sectionIds = new Set();
  for (const section of document.sections) {
    if (!section || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id ?? "") || sectionIds.has(section.id) || !Array.isArray(section.blocks) || section.blocks.length === 0) {
      throw new Error(`${source} has an invalid or duplicate section.`);
    }
    sectionIds.add(section.id);
    for (const block of section.blocks) {
      if (block?.type === "paragraph" && typeof block.text === "string" && block.text.trim()) continue;
      if (block?.type === "list" && Array.isArray(block.items) && block.items.length > 0 && block.items.every((item) => typeof item === "string" && item.trim())) continue;
      if (block?.type === "link" && typeof block.label === "string" && ["/privacy", "/terms"].includes(block.href)) continue;
      throw new Error(`${source} has an unsupported block.`);
    }
  }
}
