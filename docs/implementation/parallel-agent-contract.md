# Parallel implementation coordination contract

This records the initial integration agreement for the approved two-PR implementation. Use `implementor-terra` for both implementation agents. Follow the backend architecture and the two implementation plans. Changes to this agreement must be reported to the orchestrator before another agent is expected to consume them.

## Branches and ownership

- `refactor/backend-action-slices`: existing backend, shared auth, shared pair-lock extraction, generic test infrastructure, mobile integration-test setup, safe ordinary CI restoration subject to existing approval gates.
- `feature/messaging`: new messaging backend, schema, infrastructure, web/Flutter feature code and feature tests.
- Both start at the committed documentation baseline. Messaging later rebases onto the reviewed refactor branch, with its PR targeting that branch. Refactor merges first; no agent merges or deploys.
- Each agent commits focused, buildable changes with relevant tests. Do not rewrite another agent's branch. Report commit hashes and shared integration requirements to the orchestrator.

## Shared interfaces to implement first in the refactor branch

- `apps/api/src/http/authenticated-actor.ts`: `AuthenticatedActor` with server-verified `userId: string`. Export a shared Hono environment type with `Variables.actor: AuthenticatedActor`. Existing HTTP actions need not fabricate session IDs.
- `apps/api/src/http/middleware/require-session.ts`: `createRequireSession(resolveSession)` returns typed Hono middleware. Resolver accepts a `Request`, returns the authenticated actor or null/undefined for invalid credentials, and throws on infrastructure failure. Middleware maps these to actor context, 401 or 503 respectively and preserves private no-store behavior. Use existing API error envelopes. Validate exact types against pinned Hono/Zod OpenAPI rather than casting away safety.
- Sockets need a separate verified session projection containing user ID, session ID and expiry from Better Auth. Messaging owns that narrow extension with the refactor agent's consultation; never accept client assertions or weaken ordinary authentication.
- `packages/db/src/relationship-pair-lock.ts`: export `lockRelationshipPair(transaction, leftUserId, rightUserId): Promise<void>` through `packages/db/src/index.ts`. Type transaction using the narrow existing database execute capability. Preserve sorted length-prefixed pair encoding, hash seed 734, and transaction-scoped advisory lock exactly. Relationship and messaging mutations use this same function and pair-before-conversation lock ordering.
- Feature registration stays dependency-injected and DB-free in default `createApp`. Messaging supplies `registerMessagingRoutes(api, dependencies)` from `features/messaging/messaging.routes.ts`. Its dependencies contain configured action services and auth adapters, not a global database singleton. The refactor agent owns existing composition-root edits; final messaging wiring occurs after interface integration.
- Action file names use `<action>.contract.ts`, `.route.ts`, meaningful optional `.service.ts` / `.repository.ts`, and `.route.test.ts`, `.service.test.ts`, `.repository.integration.test.ts`. Shared helpers are descriptive, owner-local files. New Cloudflare/provider adapters go under `src/infrastructure`.

## Test and integration ownership

Refactor owns generic Vitest discovery and existing integration renames, ordinary CI, and Flutter integration-test scaffolding. Messaging owns new messaging-specific tests and its realtime/web test requirements. Coordinate package manifests, lockfiles, CI jobs and configs rather than blindly taking one side of a merge.

API runtime entrypoints, app composition, env bindings, database exports, migration metadata, and mobile app scope/router/auth lifecycle are shared integration points. Messaging may prepare explicit changes in its own worktree, but must report them and reconcile with the refactor branch before final verification. Do not copy a shared auth/lock implementation into messaging to avoid the dependency.

No repository visibility change, real provider configuration, secret insertion, production database work, deployment or merge is authorized by starting these agents. Keep privileged workflows manual/protected. If ordinary Actions restoration is blocked by private-repository budget approval, report the gate and retain manual verification rather than spending unapproved minutes. No implementation should claim push/device/staging verification without evidence.
