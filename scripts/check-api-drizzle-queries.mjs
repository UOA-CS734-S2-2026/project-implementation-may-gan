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

function isBoundExecuteAccess(node, isDatabaseSource) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "bind"
    && isExecuteAccess(node.expression.expression)
    && isDatabaseSource(node.expression.expression.expression);
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

function bindingNames(binding) {
  if (ts.isIdentifier(binding)) return [binding.text];
  if (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) {
    return binding.elements.flatMap((element) => ts.isBindingElement(element) ? bindingNames(element.name) : []);
  }
  return [];
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

function collectExecuteAliases(sourceFile, databaseTypes) {
  const database = "database";
  const executeAlias = "executeAlias";
  const none = "none";

  function createScope(parent) {
    return { bindings: new Map(), parent };
  }

  function lookup(scope, name) {
    for (let current = scope; current; current = current.parent) {
      if (current.bindings.has(name)) return current.bindings.get(name);
    }
    return none;
  }

  function assign(scope, name, value) {
    for (let current = scope; current; current = current.parent) {
      if (current.bindings.has(name)) {
        current.bindings.set(name, value);
        return;
      }
    }
    scope.bindings.set(name, value);
  }

  function isDatabaseSource(node, scope) {
    while (ts.isParenthesizedExpression(node)
      || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node)
      || ts.isNonNullExpression(node)
      || ts.isSatisfiesExpression(node)) {
      node = node.expression;
    }
    return ts.isIdentifier(node) && lookup(scope, node.text) === database;
  }

  function isExecuteAlias(node, scope) {
    return ts.isIdentifier(node) && lookup(scope, node.text) === executeAlias
      || isExecuteAccess(node) && isDatabaseSource(node.expression, scope)
      || isBoundExecuteAccess(node, (source) => isDatabaseSource(source, scope));
  }

  function isTransactionCallback(node, scope) {
    const call = node.parent;
    return (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
      && ts.isCallExpression(call)
      && ts.isPropertyAccessExpression(call.expression)
      && call.expression.name.text === "transaction"
      && isDatabaseSource(call.expression.expression, scope);
  }

  function predeclareStatements(statements, scope) {
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          for (const name of bindingNames(declaration.name)) scope.bindings.set(name, none);
        }
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        scope.bindings.set(statement.name.text, none);
      }
    }
  }

  function visitStatements(statements, parent) {
    const scope = createScope(parent);
    predeclareStatements(statements, scope);
    for (const statement of statements) visit(statement, scope);
  }

  function visitVariableDeclaration(node, scope) {
    let value = none;
    if (node.initializer && isDatabaseSource(node.initializer, scope)) value = database;
    else if (node.initializer && isExecuteAlias(node.initializer, scope)) value = executeAlias;
    else if (node.type && isDayliDatabaseType(node.type, databaseTypes)) value = database;

    if (ts.isIdentifier(node.name)) {
      assign(scope, node.name.text, value);
    } else if (ts.isObjectBindingPattern(node.name)) {
      const destructuresDatabase = node.initializer && isDatabaseSource(node.initializer, scope);
      for (const element of node.name.elements) {
        for (const name of bindingNames(element.name)) {
          assign(scope, name, destructuresDatabase && bindingElementUsesExecute(element) ? executeAlias : none);
        }
      }
    } else {
      for (const name of bindingNames(node.name)) assign(scope, name, none);
    }

    ts.forEachChild(node, (child) => visit(child, scope));
  }

  function visitFunction(node, parent) {
    const scope = createScope(parent);
    const transaction = isTransactionCallback(node, parent);
    for (const [index, parameter] of node.parameters.entries()) {
      const value = index === 0 && transaction || parameter.type && isDayliDatabaseType(parameter.type, databaseTypes)
        ? database
        : none;
      for (const name of bindingNames(parameter.name)) scope.bindings.set(name, value);
    }
    if (node.body) visit(node.body, scope);
  }

  function visit(node, scope) {
    if (ts.isSourceFile(node)) {
      predeclareStatements(node.statements, scope);
      for (const statement of node.statements) visit(statement, scope);
      return;
    }

    if (ts.isBlock(node)) {
      visitStatements(node.statements, scope);
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      visitVariableDeclaration(node, scope);
      return;
    }

    if (ts.isFunctionLike(node)) {
      visitFunction(node, scope);
      return;
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      assign(scope, node.left.text, isDatabaseSource(node.right, scope)
        ? database
        : isExecuteAlias(node.right, scope) ? executeAlias : none);
    }

    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && lookup(scope, node.expression.text) === executeAlias) {
        aliases.push(node.expression);
      } else if (ts.isPropertyAccessExpression(node.expression)
        && (node.expression.name.text === "call" || node.expression.name.text === "apply")
        && ts.isIdentifier(node.expression.expression)
        && lookup(scope, node.expression.expression.text) === executeAlias) {
        aliases.push(node.expression);
      }
    }

    ts.forEachChild(node, (child) => visit(child, scope));
  }

  const aliases = [];
  visit(sourceFile, createScope());
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
  const aliasCalls = new Set(collectExecuteAliases(sourceFile, databaseTypes));
  const errors = [];

  function report(node, message) {
    errors.push(`${location(path, sourceFile, node)} ${message}`);
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (isExecuteAccess(node.expression)) {
        report(node.expression, "Runtime Drizzle execute() is not allowed. Use select, insert, update, or delete builders instead.");
      } else if (aliasCalls.has(node.expression)) {
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
    ["positive/unrelated-execute-alias.ts", "apps/api/src/features/example/unrelated-execute-alias.ts", 0],
    ["positive/scoped-execute-alias.ts", "apps/api/src/features/example/scoped-execute-alias.ts", 0],
    ["negative/feature.ts", "apps/api/src/features/example/feature.ts", 1],
    ["negative/infrastructure.ts", "apps/api/src/infrastructure/example/infrastructure.ts", 1],
    ["negative/app.ts", "apps/api/src/app.ts", 1],
    ["negative/auth.ts", "apps/api/src/features/auth/auth.ts", 1],
    ["negative/bracket.ts", "apps/api/src/features/example/bracket.ts", 1],
    ["negative/type-only.ts", "apps/api/src/features/example/type-only.ts", 1],
    ["negative/alias.ts", "apps/api/src/features/example/alias.ts", 1],
    ["negative/destructure.ts", "apps/api/src/features/example/destructure.ts", 1],
    ["negative/bind.ts", "apps/api/src/features/example/bind.ts", 1],
    ["negative/transaction-alias.ts", "apps/api/src/features/example/transaction-alias.ts", 1],
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
