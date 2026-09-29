import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const tsModule = await import(resolve(repositoryRoot, "apps/api/node_modules/typescript/lib/typescript.js"));
const ts = tsModule.default ?? tsModule;
const featureRoot = resolve(repositoryRoot, "apps/api/src/features");
const fixtureMarker = ".boundary-fixture.ts";
const allowedFeatureRootFiles = new Set([
  "auth",
  "permissions",
]);
const groupingDirectories = new Set(["messages", "conversations", "push", "realtime"]);

async function collectTypeScriptFiles(directory, includeFixtures = false) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || (!includeFixtures && entry.name === "__boundary_fixtures__")) continue;
      files.push(...await collectTypeScriptFiles(path, includeFixtures));
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
    if (!includeFixtures && entry.name.endsWith(fixtureMarker)) continue;
    files.push(path);
  }
  return files;
}

function normalized(path) {
  return path.split(sep).join("/");
}

function featureRelative(path) {
  const value = relative(featureRoot, path);
  if (value.startsWith("..")) return undefined;
  return normalized(value);
}

function sourceInfo(path) {
  const value = featureRelative(path);
  if (!value) return undefined;
  const parts = value.split("/");
  const feature = parts[0];
  const fileName = parts.at(-1);
  if (!feature || !fileName) return undefined;
  const virtualName = fileName.replace(fixtureMarker, ".ts");
  const isTest = /(?:\.test|\.integration\.test)\.ts$/.test(virtualName);
  const rest = parts.slice(1);
  if (rest.length === 1) {
    return {
      path,
      feature,
      fileName: virtualName,
      isTest,
      kind: "root",
      action: undefined,
      isRegistrar: virtualName === `${feature}.routes.ts`,
    };
  }
  if (rest.includes("shared")) {
    return { path, feature, fileName: virtualName, isTest, kind: "shared", action: undefined, isRegistrar: false };
  }
  if (rest[0] === "hyperdrive" && feature === "system") {
    return { path, feature, fileName: virtualName, isTest, kind: "runtime-exception", action: "hyperdrive", isRegistrar: false };
  }
  const action = groupingDirectories.has(rest[0]) ? rest[1] : rest[0];
  return { path, feature, fileName: virtualName, isTest, kind: "action", action, isRegistrar: false };
}

function resolveImport(sourcePath, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(sourcePath), specifier.replace(/\.(?:js|mjs|cjs)$/, ""));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    resolve(base, "index.ts"),
  ];
  return candidates.find((candidate) => candidate.endsWith(".ts") && candidate !== sourcePath && existsSync(candidate)) ?? undefined;
}

