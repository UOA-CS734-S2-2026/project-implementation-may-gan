import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const apiSourceRoot = resolve(repositoryRoot, "apps/api/src");
const tsModule = await import(resolve(repositoryRoot, "apps/api/node_modules/typescript/lib/typescript.js"));
const ts = tsModule.default ?? tsModule;
const testDirectories = new Set(["__tests__", "test", "tests", "__fixtures__", "fixtures"]);

function normalized(path) {
  return path.split(sep).join("/");
}

function isRuntimeApiSource(path) {
  const sourcePath = relative(apiSourceRoot, path);
  if (sourcePath.startsWith("..") || sourcePath === "" || !sourcePath.endsWith(".ts")) return false;

  const parts = normalized(sourcePath).split("/");
  const fileName = parts.at(-1);
  if (!fileName || fileName.endsWith(".d.ts") || fileName.endsWith(".test.ts") || fileName.endsWith(".integration.test.ts") || fileName.endsWith(".setup.ts")) return false;
  return !parts.slice(0, -1).some((part) => testDirectories.has(part));
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

function isExecuteAccess(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text === "execute";
  return ts.isElementAccessExpression(node)
    && node.argumentExpression !== undefined
    && (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
    && node.argumentExpression.text === "execute";
}

function isBoundExecuteAccess(node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "bind"
    && isExecuteAccess(node.expression.expression);
}

function importedDayliDatabaseNames(sourceFile) {
  const names = new Set(["DayliDatabase"]);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "@dayli/db") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "DayliDatabase") names.add(element.name.text);
    }
  }
  return names;
}

function isDayliDatabaseType(node, names) {
  return ts.isTypeReferenceNode(node)
    && ts.isIdentifier(node.typeName)
    && names.has(node.typeName.text);
}

function containsExecuteKey(node) {
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return node.literal.text === "execute";
  return ts.isUnionTypeNode(node) && node.types.some(containsExecuteKey);
}

function collectDatabaseTypeAliases(sourceFile, names) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const statement of sourceFile.statements) {
      if (!ts.isTypeAliasDeclaration(statement) || !isDayliDatabaseType(statement.type, names) || names.has(statement.name.text)) continue;
      names.add(statement.name.text);
      changed = true;
    }
  }
}

function bindingName(binding) {
  return ts.isIdentifier(binding) ? binding.text : undefined;
}

function isExecutePropertyName(propertyName) {
  if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) return propertyName.text === "execute";
  return ts.isComputedPropertyName(propertyName)
    && (ts.isStringLiteral(propertyName.expression) || ts.isNoSubstitutionTemplateLiteral(propertyName.expression))
    && propertyName.expression.text === "execute";
}

function bindingElementUsesExecute(element) {
  const propertyName = element.propertyName;
  if (!propertyName) return ts.isIdentifier(element.name) && element.name.text === "execute";
  return isExecutePropertyName(propertyName);
}

