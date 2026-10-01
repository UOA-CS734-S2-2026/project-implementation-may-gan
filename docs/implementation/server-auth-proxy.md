# Server-side auth through a portable web-to-API proxy

Status: proposed implementation plan with a narrow local Phase 1 code slice. No deployed Cloudflare proof accompanies this document.

Problem and decision context: [Server-side authentication context](../server-auth-context.md).

## Goal

Let the web server validate the browser session before rendering or redirecting, without waiting for client hydration. Keep Better Auth and business logic in the API service. Keep native mobile access working directly against the API.

Isolate Cloudflare transport, trusted request identity, and rate limiting behind small adapters. Moving platforms should not require changing page components or business rules merely because the transport changes.

## Scope and constraints

- Reuse the existing web Worker and API Worker. A service binding connects them; it does not add a third Worker for this feature.
- Browser REST and auth requests use the web origin's `/api/*` paths.
- The web Worker forwards supported requests to a fixed API service binding.
- Browser WebSockets remain direct to the public API using short-lived tickets obtained through proxied REST.
- R2 presigned upload PUTs remain direct to R2. Proxy only reservation and completion requests.
- Mobile keeps direct API access and its signed bearer-session flow.
- Keep cookies host-only, Secure, and HttpOnly. Do not broaden them to a parent domain.
- Protected API operations continue to enforce authentication and authorization independently of page guards.
- Do not treat URL flags or client-side session state as proof of authentication.

## Baseline and related work

This plan was written against main at `d6704a1`. At that revision, `apps/web/app/page.tsx` still uses the client-side session/profile redirect.