function importedSpecifiers(sourceFile) {
  const specifiers = [];
  function add(node) {
    if (node?.text) specifiers.push({ value: node.text, node });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) add(node.argument.literal);
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
        const [argument] = node.arguments;
        if (argument && ts.isStringLiteral(argument)) add(argument);
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length > 0) {
        const [argument] = node.arguments;
        if (argument && ts.isStringLiteral(argument)) add(argument);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function isOutsideFeatureImport(targetPath) {
  const value = normalized(relative(repositoryRoot, targetPath));
  return !value.startsWith("apps/api/src/features/");
}

function isApprovedAdapter(targetPath) {
  const value = normalized(relative(repositoryRoot, targetPath));
  return value.startsWith("apps/api/src/http/") || value.startsWith("apps/api/src/infrastructure/");
}

function isWorkspaceImport(specifier) {
  return specifier.startsWith("@dayli/");
}

function describe(info) {
  return `${normalized(relative(repositoryRoot, info.path))} (${info.kind}${info.action ? `/${info.action}` : ""})`;
}

function allowedBoundary(source, target, specifier) {
  if (isWorkspaceImport(specifier) || !specifier.startsWith(".")) return true;
  if (!target) return true;
  if (isOutsideFeatureImport(target) || isApprovedAdapter(target)) {
    const targetValue = normalized(relative(repositoryRoot, target));
    if (targetValue === "apps/api/src/app.ts" || targetValue === "apps/api/src/index.ts") return source.isTest;
    return true;
  }

  const targetInfo = sourceInfo(target);
  if (!targetInfo) return true;
  if (source.feature === "auth" || source.feature === "permissions") return true;

  if (source.feature !== targetInfo.feature) {
    return source.isTest && targetInfo.feature === "auth";
  }

  if (source.kind === "root" && source.isRegistrar) {
    return targetInfo.kind === "action" && targetInfo.fileName.endsWith(".route.ts")
      || targetInfo.kind === "shared";
  }

  if (source.kind === "runtime-exception") return true;

  if (source.kind === "shared") {
    if (targetInfo.kind === "shared") return true;
    if (source.isTest && targetInfo.kind === "root" && targetInfo.isRegistrar) return true;
    return source.isTest && source.fileName.endsWith(".repository.integration.test.ts");
  }

  if (source.kind === "action") {
    if (targetInfo.kind === "shared") return true;
    if (targetInfo.kind === "action" && targetInfo.action === source.action) return true;
    if (source.isTest && targetInfo.kind === "root" && targetInfo.isRegistrar) return true;
  }

  return false;
}

function lintRootFile(info) {
  if (info.kind !== "root") return undefined;
  if (allowedFeatureRootFiles.has(info.feature)) return undefined;
  if (info.isRegistrar) return undefined;
  return `${describe(info)} is a feature-root implementation. Keep only ${info.feature}.routes.ts at this level.`;
}

async function checkFile(path, errors) {
  const source = sourceInfo(path);
  if (!source) return;
  const rootError = lintRootFile(source);
  if (rootError) errors.push(rootError);
  const contents = await readFile(path, "utf8");
  const parsed = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const { value: specifier } of importedSpecifiers(parsed)) {
    const targetPath = resolveImport(path, specifier);
    if (!allowedBoundary(source, targetPath, specifier)) {
      const target = targetPath ? sourceInfo(targetPath) : undefined;
      errors.push(`${describe(source)} imports ${target ? describe(target) : specifier}. Action internals must stay within their action or approved shared adapters.`);
    }
  }
}

async function runFixtureChecks(errors) {
  const fixtureDirectory = resolve(featureRoot, "messaging/messages/send-message");
  const fixtureNames = (await readdir(fixtureDirectory)).filter((name) => name.endsWith(fixtureMarker));
  const fixturePaths = fixtureNames.map((name) => resolve(fixtureDirectory, name));
  fixturePaths.push(resolve(featureRoot, "messaging/messaging.routes.boundary-fixture.ts"));
  const before = errors.length;
  for (const path of fixturePaths) await checkFile(path, errors);
  const fixtureErrors = errors.splice(before);
  const expected = [
    "send-message.boundary-fixture.ts",
    "send-message.type-only.boundary-fixture.ts",
    "send-message.re-export.boundary-fixture.ts",
    "send-message.dynamic.boundary-fixture.ts",
    "send-message.feature.boundary-fixture.ts",
    "send-message.shared.boundary-fixture.ts",
    "send-message.app.test.boundary-fixture.ts",
    "send-message.workspace.boundary-fixture.ts",
    "messaging.routes.boundary-fixture.ts",
  ];
  const errorsByFile = new Map(expected.map((name) => [name, fixtureErrors.filter((error) => error.includes(name))]));
  const passingFixtures = new Set([
    "send-message.shared.boundary-fixture.ts",
    "send-message.app.test.boundary-fixture.ts",
    "send-message.workspace.boundary-fixture.ts",
    "messaging.routes.boundary-fixture.ts",
  ]);
  for (const name of expected) {
    const failed = errorsByFile.get(name) ?? [];
    if (passingFixtures.has(name)) {
      if (failed.length > 0) errors.push(...failed);
    } else if (failed.length === 0) {
      errors.push(`Boundary fixture ${name} did not fail as expected.`);
    }
  }
}

async function main() {
  const files = await collectTypeScriptFiles(featureRoot);
  const errors = [];
  for (const file of files) await checkFile(file, errors);
  await runFixtureChecks(errors);
  if (errors.length > 0) {
    console.error("API action boundary check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

await main();