function collectExecuteAliases(sourceFile) {
  const aliases = new Set();
  let changed = true;

  function visit(node) {
    if (ts.isBindingElement(node) && bindingElementUsesExecute(node)) {
      const name = bindingName(node.name);
      if (name) aliases.add(name);
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isExecuteAccess(node.initializer) || isBoundExecuteAccess(node.initializer)
        || ts.isIdentifier(node.initializer) && aliases.has(node.initializer.text)) {
        aliases.add(node.name.text);
      }
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      if (isExecuteAccess(node.right) || isBoundExecuteAccess(node.right)
        || ts.isIdentifier(node.right) && aliases.has(node.right.text)) {
        aliases.add(node.left.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  while (changed) {
    const before = aliases.size;
    visit(sourceFile);
    changed = aliases.size !== before;
  }
  return aliases;
}

function location(path, sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${normalized(relative(repositoryRoot, path))}:${position.line + 1}:${position.character + 1}`;
}

function inspectSource(path, contents) {
  if (!isRuntimeApiSource(path)) return [];

  const sourceFile = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const databaseTypes = importedDayliDatabaseNames(sourceFile);
  collectDatabaseTypeAliases(sourceFile, databaseTypes);
  const aliases = collectExecuteAliases(sourceFile);
  const errors = [];

  function report(node, message) {
    errors.push(`${location(path, sourceFile, node)} ${message}`);
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (isExecuteAccess(node.expression)) {
        report(node.expression, "Runtime Drizzle execute() is not allowed. Use select, insert, update, or delete builders instead.");
      } else if (ts.isIdentifier(node.expression) && aliases.has(node.expression.text)) {
        report(node.expression, "Runtime Drizzle execute() alias is not allowed. Use select, insert, update, or delete builders instead.");
      } else if (ts.isPropertyAccessExpression(node.expression)
        && (node.expression.name.text === "call" || node.expression.name.text === "apply")
        && ts.isIdentifier(node.expression.expression)
        && aliases.has(node.expression.expression.text)) {
        report(node.expression, "Runtime Drizzle execute() alias is not allowed. Use select, insert, update, or delete builders instead.");
      }
    }

    if (ts.isTypeReferenceNode(node)
      && ts.isIdentifier(node.typeName)
      && node.typeName.text === "Pick"
      && node.typeArguments?.length === 2
      && isDayliDatabaseType(node.typeArguments[0], databaseTypes)
      && containsExecuteKey(node.typeArguments[1])) {
      report(node, "DayliDatabase execute capability is not allowed. Use builder capabilities instead.");
    }

    if (ts.isIndexedAccessTypeNode(node)
      && isDayliDatabaseType(node.objectType, databaseTypes)
      && containsExecuteKey(node.indexType)) {
      report(node, "DayliDatabase execute capability is not allowed. Use builder capabilities instead.");
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return errors;
}

async function inspectFile(path) {
  return inspectSource(path, await readFile(path, "utf8"));
}

async function verifyFixtures() {
  const fixtureRoot = resolve(repositoryRoot, "scripts/check-api-drizzle-queries-fixtures");
  const fixtures = [
    ["positive/allowed.test.ts", "apps/api/src/features/example/allowed.test.ts", 0],
    ["positive/allowed.setup.ts", "apps/api/src/features/example/allowed.setup.ts", 0],
    ["positive/database-diagnostic.ts", "packages/db/src/diagnostics/database-diagnostic.ts", 0],
    ["positive/builder-sql-fragment.ts", "apps/api/src/features/example/builder-sql-fragment.ts", 0],
    ["negative/feature.ts", "apps/api/src/features/example/feature.ts", 1],
    ["negative/infrastructure.ts", "apps/api/src/infrastructure/example/infrastructure.ts", 1],
    ["negative/app.ts", "apps/api/src/app.ts", 1],
    ["negative/auth.ts", "apps/api/src/features/auth/auth.ts", 1],
    ["negative/bracket.ts", "apps/api/src/features/example/bracket.ts", 1],
    ["negative/type-only.ts", "apps/api/src/features/example/type-only.ts", 1],
    ["negative/alias.ts", "apps/api/src/features/example/alias.ts", 1],
    ["negative/destructure.ts", "apps/api/src/features/example/destructure.ts", 1],
  ];
  const errors = [];
  for (const [fixture, virtualPath, expectedCount] of fixtures) {
    const contents = await readFile(resolve(fixtureRoot, fixture), "utf8");
    const found = inspectSource(resolve(repositoryRoot, virtualPath), contents);
    if (found.length !== expectedCount) {
      errors.push(`Fixture ${fixture} expected ${expectedCount} violation(s), found ${found.length}.`);
    }
  }
  return errors;
}

async function main() {
  const fixtureErrors = await verifyFixtures();
  if (fixtureErrors.length > 0) {
    console.error("Drizzle API query policy fixture check failed:");
    for (const error of fixtureErrors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes("--fixtures")) return;

  const files = await collectTypeScriptFiles(apiSourceRoot);
  const errors = (await Promise.all(files.map(inspectFile))).flat();
  if (errors.length > 0) {
    console.error("Drizzle API query policy check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

await main();
