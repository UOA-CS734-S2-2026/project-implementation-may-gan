# API client generation

Dayli generates its TypeScript and Dart clients from the committed OpenAPI document. Do not edit generated files by hand.

## Requirements

Install Node.js 24, pnpm 10, Java 17, and the stable Dart SDK. OpenAPI Generator needs Java. Dart formats and checks the generated mobile client.

## Generate the clients

Run this command from the repository root:

```bash
pnpm generate:clients
```

The command performs four steps:

1. Builds `packages/contracts/openapi.json` from the registered Hono routes.
2. Removes the previous generated clients so deleted operations cannot leave stale files.
3. Generates `packages/api-client-typescript` with the `typescript-fetch` generator.
4. Generates and formats `packages/api-client-dart` with the `dart` generator.

OpenAPI Generator CLI is pinned in `package.json`. Its Java generator version is pinned in `openapitools.json`. Review generator upgrades like dependency upgrades because they can change every generated file.

## Changing an API contract

Update the route contract and its tests, then run:

```bash
pnpm generate:clients
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Commit the OpenAPI document, both generated clients, and the lockfile changes together. Generated files contain a notice that warns against manual edits.

## CI checks

CI regenerates both clients and runs `git diff --exit-code`. A contract change fails CI when its generated output was not committed. CI also builds the TypeScript workspace and runs `dart analyze` against the Dart package.

The clients handle HTTP paths, parameters, JSON conversion, and response types. Authentication token storage, retries, offline state, and user-facing errors remain application code.
