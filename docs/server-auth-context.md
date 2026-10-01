# Server-side authentication context

Status: problem record and proposed direction. This document captures the investigation and user discussion, not a completed migration.

Implementation plan: [Server-side auth through a portable web-to-API proxy](implementation/server-auth-proxy.md).

## Reported problem

An authenticated user opening the public landing page `/` on staging sees a noticeable delay before being redirected. The initial report mentioned signup; clarification established that the affected entry point was the landing page containing the signup button, not direct `/sign-up` navigation.

At the main revision used for this document, `d6704a1`, the sequence is:

1. The web server renders the public landing page.
2. The browser loads JavaScript and hydrates React.
3. Better Auth resolves the session against the separate API origin.
4. The landing page fetches the username profile.
5. Client-side code redirects to `/home` or `/setup-username`.

Relevant code is in `apps/web/app/page.tsx`, `apps/web/lib/session/provider.tsx`, and `apps/web/lib/profile/username.ts`.

This creates sequential work before the redirect and can expose the public page while session resolution is pending. The investigation identified this application flow, not a proven vinext defect. No authenticated staging timing trace was collected, so the latency contribution of each request remains unmeasured.

## Browser, web server, and API server

There are two relevant application Workers, not three:

- The browser runs on the user's device, stores cookies, and executes client JavaScript.
- The web server is the existing Next.js/vinext Cloudflare Worker. It renders pages and returns JavaScript.
- The API server is the existing Hono/Better Auth Cloudflare Worker. It validates sessions and handles data operations.

Other Cloudflare resources exist, but the proposed proxy does not add another web Worker. A binding connects the existing web and API Workers.

## Why the web server cannot currently check the browser session directly

The session cookie is host-only to the API origin. A browser request to the API can include it; a request to the web hostname does not.

When the web server calls the API, that server-side request does not automatically inherit the browser's API-host cookie. It therefore cannot identify the browser user merely by calling `getSession()` without the relevant credential.

In the previous single-app architecture, Next.js and Better Auth shared the browser-facing origin, so Next.js received the cookie during page requests. Separating services is not inherently the problem. The cookie's hostname determines which server receives it.

Existing browser-side guards still resolve session state and redirect as needed. Protected API endpoints independently authenticate and authorize requests; those checks are the security boundary, not the visual page guard.

## Interim landing redirect

