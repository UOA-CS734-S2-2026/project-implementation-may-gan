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

## Verification checks

GitHub-hosted PR and push verification is temporarily paused. `pnpm verify:local` regenerates both clients and checks scoped `git status --porcelain --untracked-files=all` output. This catches changed, deleted, and newly generated files. It also builds the TypeScript workspace, analyzes the Dart package, and runs its smoke test. A manual GitHub workflow dispatch remains available for later restoration, but it consumes GitHub-hosted minutes.

## Base URLs

Applications must pass a base URL when constructing a client. Do not rely on the generator's `http://localhost` fallback.

| Environment | Typical URL |
| --- | --- |
| Local browser or iOS Simulator | `http://localhost:8787` |
| Android Emulator | `http://10.0.2.2:8787` |
| Android physical device over USB | `http://127.0.0.1:8787` after `adb reverse tcp:8787 tcp:8787` |
| iOS physical device | HTTPS staging URL |
| Staging or production | URL supplied by application configuration |

The exact environment-file and secret-loading setup belongs to issue #6. This package only requires callers to provide the resulting URL.

The clients handle HTTP paths, parameters, JSON conversion, and response types. Authentication token storage, retries, offline state, and user-facing errors remain application code.