[PR #189](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/189) separately implements a browser redirect through `/api/auth/landing`. It is an interim solution, not a prerequisite for this plan. Reconcile its merge status before implementation. If present, replace the bounce and its `landing=signed-out` flag once server-side session checks work.

## Proposed request flow

```text
Browser -> web origin /api/* -> private binding -> API -> PostgreSQL
Browser -> web page -> server session helper -> private binding -> API
Mobile -> public API -> PostgreSQL
Browser -> direct API WebSocket, authenticated by short-lived ticket
Browser -> direct R2 PUT, authorized by presigned URL
```

A browser signs in through the web-origin proxy. The forwarded API response sets a host-only cookie on the web hostname. Subsequent page requests include that cookie, so server-side page code can ask the API to validate it.

## Current local implementation status

A narrow Phase 1 slice exists in the working tree. It is not configured for any deployed environment and does not change browser callers, Better Auth origins, cookie hosts, or the landing redirect.

- The API exports `BrowserProxyEntrypoint`, a named `WorkerEntrypoint` intended for a service-binding `fetch()` call. It validates the internal source context before it constructs the `cf-connecting-ip` header read by Better Auth and the API ingress limiter. The public API fetch handler does not use that path.
- The web app has an inactive `/api/*` route and server-only binding adapter. In a standard Next.js process, the adapter does not evaluate the Cloudflare-only bindings module and the route returns a no-store 503 response. In a Worker runtime, it loads `API_BROWSER_PROXY` dynamically. A Worker binding-loader failure is not treated as an unconfigured proxy. Browser client calls and server guards remain inactive unless the explicit proxy build flag is enabled.
- The proxy adapter strips hop-by-hop, forwarding, Cloudflare, and internal headers. It preserves request bodies as streams, browser `Origin`, cookies, authorization, idempotency headers, redirect responses, and distinct `Set-Cookie` values. It rejects upgrades, so ticket WebSockets remain direct.
- Focused local tests cover header stripping, invalid private context, source replacement, request-body streaming, manual redirects, multiple cookies, no-store responses, and the standard-Next versus Worker binding adapter behavior. Installed `@cloudflare/workers-types` 5.20260925.1 declares `Request`, `Response`, `Headers`, and byte streams RPC-serializable. Installed vinext 1.0.0-beta.13 passes `vinext check` with the new route handler.

The local opt-in also includes reusable session and username guards for the landing, protected-layout, and username-setup paths. An invalid or expired Better Auth session is its documented `200` JSON `null` response. Protected paths redirect it to sign-in, while the public landing renders normally. If a server component detects `Set-Cookie`, it redirects to a browser-facing refresh route that copies the API cookie response and returns only to a normalized safe relative path. The destination guard, rather than the refresh route, decides whether the visitor is public or must sign in. A short-lived HttpOnly loop marker limits repeated refresh attempts. The marker is not authentication evidence, the refresh route is inert while proxy mode is disabled, and unavailable validation falls back to the existing client gate. API authorization remains authoritative.

This is only a local code and type proof. It does not prove Cloudflare edge source-IP behavior, service-binding entrypoint isolation, or real Worker cookie serialization. The web Worker must bind `API_BROWSER_PROXY` to the API's `BrowserProxyEntrypoint` only after the environment names, same-account relationship, and source-identity test below are approved and verified. In particular, incoming Worker subrequests at the web edge still need a deployed decision. The current selector refuses missing or malformed `cf-connecting-ip`, but it cannot distinguish a browser from a Worker subrequest locally.

## Phase 1: prove the trust and runtime boundaries

Do not start a broad caller migration before these checks pass.

1. Confirm web and API Workers belong to the same Cloudflare account and record the intended service name per environment.
2. Verify how the installed vinext adapter exposes Worker bindings to server components and route handlers. Choose an entry-point wrapper if the adapter cannot expose them safely. Do not assume a framework API exists.
3. Prototype a private service-bound entry point that accepts a forwarded request and trusted visitor context. Prefer a private RPC entry point if the runtime supports the required request/response types and streaming. Otherwise use authenticated provenance over binding `fetch()`.
4. Verify original visitor identity at the web edge. Cloudflare same-zone subrequests can alter `x-real-ip`; cross-zone subrequests can replace the IP with a fixed value. Define how incoming Worker-originated requests are treated rather than assuming every ingress header identifies a browser directly.
5. Test multiple `Set-Cookie` headers, expired cookie deletion, OAuth redirects, streamed bodies, and response headers in the actual Worker runtime.
6. Run an approved staging proof from two independent networks, including forged forwarding headers and direct public API requests.

A binding alone is not proof that original visitor IP metadata arrives automatically. Local Wrangler tests do not establish Cloudflare edge behavior.

### Proof acceptance criteria

- Twenty requests from each of two networks produce stable, distinct source keys under the tested network conditions.
- Twenty attempts to forge forwarding headers do not change the selected source identity.
- A public API request cannot invoke the private proxy trust path or supply trusted provenance without authentication.
- Invalid proxy provenance is rejected. Do not silently fall back to one shared anonymous bucket.
- Cookie set, refresh, and deletion survive the complete Worker response pipeline.
- Logs contain request IDs and, when needed, keyed hashes of source identities, not raw cookies, tokens, OAuth codes, reset tokens, or visitor IPs.

Deploy diagnostic code only after explicit approval, with cleanup and a bounded test scope.

## Phase 2: introduce narrow platform adapters

These interfaces describe responsibilities, not final filenames or a framework to build in advance.

### API transport

Expose a request/response transport to web server code. Cloudflare uses a service binding; local or future hosts can use a fixed HTTP upstream. Never accept an upstream URL from browser input.

Keep server-only upstream configuration out of client bundles. Retain an explicit public API origin for mobile and WebSocket URLs.

An HTTP fallback must authenticate its forwarding relationship. Replacing a private binding with public `fetch()` is not safe if the API continues trusting unsigned identity headers.

### Trusted request context

Build an internal context containing verified source identity and ingress kind before invoking shared API handlers.

- Public API ingress derives identity from its own trusted edge boundary.
- Private browser ingress accepts identity only through the approved binding entry point or authenticated provenance.
- Strip client-supplied proxy/internal headers before generating trusted context.
- Do not let public callers mark themselves as private browser traffic.
- Preserve the browser `Origin` for CSRF and trusted-origin checks.

For a signed provenance implementation, specify key rotation, freshness, request binding and replay controls. Avoid ad hoc unsigned headers. A private RPC entry point may avoid signatures if its invocation boundary is verified and cannot be reached through public HTTP.

### Rate limiter

Keep policy and keys separate from storage/provider calls. Retain ingress limits and authenticated user/action limits.

Provide an adapter for the current Cloudflare native limiter. A future Redis, database, or other implementation should satisfy explicit policy semantics, not merely return the same shape.

Document normalization, expiry, approximate versus strict counters, and failure behavior. Cloudflare native limits are location-local and eventually consistent; they are not strict global quotas.

Integrate Better Auth with the same trusted source selection. If it requires an IP header, construct that header internally after provenance validation, never by trusting a public client-supplied value.

## Phase 3: proxy browser REST and auth

Implement a fixed `/api/*` proxy boundary with explicit method/path handling.

- Preserve method, query, required content headers, bodies, status, and streaming where supported.
- Forward browser session cookies and necessary authorization/idempotency headers only to the fixed API.
- Preserve individual `Set-Cookie` headers and deletion attributes.
- Handle redirects manually so OAuth redirects reach the browser rather than being followed by the server.
- Strip `Host`, hop-by-hop headers, `Upgrade`, and untrusted internal/forwarding headers.
- Keep auth and personalized responses uncached, including framework and CDN caches.
- Bound timeouts and handle aborts without logging sensitive URLs.
- Do not proxy WebSocket upgrades or arbitrary presigned destinations.

Update browser callers through shared configuration rather than scattering environment checks.

## Phase 4: auth configuration and reusable guards

Separate the browser-facing auth base URL from the public API origin. Currently the API also derives WebSocket URLs from the Better Auth base URL; decouple that first.

Configure Google callback URLs to use the web origin's `/api/auth/callback/google`. Verify password reset, verification, and explicit provider-linking flows too. Keep API and web origins in the required trusted-origin configuration without relaxing origin checks.

Add server-only helpers for session resolution, required authentication, and username readiness. Reuse them in the landing page and protected route layouts where supported. Do not rely on a layout running again on every client navigation, or on a layout to authorize server actions and data operations. Each protected operation still needs its own authorization boundary.

Evaluate request-scoped session reuse to avoid duplicate lookups. Never cache one user's session globally. Decide how session refresh `Set-Cookie` responses are propagated when a server component cannot mutate headers; prove expiry/refresh behavior rather than dropping cookies silently.

Keep a client session provider for interactive UI. Remove redundant hydration-based redirect work only after server and client behavior agree, including sign-out and expired sessions.

## Environment configuration and cutover

Use one implementation with validated environment-specific values:

| Responsibility | Local | Staging | Production |
| --- | --- | --- | --- |
| Browser auth origin | Local HTTPS web | Staging web domain | Production web domain |
| Internal transport | Local binding or authenticated HTTP adapter | Staging API binding | Production API binding |
| Public API origin | Local HTTPS API | Staging API domain | Production API domain |
| Google callback | Registered local web callback | Registered staging web callback | Registered production web callback |

Provide one documented local startup command. Use local-only synthetic identity fixtures when necessary, and ensure they cannot be enabled in a deployed environment.

Validate that bindings and public origins refer to the same environment. Inspect generated Wrangler output, not just source configuration. Confirm production domains and provisioning rather than assuming staging proves them.

The proposed lowest-scope cutover requires browser users to sign in again because existing API-host cookies are not sent to the web hostname. Obtain approval before adopting this behavior. Native bearer sessions should remain valid.

Deploy compatible API entry points before enabling web proxy mode. Record a rollback procedure: changing browser cookie hosts back can require another sign-in. Preserve secrets/session storage unless a separate security reason requires rotation. Do not add a silent cookie-transfer flow without its own security design.

## If trusted source forwarding cannot be proved

Do not ship a proxy that groups all anonymous users under one IP or accepts spoofable identity headers.

Fallback design: enforce browser ingress limits at the web edge, keep public API ingress protection for mobile/direct callers, and distinguish authenticated internal proxy traffic so downstream auth limits do not share a proxy bucket. Retain user/action limits after authentication.

Anonymous login, signup, verification, and password-reset abuse still need protection. Consider normalized account identifiers, backoff, and challenges alongside coarse source limits. Avoid account-lockout policies that let attackers deny service to another user. CORS does not stop scripts calling the public API.

Use shared storage or per-key Durable Objects if strict global limits are actually required. Do not claim native edge limits provide that guarantee.

## Local implementation status

A local, inactive Phase 1 slice is implemented. `BrowserProxyEntrypoint` is the API-only service-binding target. Its trusted-ingress adapter validates a narrow browser source context, strips caller-provided forwarding identity, and only then reconstructs the internal source header. The web route rejects upgrades, has no public-API fallback, preserves streaming and response cookies, and forces `Cache-Control: no-store`.

Browser REST and Better Auth still use the public API unless `NEXT_PUBLIC_WEB_API_PROXY_ENABLED=true` and `NEXT_PUBLIC_WEB_API_BASE_URL` is an exact HTTPS web origin. This is a build-time opt-in, not evidence to activate deployment. API configuration has a separate optional `PUBLIC_API_BASE_URL`: after an approved auth-origin change, issued realtime ticket URLs can remain on the direct API origin for mobile and WebSockets. Before cutover, it defaults to the existing Better Auth base URL.

The native Cloudflare limiter is now an adapter behind `RateLimitProvider`. Policies retain ownership of bucket choice and key construction. The server-session helper supports the local opt-in guarded paths. It reports cookie mutation explicitly, then only the browser-facing refresh route can apply the API response cookie.

No binding, callers, deployed variables, OAuth registrations, or cookie migration settings have been enabled by this work.

## Verification and completion criteria

- Proxy tests cover all supported methods, query strings, body streaming, cookies, cookie deletion, redirects, errors, timeouts, origin preservation, and header stripping.
- Security tests reject forged private provenance, arbitrary upstream destinations, cross-environment configuration, and cross-user response caching.
- Auth tests cover email signup/signin, session refresh/expiry, logout, reset, verification, Google callback/linking, and direct native bearer access.
- Browser tests cover authenticated/signed-out landing, direct protected URLs, client navigation, username setup, messaging tickets, and logout.
- Assert browser REST uses the web origin, WebSockets use the API, and R2 PUTs remain direct.
- Run desktop and mobile browser projects with isolated rate-limit fixtures, without disabling production limits.
- Run `pnpm verify:local`, relevant API/web tests, browser E2E, vinext compatibility check and production build.
- Verify service-binding trust and source identity in approved deployed staging tests. Local passes alone are insufficient.
- Compare before/after staging redirect and content-ready timings. Do not promise speed based solely on removing hydration.
- Document environment setup, deployment order, cookie cutover, rollback, operational logs, and failure policies before production rollout.

## Main code touchpoints

- `apps/web/lib/api/config.ts` and `apps/web/lib/auth/client.ts`
- `apps/web/lib/session/provider.tsx`, `apps/web/app/page.tsx`, and `apps/web/components/auth/UsernameSetupGate.tsx`
- `apps/web/next.config.ts`, `apps/web/vite.config.ts`, and `apps/web/wrangler.jsonc`
- `apps/api/src/features/auth/better-auth.ts` and `apps/api/src/features/auth/route.ts`
- `apps/api/src/infrastructure/auth/session.ts` and `apps/api/src/http/middleware/require-session.ts`
- `apps/api/src/http/middleware/rate-limit.ts` and `apps/api/src/app.ts`
- `apps/web/features/messaging/realtime/MessagingRealtime.ts`
- `apps/api/src/features/media/reserve-upload/` and `apps/api/src/infrastructure/media/r2.ts`
- `apps/mobile/lib/app/config.dart`
- `.github/workflows/staging-web.yml`, `.github/workflows/staging-hyperdrive.yml`, and `scripts/staging-worker-config.mjs`

## Portability limits

This plan isolates new coupling; it does not make the whole application platform-independent. Leaving Workers would also require replacing runtime/deployment adapters, Hyperdrive connection handling, and native rate limiting. R2 has S3-compatible APIs but signing and CORS still need verification. Durable Objects used for realtime are likely a larger redesign than the proposed web-to-API binding.

## Open decisions before implementation

- Verified private RPC versus authenticated binding-fetch entry point, including runtime type/stream support.
- Web-edge source identity behavior for direct visitors and incoming Worker subrequests.
- Exact staging/production service names, account relationship, and Google callback registrations.
- Approval for one-time browser reauthentication and rollback behavior.
- Limiter failure policies and whether approximate regional limits satisfy each policy.
- Server-render session refresh handling and request-scoped reuse.

Do not resolve these by assuming deployment capabilities or weakening authorization.
