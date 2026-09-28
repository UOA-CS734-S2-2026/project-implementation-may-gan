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
| Local browser or iOS Simulator | `https://localhost:8787` after `pnpm local:auth:setup` and `pnpm dev:api:https` |
| Android Emulator or USB-connected development device | `https://localhost:8787` works in a debug build with `adb reverse tcp:8787 tcp:8787` and the mkcert root passed as `DAYLI_DEV_CA_PEM_B64`. Dart HTTP ignores CAs installed on the device. It is not a LAN-accessible endpoint. |
| iOS physical device | A reachable HTTPS API whose certificate the device trusts. The staging API is deployed but not yet validated. |
| Staging or production | URL supplied by application configuration after that environment is provisioned. Production is not deployed. |

The local HTTPS setup is in [Environments](environments.md). The staging API Worker passed its private Hyperdrive proof. Manual staging checks observed browser Google sign-in, refresh, and logout, plus Resend password recovery, new-password sign-in, and old-password rejection. Android Google sign-in succeeded with a distinct account, but Android persistence/logout and all iOS coverage remain untested. The explicit Google-link change still needs staging validation. Each client still needs the exact staging API origin. This package only requires callers to provide the resulting URL.

The clients handle HTTP paths, parameters, JSON conversion, and response types. Authentication token storage, retries, offline state, and user-facing errors remain application code.
