# Browser proxy verification

Run the local service-binding test with:

```bash
pnpm --filter @dayli/api test:proxy-integration
```

It starts two workerd services through the existing Cloudflare Vitest plugin. The web fixture can call only API's `BrowserProxyEntrypoint` through a named service binding. It uses a fixed local edge source because Miniflare cannot attach Cloudflare ingress metadata to a request.

The test checks that a public API request with forged private proxy headers stays on the normal ingress path. It also checks that the named entrypoint rejects missing private context, accepts the local edge context, and returns `Cache-Control: no-store`.

This is not proof that Cloudflare protects `cf-connecting-ip` from a real browser at the edge. The web helper's cross-runtime request reconstruction and streaming body behavior remain covered by `apps/web/lib/api/server/browser-proxy.test.ts`. The local workerd test does not claim to verify a POST body from a `404` response.

The production Better Auth cookie lifecycle is covered against disposable PostgreSQL by `apps/api/src/features/auth/postgres.integration.test.ts`, but that suite calls the API app directly. Miniflare's local Hyperdrive connection uses the PostgreSQL Cloudflare socket polyfill. When this service-binding fixture ran the same cookie flow, each closed request socket produced an unhandled `This socket has been closed` rejection after the assertion. The test therefore keeps the workerd boundary free of Hyperdrive and does not treat a process with unhandled rejections as evidence. The deployed run below closes that gap.

## Remaining deployed proof

Run this only in a reviewed staging release with separate web and API custom hosts. Do not record cookies, bearer tokens, request IDs, full addresses, or IP addresses.

1. Confirm the web Worker binding names the API Worker and `BrowserProxyEntrypoint`. Confirm the browser proxy flag is still enabled for that release.
2. From a normal browser session, sign in through the web host. Record only response status, cookie attribute names, and whether each cookie is set or deleted. Check that `/api/auth/get-session?disableCookieCache=true` returns an authenticated session through the web host.
3. Sign out, sign in again, revoke sessions, and use an expired test session. Record the status and whether a session is present. Do not copy cookie values into logs or evidence.
4. Check a realtime ticket returned to the browser uses the direct API `wss` origin. Confirm an upload reservation returns the configured R2 URL and that the browser does not send the upload through the proxy route.
5. Repeat the auth check from a second network. Compare only a salted, short-lived diagnostic bucket or server-side aggregate, never raw visitor IP values. Do not send forged forwarding or private headers to hosted endpoints.
6. Save the deployment commit, service names, sanitized statuses, and the two-network result in the approved evidence location. Do not change deployment secrets, databases, or flags while collecting this evidence.

A local workerd run cannot provide the two-network edge identity or hosted R2 proof. The local test deliberately uses no hosted service, account, email, or deployment.
