---
title: Contracts and generated clients
description: Keep Dayli's OpenAPI document, TypeScript client, and Dart client in sync with the API.
---

# Contracts and generated clients

Contract checks test the agreement between an API and the applications using it. That agreement describes the requests an app can send and the responses it should receive. Generated clients turn those definitions into code the frontend can use to call the API.

These checks matter because the backend and frontend can get out of sync. If an API field changes but a client still expects the old format, a feature can fail even though both projects build successfully. Checking the generated files helps catch that mismatch before someone uses the app.

Dayli generates its OpenAPI description from the backend and uses it to generate TypeScript and Dart clients for web and mobile. Our checks regenerate those files and detect changes that haven't been committed. For example, they also check that an Auckland calendar date remains a date-only string instead of being converted into a timestamp. This checks the contract, not whether every API request works at runtime.

Run commands on this page from the repository root.

## Where Dayli uses these tests

The contract starts in the API route definitions and is collected by `apps/api/src/app.ts`. `scripts/generate-openapi.ts` requests `/api/v1/openapi.json` from that app in process and writes `packages/contracts/openapi.json`.

Generated consumers live in:

- `packages/api-client-typescript`, used by the web app
- `packages/api-client-dart`, used by the Flutter app

The generation pipeline is defined in the root `package.json`. `scripts/clean-generated-clients.ts` prepares the output directories, and `scripts/finalize-generated-clients.ts` applies repository-specific finishing steps. `scripts/check-generated-clients.ts` checks Git status for changed generated paths and verifies authentication, operation, and date-only-string contracts. Mobile has extra decoding checks in `apps/mobile/test/generated_client_nullability_test.dart` and `apps/mobile/test/generated_post_decoding_test.dart`.

## Check the generated contract

The required check is:

```bash
pnpm generate:clients:check
```

It requires Node, pnpm, Dart, and JDK 17. The OpenAPI Generator runs on Java, and the repository's full local verifier rejects another `javac` major version. Install dependencies with the locked pnpm version before running it.

This command is not read-only. It runs `pnpm generate:clients`, which rewrites the tracked OpenAPI document and both generated client packages before checking them. Review your working tree first, especially if you already have edits under those paths:

```bash
git status --short -- packages/contracts packages/api-client-typescript packages/api-client-dart
pnpm generate:clients:check
git diff -- packages/contracts packages/api-client-typescript packages/api-client-dart
```

Do not discard changes blindly after the check. A diff may be the expected result of an API change and needs to be reviewed and committed with that change.

## Example: keep an Auckland date as a date

Dayli's `localDate` values represent an Auckland calendar date such as `2026-09-27`. They are not instants with a time zone. If a generated client parsed one as a timestamp, a consumer could shift it to another day.

The generation commands map OpenAPI `date` values to `string` in TypeScript and `String` in Dart. `scripts/check-generated-clients.ts` then looks for the expected model declarations and Dart JSON conversion:

```ts
const checks = [
  [
    "TypeScript localDate is a date-only string",
    /localDate: string;/.test(typescriptModel),
  ],
  [
    "Dart localDate is a date-only string",
    /final String localDate;/.test(dartModel),
  ],
  [
    "Dart localDate stays a string during JSON conversion",
    /localDate: mapValueOfType<String>/.test(dartModel),
  ],
];
```

This check belongs at the contract layer because it compares the generated representations used by both apps. The domain unit tests still own Auckland midnight calculations, and app tests own what each screen does with the value.

## Change an API contract safely

When a route request, response, or operation ID changes:

1. Update the source contract and route implementation.
2. Run `pnpm generate:clients` to regenerate the OpenAPI document and both clients.
3. Review every generated diff. Unexpected removals or broad renames usually mean the source contract changed more than intended.
4. Update web and mobile callers for the new generated types.
5. Run `pnpm generate:clients:check` once the expected generated files are present.
6. Run the focused API and app behavior tests for the feature.

`pnpm generate:clients:check` regenerates first, then uses `git status --porcelain` for the generated paths. In a clean checkout, any resulting change means tracked output was stale. In a working tree where you intentionally regenerated files, those expected modifications remain visible, so the command can still report them as changed. This is why the full check is most conclusive against the committed state used by verification.

## What this check proves

It checks that the repository's OpenAPI document and generated clients agree with the current API definitions. It also checks selected Dayli invariants in the generated output, including bearer-auth support, relationship methods, and date-only fields.

It does not start Next.js, Flutter, PostgreSQL, or a deployed Worker. It cannot prove that a route implements its documented response correctly, that the web app sends a request at the right time, or that an older released app remains compatible with a newly deployed API.

Use [unit and component tests](./unit-and-component-tests) for caller behavior, [end-to-end tests](./end-to-end-tests) for a local journey, and reviewed staging checks for deployed compatibility. Contract generation is necessary when the API changes, but it is not a replacement for those layers.
