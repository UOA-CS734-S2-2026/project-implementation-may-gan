# Authentication proxy: design decisions, implementation, and validation

Recorded on 2026-10-01. Application baseline: `6e40eee5be877ff9b30b0a437211e2b2cbf2a927`, the merge of PR #219.

This document consolidates the authentication migration, its debugging history, the security work, and the evidence collected. It preserves the distinction between implementation, local tests, temporary edge experiments, owner-reported behavior, and verification of the deployed application. The older documents remain available and have not been replaced.

## Current position

The browser auth proxy, server-side guards, migration safeguards, origin validation, fail-closed rate limiting, and Worker-origin rejection are merged. All four CI jobs for PR #219 eventually passed. The owner requested its admin rebase merge while three jobs were still running, so this was not a merge gated on completed CI or an independent review of that final PR.

The coordinated staging release for `6e40eee5` subsequently succeeded:

- [PR #219 CI](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/actions/runs/36839317122): TypeScript, Web E2E, Contracts and Flutter, and PostgreSQL integration passed.
- [Staging release 36840296341](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/actions/runs/36840296341): release capture, API deployment and Hyperdrive proof, and web deployment passed.
- The release's database identity check, migration planning, and final schema verification passed. Pending migration application was skipped. A skipped apply is not a failed migration.

Earlier notes correctly said the patch had not yet deployed at the time they were written. The successful release above updates that status. A green deployment does not prove the complete authenticated cookie lifecycle or every compatibility property listed below.

Only staging exists for this work. There is no public production rollout to claim.

## 1. The original problem

An already signed-in visitor could see the public landing page before being redirected. The initial report mentioned signup, but clarification identified the landing page `/` as the relevant entry point.

The original sequence was:

```text
Render landing page
  -> load JavaScript and hydrate
  -> fetch session from the API origin
  -> fetch username readiness
  -> redirect from a client effect
```

The page could appear signed out while the session request was pending. This was an application-level request waterfall. We did not collect an authenticated before/after timing trace, so we cannot attach a measured speed improvement to the migration.

Simply calling the API from the web server would not solve it. Better Auth issued a host-only cookie for the API hostname. A browser request to the web hostname did not carry that cookie, and the web server did not automatically inherit it when making its own API request.

The key design problem was therefore the browser-facing cookie origin, not merely the fact that web and API were separate services.

## 2. Alternatives and the selected design

### Interim API redirect

PR #189 tried an API landing bounce. The browser navigated from the web page to an API endpoint, which could read its own cookie and redirect back to the appropriate web destination.

That avoided waiting for hydration to make the decision, but added a navigation for signed-out visitors. It also did not provide a reusable, validated server session to the web application. A signed-out query flag prevented loops but was not authentication evidence.

The owner selected the more general proxy design. PR #189 was closed as superseded.

### Web-origin browser authentication

The selected design uses the existing two application Workers:

```text
Browser REST/auth
  -> web origin /api/*
  -> API_BROWSER_PROXY service binding
  -> API BrowserProxyEntrypoint
  -> existing API handlers

Browser page request
  -> web server session and username guards
  -> same private API transport

Native mobile
  -> public API directly

Browser WebSocket
  -> public API directly, using a short-lived ticket

Presigned media upload
  -> R2 directly
```

The web server and web Worker are the same component. A service binding did not introduce a third application Worker. The later temporary diagnostic Workers were separate test resources and were deleted.

The staging binding connects `dayli-web-staging` to `dayli-api-staging`, using binding name `API_BROWSER_PROXY` and named entrypoint `BrowserProxyEntrypoint`.

### Decisions and their reasons

| Decision | Reason and boundary |
| --- | --- |
| Browser REST and auth use the web origin | Login responses establish a host-only web cookie that subsequent page requests can carry to server guards. |
| Keep the cookie host-only | A parent-domain cookie is not needed to make the web server see the session. |
| Fixed private API destination | The proxy is not an arbitrary URL relay and has no public API fallback. |
| Named private API entrypoint | Public clients must not gain trusted ingress status by supplying internal headers. |
| Sanitize forwarding metadata | Caller-supplied forwarding headers cannot become trusted internal source context. |
| Validate sessions on the server | A cookie's presence alone does not establish authentication. API authorization remains authoritative. |
| Route-local protected wrappers | Preserve real deep links and query strings rather than always returning users to `/home`. |
| Keep the landing page public | Signed-out and unavailable-session visitors can still see public content. |
| Use a dedicated refresh response | Server components cannot apply cookie mutations. A browser-facing route transfers refresh/deletion cookies on a real response. |
| Validate normalized return destinations | Encoded path normalization must not turn a relative destination into an external redirect. |
| Keep mobile, WebSockets, and uploads direct | Those transports have different authentication or upload contracts and should not be forced through the browser REST proxy. |
| Keep a rollout/recovery flag | Coordinated activation and recovery remain useful until deployed validation is complete. |
| Separate transport/provider adapters from policy | This reduces coupling, but does not make Hyperdrive, Durable Objects, or other platform dependencies disappear. |

A private binding is not cryptographic authentication of one uniquely permitted caller Worker. Same-account deployment permissions remain part of the trust boundary.

## 3. Implementation and debugging process

Work normally used separate worktrees, owner-selected implementors, and independent reviews. The owner later requested direct implementation by the main assistant for the provenance diagnostic and rejection fix; no sub-agent was used for those changes.

### Initial implementation

PR #197 added the proxy, private entrypoint, server guards, refresh route, safe return destinations, separate public API/auth origins, and coordinated deployment.

Review and testing corrected several details before merge:

- Eager imports of `cloudflare:workers` broke ordinary Next.js builds. Platform loading needed a runtime boundary.
- Dynamic environment-variable lookup prevented public browser variables from being inlined. Static references replaced it.
- Better Auth's successful `200 null` response means signed out, not an unavailable session service.
- Encoded dot segments could normalize into an unsafe redirect destination. Validation now checks the normalized destination.
- Generic layout guards lost deep links. Route-local guards retained them.
- Email and Google sign-in needed to consume the same validated return destination.
- Expired-cookie deletion on the public landing page must not force an unnecessary sign-in navigation.
- API and web deployment needed one captured commit and auth mode rather than independently changing cookie origins.

### Live request-wrapper failure

After initial activation, the web session endpoint returned an empty 500 while the direct API returned `200 null`. Web logs identified:

```text
TypeError: Invalid URL: [object Request]
```

The proxy used `new Request(request, ...)`. A vinext-style request wrapper was not recognized as a cloneable Request by the other runtime constructor and was interpreted as a URL string.

PR #202 reconstructed the outgoing request explicitly from URL, method, sanitized headers, body, signal, and redirect mode. Its regression test reproduced the cross-brand failure and checked streamed body and field preservation. Subsequent anonymous deployed session checks worked.

An earlier hypothesis blamed dynamic platform imports. The stack identified request construction instead, so the speculative import fix was discarded. This was a proxy compatibility assumption, not proof of a general vinext defect.

### Code ahead of database schema

The owner later reported email login, password reset, Google login, and messaging problems. Deployed code expected migrations beyond the staging ledger. A missing user-column migration was consistent with the auth failures, and missing cleanup fields explained another observed failure.

The supplied logs did not expose the underlying SQLSTATE, so the missing-column explanation initially remained a supported diagnosis rather than direct database proof. After the owner applied the missing migrations, normal auth and messaging worked according to the owner's report.

A passing Hyperdrive connectivity probe was insufficient. It did not establish that the application's complete schema matched the deployed code.

### Deployment safeguards

PR #211 added database-target identity verification, exact migration-ledger checks, shared database-state concurrency, pinned release tooling, and persistent web logging configuration. A later release was correctly blocked while migration `0019` was pending, before the API/web changes ran.

PR #214 then made forward staging releases apply pending reviewed migrations automatically:

```text
Capture release and mode
  -> verify direct migrator and Hyperdrive database identity
  -> check migration safety
  -> plan pending migrations
  -> apply only when pending
  -> verify exact migration history
  -> synchronize reviewed secrets
  -> deploy and prove API
  -> deploy web
```

An explicit `commit_sha` selects verification-only rollback behavior, even if it names current main. It does not apply or reverse migrations. Deployment tooling is pinned separately from application code so historical releases can use the current verifier.

These controls do not make a release atomic. A successful migration remains applied if a later deployment fails. Ledger validation also does not detect every possible out-of-band DDL change.

### Hosted-mutation hold

A separate default-deny hosted-mutation manifest had blocked deployment and migration work. The owner explicitly requested its removal in PR #206. It was not required by the architecture and remains removed.

Review afterward found that a delayed CI event could release an older main ancestor. PR #208 restored current-main validation for automatic and implicit releases while retaining explicit rollback selection.

Configured GitHub approval protections are distinct from workflow YAML. We must not claim environment reviewers or required status checks exist merely because a workflow names an environment.

## 4. Security findings and fixes

### Cross-origin mutations were still executing

The audit reproduced a bodyless relationship mutation from an untrusted sibling origin with a victim session cookie. The request returned 200 and invoked the mutation service.

Withholding CORS response headers was not enough. It could stop a browser from reading the response without stopping the server from performing the mutation.

PR #217 rejects unsafe application requests from untrusted origins before services run. Origin-less cookie-authenticated requests are rejected too. Mixed bearer/cookie credentials cannot bypass that rule. Trusted browser requests and origin-less native bearer requests remain routable, with downstream session validation still required.

Tests cover sibling and cross-site origins, `Origin: null`, malformed origins, missing origins, mixed credentials, valid browser requests, and native bearer traffic. Rejected cases assert that the mutation service was not invoked.

### Rate-limit backend failures were fail-open

The Cloudflare limiter adapter previously converted thrown backend errors into allowed decisions. A limiter outage could therefore disable a protection layer silently.

PR #217 makes configured limiter failures unavailable. Ingress and authenticated policies return 503 rather than proceeding. An exhausted healthy bucket remains 429. Alerts use a fixed label without keys, credentials, visitor IPs, or exception details.

This deliberately trades availability for protection during an outage. Operational monitoring should distinguish backend failure from ordinary rate-limit exhaustion.

### Incoming Workers could choose the apparent visitor IP

The web proxy selected `CF-Connecting-IP` as the source identity for rate limiting. Cloudflare documents that a same-zone caller Worker can alter `x-real-ip`, which influences the downstream connecting-IP value.

This does not bypass session authentication or grant account access. It threatens IP-based abuse controls by allowing an attacker who controls another same-zone Worker to select different identities. Account-based limits remain a separate layer.

Rejecting all `x-real-ip` headers was not a valid fix. Legitimate direct requests, including the owner's PC and phone samples, carried that header.

## 5. How the edge diagnostic was designed and run

The owner explicitly authorized temporary setup through Wrangler. The assistant confirmed access to the staging account and deployed two new Workers on randomly named diagnostic hostnames.

The receiver imported the actual production source-selection function. The caller sent a fixed set of requests only to that receiver. Neither had application bindings, database access, storage access, or real rate-limit buckets. No real login or mutation was needed.

Safeguards included:

- A random access token and independent HMAC key stored as temporary Worker secrets.
- A six-hour absolute expiry that rejected requests even with the right token.
- Keyed source fingerprints and fixed flags instead of raw IPs or copied headers.
- No application logging of cookies, authorization values, raw request metadata, or exceptions.
- Disabled diagnostic observability and Logpush configuration, without claiming control over all provider-side platform logging.
- A private browser link using a fragment rather than a query token. The page removed the fragment and retained it only in memory.
- No cookie forwarding, no arbitrary upstream destination, and no redirect following.
- Explicit cleanup. Expiry disabled access but did not delete resources.

### Before the fix

| Case | Observation |
| --- | --- |
| Direct request | Accepted as a normal source; no Worker marker. |
| Direct request forging either synthetic `x-real-ip` | Selected identity unchanged. |
| Direct request forging `CF-Worker` | Marker absent at the receiver. |
| Combined direct forwarding-header forgery | Edge returned 403. This did not identify which individual header caused rejection. |
| Same-zone Worker supplying two synthetic IPs | Both accepted, with distinct source fingerprints. The vulnerability was reproduced. |
| Same-zone Worker omitting or forging `CF-Worker` | Cloudflare still supplied the same-zone marker at the receiver. |
| workers.dev caller | Fixed Cloudflare Worker address and a marker classified as outside the target zone. |

The baseline same-zone call also received the fixed Worker address when it did not supply `x-real-ip`. That constant alone therefore cannot identify whether a caller is cross-zone.

Initial DNS propagation affected the newly created caller hostname. A later complete run used public DNS with normal TLS hostname validation, not a certificate bypass or a system DNS change. That runner used IPv4, while the desktop browser used IPv6. Their differing hashes alone were not two-network proof.

### Owner device samples

The owner supplied labelled PC and mobile results after receiving Wi-Fi/mobile-data instructions:

- PC, 08:27 UTC: accepted, IPv6, no Worker marker, no synthetic or fixed Worker identity.
- Mobile, 08:28 UTC: accepted, IPv4, no Worker marker, no synthetic or fixed Worker identity.
- The two source fingerprints differed within the same diagnostic run.

These results establish distinct selected identities for those samples. They do not establish actual limiter enforcement. Different address families also mean hash inequality alone cannot prove independent physical networks. No raw addresses are retained in this document.

## 6. The Worker-origin rejection policy

PR #219 rejects any present `CF-Worker` header, including an empty value:

- The web API proxy returns no-store 403 before private transport dispatch.
- The public API fetch handler returns no-store 403 before constructing the application.
- The source selector refuses the marker independently.

Checking only the web proxy would leave the public API available as an alternate path. Both public entry points needed the rule.

Implementation inspection also found that server-side session and username helpers reconstructed requests using cookies and the connecting IP but dropped Worker provenance. They now preserve the marker, including an empty value. Otherwise, a marked page request could become an apparently direct session request inside the server.

The refresh route already forwards the incoming headers. Tests confirm it cannot bypass rejection or mutate cookies on that failure path. It maps the rejected upstream result to its existing 502 error behavior. Public landing HTML can still render without making authenticated session or profile requests for marked traffic.

The private named API entrypoint remains separate from the public fetch handler. Its source-context validation and service-binding trust assumptions did not change. Legitimate direct `x-real-ip` remains allowed.

This intentionally excludes public API calls from other Cloudflare Workers, including Worker-based monitors and integrations. There is no zone allowlist. Scheduled handlers are not incoming public fetches. Native direct bearer traffic and direct ticket WebSockets remain supported by their code paths; R2 upload routing is unchanged.

### After the fix

A second temporary edge deployment used the patched production selector:

- All six same-zone cases were rejected, including two synthetic IPs and attempts to omit or forge the Worker marker.
- All six workers.dev cases were rejected.
- Direct requests still selected the edge-owned identity.
- The combined direct forwarding forgery still received an edge 403.

The diagnostic returned HTTP 200 when it successfully collected an observation. Its `selectorAccepted: false` field is the rejection evidence. It must not be described as an observed application HTTP 403. The actual 403 handlers were tested locally, including in workerd.

Both diagnostic campaigns were cleaned up. Cloudflare API inventory confirmed the Workers and custom-domain mappings were absent. Authoritative DNS returned no records for the hostnames. Local token/link files were removed. Sanitized reports remained locally. Temporary recursive DNS caching after deletion was not mistaken for an active Worker.

## 7. Verification evidence and its limits

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| 461 API tests | Application regressions, origin rules, limiter outcomes, and public entrypoint rejection under test conditions | Full hosted authentication behavior |
| 150 web tests | Proxy behavior, server guards, return paths, refresh handling, and marker preservation | Real browser cookie lifecycle through deployed vinext |
| Two proxy workerd tests | Actual production proxy code and API named-entrypoint behavior in local workerd | Cloudflare edge ownership or deployed private binding isolation |
| Ten diagnostic tests, including workerd | Diagnostic gating, expiry, sanitization, fixed target, and Worker execution | Edge guarantees without a deployed run |
| Full `pnpm verify:local` | Lint, typechecks, builds, generated clients, Flutter checks, and isolated PostgreSQL verification passed | Remote staging state or manual schema drift |
| Owner PC/mobile samples | Normal samples had distinct selected identities and no Worker marker | Sustained two-network bucket isolation or abuse resistance |
| Temporary deployed edge runs | Vulnerability reproduced, then patched selector rejected the tested Worker cases | Full application adapter, auth, and cookie compatibility |
| Four successful PR #219 CI jobs | Hosted automated checks passed on the submitted revision | Independent review or completed checks at merge time |
| Successful staging release | Captured commit passed deployment, database checks, and Hyperdrive proof | Complete post-release user/session verification |

The earlier workerd fixture copied web forwarding logic. During the rejection fix it was changed to compile the actual production proxy, preventing a copied fixture from giving false confidence about that policy. It still does not run the full vinext adapter.

The local complete cookie-lifecycle attempt encountered a Hyperdrive socket-close blocker. That is a documented gap, not a passing integration test.

### Redirect behavior

Observed protected-page responses could return HTTP 200 with a streamed `NEXT_REDIRECT` instruction rather than a pre-stream HTTP 3xx. A JavaScript-disabled browser did not navigate in that check.

We can claim a server-made redirect decision in the observed stream. We cannot claim universal JavaScript-free navigation, a pre-render 3xx, or a measured latency improvement.

## 8. Remaining work and proposed hardening

No additional confirmed code defect was left open by this investigation after the rejection implementation. That does not mean the security review is complete.

### Verification still required

1. Complete deployed session expiry, revocation, refresh, cookie deletion, and multiple-cookie checks through the actual web proxy and binding.
2. Confirm post-release native bearer, ticket WebSocket, and presigned R2 behavior with appropriate accounts and devices. Unchanged routing is not a substitute for deployed compatibility evidence.
3. Finish deployed private-entrypoint isolation verification. Same-account Worker permissions remain a trust assumption.
4. Collect sustained two-network limiter evidence if closing the broader rollout acceptance checklist. The device samples and temporary selector test did not exercise real rate-limit buckets.
5. Decide whether streamed redirects meet the original product expectation, and measure authenticated navigation if claiming a performance improvement.
6. Keep the recovery flag until the remaining evidence is accepted. Do not remove direct mobile, WebSocket, or R2 paths as browser-proxy cleanup.

### Hardening discussed but not implemented by this work

- Require GitHub CI checks, dismiss stale approvals, and restrict admin bypass. Configure staging reviewers where appropriate. Recheck actual repository settings before claiming these protections exist.
- Minimize Cloudflare account and Worker deployment permissions. Private service bindings still depend on that control plane.
- Review account-based abuse limits for login and recovery. IP limits alone do not stop distributed attacks; avoid lockout rules that enable denial of service against another account.
- Monitor fixed rejection and limiter-unavailable signals without raw visitor IPs, credentials, or copied request headers.
- Automate the outstanding deployed session regressions rather than relying only on successful manual login.
- Consider a separate Cloudflare edge rule based on Worker-provenance metadata only after verifying availability and behavior. No such rule was installed by this work.
- Automatically delete merged branches for repository hygiene. This is housekeeping, not an authentication security control.

## 9. Change index and where to find details

| PR | Purpose |
| --- | --- |
| #189 | Interim landing bounce, closed as superseded |
| #197 | Web-origin proxy, private entrypoint, server guards, coordinated deployment |
| #202 | Cross-runtime Request reconstruction fix |
| #206 | Owner-requested removal of the hosted-mutation hold |
| #208 | Restore stale automatic release rejection |
| #211 | Database identity/ledger gate and persistent web logging |
| #213 | Local named-entrypoint workerd proof in CI |
| #214 | Automatic forward staging migrations |
| #217 | Unsafe-origin rejection and fail-closed limiter outages |
| #219 | Provenance diagnostic, Worker-origin rejection, marker preservation, and real-proxy workerd coverage |

Use these existing files for the detailed history and operating procedures:

- [Original server-auth context](../server-auth-context.md)
- [Architecture and implementation plan](server-auth-proxy.md)
- [Chronological migration record](auth-proxy-migration-record.md)
- [Temporary provenance diagnostic and cleanup procedure](proxy-provenance-diagnostic.md)
- [Staging deployment runbook](staging-deployment.md)
- [Browser proxy verification checklist](browser-proxy-verification.md)
- [Authentication compatibility](../dayli/authentication-compatibility.md)
- [Database migration runbook](../dayli/database-migrations.md)

Some older files describe historical inactive or not-yet-deployed states. Use their chronology, this document's baseline, current source, and release evidence together rather than treating every historical sentence as current operating status.

Platform references:

- [Cloudflare connecting-IP behavior for Worker subrequests](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip-in-worker-subrequests)
- [Cloudflare CF-Worker marker](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-worker)
- [Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Cloudflare native rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

This record intentionally excludes credentials, raw visitor IPs, session cookies, OAuth codes, database connection strings, account identifiers, and copied request headers.