[PR #189](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/189) implements an interim flow:

```text
Browser -> web /
Web -> redirect browser to API /api/auth/landing
API -> validate cookie and username profile
API -> redirect browser to web /home, /setup-username, or /?landing=signed-out
```

The `landing=signed-out` query parameter prevents a redirect loop when rendering the public page. It contains no session data and is not proof that a user is signed out. Anyone can supply it.

The web server does not receive a verified session result from this bounce. It receives the browser's next page request, which does not itself prove authentication. Existing page guards and API authorization remain necessary.

This avoids waiting for browser hydration before the initial landing decision, but adds a browser/API redirect round trip for signed-out visitors. It does not provide reusable server-side protected-route authentication or change direct signup-page behavior.

The PR also fixes an E2E fixture collision: desktop and mobile signup tests shared Better Auth's local fallback IP bucket and received 429 responses. Its runner clears only the disposable fixture's auth limiter between browser projects. That test-fixture fix does not establish correct deployed proxy IP behavior.

## Proposed direction

Expose browser REST and auth through the web origin, forwarding them to the API through a service binding. A proxied login response sets the host-only session cookie for the web hostname. Subsequent page requests carry it to the web server, which can ask the API to validate it before rendering.

The user agreed to isolate platform-specific behavior through small adapters for:

- Web-to-API transport.
- Trusted request identity at public and private entry points.
- Rate-limit provider calls, separate from policy and key selection.

This is a direction for planning, not approval to deploy a cookie migration or choose unverified Cloudflare behavior. The implementation plan lists the remaining decisions and proof requirements.

Mobile should retain direct API access. Browser WebSockets should retain direct ticket-authenticated API access. Presigned upload bytes should remain direct to R2.

## Feasibility findings and limits

Read-only scouts inspected repository code, installed vinext behavior, and upstream documentation. They made no deployments and did not contact authenticated staging services.

Vinext external rewrites can forward REST requests, but the inspected implementation strips WebSocket upgrade headers, copies credential headers broadly, and needs explicit multiple-cookie runtime tests. It also has timeout logging behavior that needs scrutiny for sensitive OAuth query parameters.

A private binding provides a controlled Worker-to-Worker connection within one Cloudflare account. It does not, by itself, document or prove original visitor-IP propagation. Its entry point must be distinguishable from public API requests before the API trusts forwarded identity.

### Rate limiting is the main unresolved boundary

The API ingress limiter requires `cf-connecting-ip`, and Better Auth also uses that header. A naive proxy can therefore collapse unrelated users into one source bucket or accept spoofed identity.

Cloudflare documents that:

- Same-zone Worker subrequests derive downstream `CF-Connecting-IP` from `x-real-ip`, which the upstream Worker can modify.
- Cross-zone Worker subrequests use a fixed Worker IP instead of the original visitor IP.
- Service bindings do not provide a documented automatic original-IP guarantee on which this design can rely.
- Native Worker rate limits are location-local and eventually consistent, not strict global counters.

The API remains public for mobile, so attackers can bypass browser CORS and call it directly. An unsigned header claiming to come from the web proxy is not trustworthy.

The preferred investigation is a private service-bound entry point with authenticated source context. If that cannot be proved safely, use separate web-edge and public-API ingress controls, with explicit downstream treatment for trusted proxy traffic. Retain authenticated actor/action limits and anonymous auth-abuse controls in either design.

## Environment and migration implications

Local, staging, and production should share code but use distinct validated origins, bindings, credentials, and OAuth callbacks. Local tests cannot prove Cloudflare edge identity behavior.

Google callbacks need the browser-facing web origin after cutover. The public API origin must remain separately available for mobile and WebSocket generation. Login, logout, session refresh, reset, and linking cookies all need coverage.

Existing API-host browser cookies will not automatically move to the web hostname. The lowest-scope option is a one-time browser sign-in, subject to explicit approval. A rollback may also require sign-in. Seamless cookie transfer would be a separate security-sensitive feature.

Moving off Cloudflare later would require more than a new rate limiter. Runtime adapters, Hyperdrive, R2 integration details, and Durable Object realtime infrastructure also matter. The proposed abstractions contain new coupling without claiming to remove those existing dependencies.

## Follow-up

A local Phase 1 adapter slice now exists. The API has a named private binding entrypoint that validates a browser-source context before constructing the internal `cf-connecting-ip` header. The web app has a server-only binding adapter and inactive `/api/*` route. The route remains unavailable without a configured binding. Browser callers remain direct unless `NEXT_PUBLIC_WEB_API_PROXY_ENABLED=true` and an exact web origin are both present. The direct API origin remains separate for mobile and issued WebSocket ticket URLs.

The opt-in server path now has reusable session and username-readiness guards for the landing, protected layout, and username-setup route. Better Auth's valid `200` JSON `null` no-session response is signed out. Protected routes redirect it to sign-in, while the public landing remains visible. When a server check detects a cookie mutation, a browser-facing refresh endpoint transfers the cookie on a no-store redirect with a normalized safe relative return path and a short-lived loop marker. It is inert while proxy mode is disabled, does not treat the marker or a query value as authentication, and unavailable server validation leaves the existing client guard in control.

Rate-limit policies now select named buckets and identity-free keys through a provider interface. The Cloudflare native binding is one runtime adapter, so missing configuration fails closed while a live native-backend error retains the existing fail-open operational-alert behavior. A server-only session helper is available for later guarded layouts. It returns `cookie-mutation-required` rather than silently dropping a refresh or clearing cookie from a React Server Component. It is not yet used to alter navigation.

Local tests cover header stripping, source validation, streamed bodies, redirects, multiple cookies, the explicit browser-origin opt-in, rate-limit adapter behavior, and server-session cookie handling. Standard Next and Vinext production client outputs were inspected with explicit disabled and enabled proxy environments, confirming their emitted browser bundles contain the selected API and web origins rather than a dynamic public-environment lookup. Typechecks, lint, and Vinext compatibility checks pass locally.

This does not resolve the deployment gates in this record. In particular, no deployed test has shown whether the web edge receives a stable browser identity for direct visitors or incoming Worker subrequests, and no service binding, cookie cutover, OAuth callback, or session migration has been configured. Use [the implementation plan](implementation/server-auth-proxy.md) for the exact local evidence, staging acceptance criteria, cutover, rollback, and unresolved decisions. Do not begin production rollout until source identity, cookie propagation, and OAuth behavior are demonstrated in the deployed runtime.

## Sources

- [Cloudflare visitor-IP behavior in Worker subrequests](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip-in-worker-subrequests)
- [Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Cloudflare Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Better Auth rate limiting](https://www.better-auth.com/docs/concepts/rate-limit)
- Repository touchpoints and baseline are listed in the linked implementation plan. Recheck installed framework versions and deployment configuration before implementation.
