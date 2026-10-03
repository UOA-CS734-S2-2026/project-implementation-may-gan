---
title: Worker runtime tests
description: Exercise Dayli Durable Objects and browser proxy bindings in local Cloudflare runtimes.
---

# Worker runtime tests

Some backend behavior only exists because Cloudflare Workers supplies it. A mocked Durable Object namespace cannot prove that a WebSocket upgrade reaches the right object. Calling the browser proxy as an ordinary function cannot prove that its named service binding stays separate from the public API handler.

Worker runtime tests keep that boundary real. Dayli runs the code in the Cloudflare Vitest runtime or workerd, with local bindings described by Wrangler configuration. They sit between focused API tests and a deployed staging check. They are still local, but they exercise runtime APIs that Node or jsdom does not provide.

Run commands on this page from the repository root.

## Where Dayli uses these tests

Dayli currently has three related local checks:

- `apps/api/src/infrastructure/realtime/user-realtime.runtime.test.ts` exercises the `UserRealtime` Durable Object through its namespace binding.
- `apps/api/test/browser-proxy.workerd.test.ts` sends requests through the web proxy fixture, the public API, and the named `BrowserProxyEntrypoint` service binding.
- `scripts/proxy-provenance/workerd-smoke.mjs` starts local Miniflare workers to check the fixed-destination proxy diagnostic without exposing its token or observed source value.

Their configurations live in `apps/api/vitest.realtime.config.ts`, `apps/api/vitest.proxy-integration.config.ts`, `apps/api/wrangler.proxy-integration.jsonc`, and `scripts/proxy-provenance/`. The shell entry point for the browser-proxy binding test is `scripts/test-browser-proxy-workerd.sh`.

## Run the runtime suites

Use the dedicated commands because the ordinary API test configuration does not include these runtime boundaries:

```bash
pnpm --filter @dayli/api test:realtime
pnpm --filter @dayli/api test:proxy-integration
pnpm test:proxy-provenance
```

`test:realtime` uses the Cloudflare Vitest plugin with `apps/api/wrangler.jsonc`. `test:proxy-integration` delegates to `scripts/test-browser-proxy-workerd.sh`, which runs the dedicated proxy Vitest configuration. `test:proxy-provenance` type-checks its small worker fixture, runs its diagnostic tests, then starts the caller and receiver in the Wrangler-pinned Miniflare runtime.

All three are local-only commands. They do not read deployment credentials or contact a hosted service.

## Example: reject an unverified realtime upgrade

Realtime connections carry Worker-issued session metadata to a per-user Durable Object. If the object accepted a plain WebSocket upgrade without that metadata, a caller could skip the session check before opening the connection.

The runtime test asks the real namespace for a Durable Object stub, sends an upgrade request, and checks the HTTP response:

```ts
const realtime = env.USER_REALTIME;
const stub = realtime.get(realtime.idFromName("user"));
const response = await stub.fetch(
  "https://user-realtime.internal/connect",
  { headers: { Upgrade: "websocket" } },
);

expect(response.status).toBe(401);
```

The same file supplies verified metadata for other cases. It checks that an active session reaches `101`, while expired or revoked session metadata receives `401`. Database access is mocked there because the job of this suite is the Durable Object runtime boundary, not PostgreSQL. The repository integration suite covers the database boundary separately.

## Example: keep private proxy context private

The web Worker forwards browser API requests to a named API entry point. Dayli must not accept the same internal context headers through the public API handler.

`apps/api/test/browser-proxy.workerd.test.ts` sends a forged request directly to the public handler and expects `503`. It sends malformed context to the private entry point and expects `400`. A request through the web proxy fixture can reach the health route and receives `200` with `cache-control: no-store`.

The fixture compiles the real proxy source from `apps/web/lib/api/server/browser-proxy.ts`. It does not copy the security rules into test-only code. A local adapter adds a documentation-range source address because Miniflare cannot create Cloudflare edge metadata itself, then removes that local-only test header before forwarding.

This proves the binding and handler separation in local workerd. It does not prove which headers the deployed Cloudflare edge owns.

## Choosing the boundary

Use a Worker runtime test when behavior depends on a Cloudflare runtime object or binding:

- Durable Object namespaces and object instances
- WebSocket upgrade behavior in a Worker
- named service bindings and Worker entry points
- local workerd request metadata handling
- a multi-Worker call path that Node cannot represent faithfully

Use an ordinary API test when a request can be checked through Hono with controlled dependencies. Use a [PostgreSQL integration test](./integration-tests) when SQL or transaction behavior is the reason for the test. Keeping one main boundary real makes failures easier to diagnose.

## Limits

The Cloudflare Vitest plugin and Miniflare reproduce local Worker behavior, not the deployed edge. These suites do not prove Cloudflare routing, DNS, environment bindings, remote Hyperdrive connectivity, edge-owned header provenance, or deployed secrets.

`pnpm test:proxy-provenance` uses fixed local workers and synthetic values. Its name refers to a diagnostic contract, not a live edge check. A comment in `workerd-smoke.mjs` makes the boundary explicit: Worker execution is proven, Cloudflare edge header ownership is not.

Use the protected [staging checks](./staging-and-manual-checks) when the question depends on remote bindings. Do not add account tokens to a local runtime test to make it contact staging.
