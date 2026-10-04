---
title: Repository structure
description: Find the right home for a Dayli change without turning the repository into a treasure hunt.
---

# Repository structure

A product can have a tidy screen and a very untidy codebase. Once the web app, mobile app, API, database, generated clients, and documentation all live together, the hard part is no longer finding _a_ place for a file. It is finding the place that owns the idea.

Dayli uses a monorepo so related changes can travel together. One pull request can update an API contract, its backend implementation, both generated clients, and the app that consumes it. Shared code has an explicit package rather than being copied between applications.

The useful question is: who owns this behavior? Put user-facing application code in its app, reusable rules and data definitions in the package that owns them, and repository-wide automation at the root. That keeps a small feature change small, which is a lovely quality in a codebase during assignment week.

## The big picture

The repository has four application workspaces:

| Application | Responsibility |
| --- | --- |
| `apps/web` | The Next.js and React browser app, including routes, components, feature hooks, and browser journeys. |
| `apps/mobile` | The Flutter app, including screens, app state, platform integrations, and Dart tests. |
| `apps/api` | The Hono API running on Cloudflare Workers. It owns HTTP handling, backend feature operations, runtime adapters, and API tests. |
| `apps/docs` | This Next.js and Fumadocs site, including Markdown content and the components that render it. |

The shared workspaces are more specific:

| Package | Responsibility |
| --- | --- |
| `packages/contracts` | Shared Zod and OpenAPI schemas plus the generated `openapi.json` document. |
| `packages/db` | Drizzle schema, PostgreSQL migrations, database commands, role setup, and database-focused tests. |
| `packages/domain` | Pure shared business rules, currently including Auckland day calculations, posting streaks, and account lifecycle rules. |
| `packages/legal-content` | The checked-in Terms and Privacy content consumed by the apps. |
| `packages/api-client-typescript` | The generated TypeScript API client. |
| `packages/api-client-dart` | The generated Dart API client. |

Not every reusable-looking helper belongs in a package. Code used by one API feature should usually stay with that feature. A workspace package makes sense when the repository has a real cross-application or cross-feature owner for the concept.

## How the pieces depend on each other

The broad request and generation flow looks like this:

```text
web or mobile
  -> generated API client and HTTP contract
  -> apps/api
  -> packages/domain for shared pure rules
  -> packages/db and PostgreSQL for stored data

API route definitions
  -> packages/contracts/openapi.json
  -> generated TypeScript and Dart clients
```

The arrows describe use, not permission for every package to import every other package. For example, the database package depends on shared contracts, while generated clients come from the OpenAPI document. The web and mobile apps should not bypass the API to query PostgreSQL.

The API has its own finer-grained dependency rules. Read [Backend architecture](./backend-architecture) before moving backend files between features.

## Root files and supporting directories

Some work belongs to the whole repository rather than one workspace:

- `package.json` defines the root commands and coordinates pnpm workspaces.
- `pnpm-workspace.yaml` includes `apps/*` and `packages/*`.
- `pnpm-lock.yaml` locks JavaScript and TypeScript dependencies for the workspace.
- `tsconfig.base.json`, `eslint.config.mjs`, and `drizzle.config.ts` hold shared TypeScript, lint, and database configuration.
- `scripts/` contains repository automation for local setup, verification, client generation, staging workflow contracts, and safety checks.
- `.github/` contains issue and pull request templates plus GitHub Actions workflows.
- `docs/` preserves detailed engineering decisions, implementation records, and runbooks used by maintainers.
- `apps/docs/content/docs/` contains the reader-facing documentation you are reading now.

The two documentation trees have different jobs. Add a learning or reference page to the docs app. Keep historical implementation evidence and detailed internal runbooks in the root `docs/` tree unless the material is being rewritten for the public guide.

## Where should I make a change?

Start with the behavior, then follow its owner.

| Change | Start here | Also check |
| --- | --- | --- |
| Change a web screen | The matching route, component, or feature under `apps/web` | Web component tests or `apps/web/e2e` |
| Change a mobile screen | The matching feature under `apps/mobile/lib` | `apps/mobile/test` or `integration_test` |
| Add or change an API operation | The owning action under `apps/api/src/features` | Its contract, route, service or repository, and feature-owned tests |
| Change a reusable business rule | Its owner in `packages/domain` | API and client callers that rely on the result |
| Change stored data | `packages/db/src` and `packages/db/migrations` | API repositories, migration checks, and PostgreSQL integration tests |
| Change an API request or response | The action contract and shared contract package where applicable | Regenerated OpenAPI and client output |
| Change legal copy | The approved legal source and `packages/legal-content` | The legal sync and release checks |
| Change repository automation | `scripts/`, root configuration, or `.github/workflows` | The matching script or workflow contract tests |
| Explain the project | `apps/docs/content/docs` | Existing pages, so the new explanation links rather than repeats |

For API tests, our target convention is an `__tests__` directory under the owning action, shared module, or infrastructure directory. Messaging already uses this layout, but migrating the remaining API tests is pending. Shared helpers stay in `apps/api/test/support`, and architecture fixtures stay in `apps/api/test/boundaries`.

This is an API-specific convention. Web tests currently use both component folders and `apps/web/tests`; mobile uses `apps/mobile/test` and `apps/mobile/integration_test`. Shared-package tests keep their existing layout. See [Backend architecture](./backend-architecture) for the target API tree and [Testing](./testing) for current executable commands.

## Adding a feature without scattering it

Suppose you add a backend action that changes a post. Begin in the `posts` feature, create an action directory if the action does not exist, and keep its HTTP adapter, operation logic, persistence, contract, and focused tests there. Only move a rule to `posts/shared` when more than one post action genuinely owns it. Only move it to `packages/domain` when it is a pure rule shared beyond that API feature.

The same ownership idea applies to apps. A post composer hook belongs with the web posting feature, not in a global utilities folder just because a second function might use it later. Share code after shared ownership becomes real.

A complete feature may touch several workspaces. That is expected. The monorepo keeps those related edits reviewable in one place, while each file still has one clear owner.

## Generated files

Generated code is an output, not a good place for a hand edit. The main generated paths are:

- `packages/contracts/openapi.json`
- `packages/api-client-typescript`
- `packages/api-client-dart`
- `apps/docs/content/api-reference`, produced for the documentation API reference

After changing API route contracts, regenerate both clients from the repository root:

```bash
pnpm generate:clients
```

To regenerate and confirm that the checked-in clients match their source, run:

```bash
pnpm generate:clients:check
```

The docs site has its own OpenAPI page generator:

```bash
pnpm --filter docs generate:openapi
```

Review generated diffs, but fix a surprising result at its source. Editing a generated model directly is a very temporary victory because the next generation run will replace it.

Legal content also has a source-to-output check. Use `pnpm legal:sync` when updating its approved source and `pnpm legal:check` to verify parity. Do not guess which legal copy is authoritative from a rendered screen.

## A quick orientation routine

When you pick up an unfamiliar issue:

1. Name the behavior and the app or package that owns it.
2. Find a nearby implemented feature with the same shape.
3. Read its tests before adding folders or abstractions.
4. Check root scripts before inventing a new command.
5. Regenerate checked-in outputs when their source changes.
6. Run the narrow check while working, then follow the [Testing guide](./testing) before review.

If you still cannot decide between two homes, choose the narrowest existing owner. It is easier to promote genuinely shared code later than to untangle a global helper that quietly became everyone's problem.
