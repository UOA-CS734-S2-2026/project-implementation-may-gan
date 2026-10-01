# Auth proxy migration record

Recorded on 2026-10-01 against main `4c89413b26438a72f9f19cd9a2ee02e38fa276a8`.

This is the chronological context and implementation record for the staging authentication migration. It separates implemented behavior, local test evidence, deployed observations, and unfinished verification. It is not a declaration that every security property has been proved.

## Current status

- The auth proxy, route guards, request compatibility fix, deployment schema gate, persistent web logging, local Worker boundary test, and automatic forward staging migrations are merged.
- The owner reported working email sign-in, Google sign-in, logout, refresh, and messaging after staging's missing migrations were applied.
- The initial browser-proxy HTTP 500 was reproduced and fixed. A subsequent deployed anonymous session request returned HTTP 200 with JSON `null` and `Cache-Control: no-store`.
- PRs #213 and #214 passed all four hosted CI jobs before merge: TypeScript, Web E2E, Contracts and Flutter, and PostgreSQL integration.
- A fresh security audit and verification of the post-#214 staging release are in progress at the time of writing. Their outcomes are not yet recorded here.
- Complete deployed visitor-IP spoof resistance, two-network identity separation, private-entrypoint isolation, and cookie lifecycle evidence remain outstanding.
- Only staging is deployed in this line of work. There is no public production rollout to describe.

## Related documents

- [Original problem and architecture context](../server-auth-context.md)
- [Implementation plan](server-auth-proxy.md)
- [Staging deployment runbook](staging-deployment.md)
- [Database migration runbook](../dayli/database-migrations.md)
- [Authentication compatibility and provider setup](../dayli/authentication-compatibility.md)
- [Browser proxy verification and remaining evidence](browser-proxy-verification.md)

The chronological record explains why changes happened. Use the runbooks and current workflow code for operational commands, because those can change after this record.

## 1. Original report and diagnosis

The owner reported a noticeably slow redirect while already authenticated on staging. The initial wording referred to signup. Clarification established that the entry point was the public landing page `/`, which contains signup controls, rather than direct navigation to `/sign-up`.

The original sequence was:

1. The web server rendered the public landing page.
2. The browser loaded JavaScript and hydrated React.
3. Better Auth fetched the session from the API origin.
4. The landing page fetched the username profile.
5. A client effect redirected to `/home` or `/setup-username`.

While the session was pending, `user` was null and the public page could render. This created a visible flash and sequential network work before the redirect. Repository inspection established this application-level waterfall, not a general vinext defect. No original authenticated staging timing trace was collected, so no numerical speed improvement is claimed.

The relevant original components were the landing page, shared session provider, username-profile helper, and `UsernameSetupGate`. Protected API endpoints separately resolved sessions and enforced authorization.

## 2. Why the previous single-app pattern did not directly apply

The owner previously used Next.js and Better Auth in one app, allowing a server-side `getSession()` followed by a redirect before rendering.

Dayli split those responsibilities:

- Browser: runs on the user's device and stores cookies.
- Web server: the existing Next.js/vinext Cloudflare Worker.
- API server: the existing Hono/Better Auth Cloudflare Worker.

The web server and web Worker are the same component, not two different servers. Adding a service binding did not introduce a third application Worker for this feature.

The API issued a host-only session cookie. The browser sent that cookie to the API hostname, not the web hostname. A request made by the web server did not automatically inherit the browser's API-host cookie. Therefore, a server-side API call without that credential could not identify the browser user.

Separating services was not inherently the obstacle. The browser-facing cookie origin was.

## 3. Interim landing bounce, PR #189

The first implementation redirected the browser through `/api/auth/landing`:

```text
Browser -> web /
Web -> redirect browser to API /api/auth/landing
API -> validate API-host cookie and username profile
API -> redirect browser to web destination
```

Destinations were `/home`, `/setup-username`, or `/?landing=signed-out`. The query flag prevented a signed-out redirect loop. It did not contain session data or prove authentication. An authenticated user could also manually request that public URL.

The bounce avoided waiting for hydration to make the initial decision but added an API navigation for signed-out visitors. The web server still did not receive a validated session result, and normal page/API authorization remained necessary.

[PR #189](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/189) also exposed an E2E fixture collision. Desktop and mobile projects shared Better Auth's local fallback IP bucket because the local Worker did not supply a real edge `CF-Connecting-IP`. Signup returned 429, not an auth-session race. The fixture fix ran projects separately and cleared only the disposable database's auth rate-limit records between projects.

The owner chose the more general web-origin proxy architecture. PR #189 was closed as superseded after the proxy worked on staging. Its landing bounce is not the intended final architecture.

## 4. Selected architecture and portability boundary

Normal browser REST and auth calls use the web origin's `/api/*` paths. The web Worker forwards them through a named service binding to the API Worker. Login responses establish host-only cookies on the web hostname. Page requests can then carry the session credential to the web server for validation.

```text
Browser -> web /api/* -> private API entrypoint -> API handlers
Browser -> web page -> server session helper -> private API entrypoint
Mobile -> public API directly
Browser -> public API WebSocket using a short-lived ticket
Browser -> R2 directly using a presigned upload URL
```

The binding contract is:

```text
Web Worker: dayli-web-staging
Binding: API_BROWSER_PROXY
API Worker: dayli-api-staging
Entrypoint: BrowserProxyEntrypoint
```

The services must be in the same Cloudflare account. The binding is a private server-to-server connection; it does not automatically establish every original visitor-IP property.

The owner requested avoiding unnecessary platform coupling. The implementation separated API transport, trusted ingress handling, and rate-limit provider calls from route policy. A future host can replace the transport/provider adapters, but moving the whole app off Workers still involves Hyperdrive, runtime/deployment configuration, R2 integration details, and especially Durable Object realtime infrastructure. This migration does not make those dependencies disappear.

## 5. Initial security and runtime feasibility findings

Read-only scouts found that vinext external rewrites could forward REST traffic, but cookie serialization and real Worker behavior required tests. WebSocket upgrades should not go through that proxy. R2 signed uploads should stay direct.

Cloudflare documents different visitor-IP behavior for Worker subrequests:

- Same-zone requests can derive downstream `CF-Connecting-IP` from `x-real-ip`, which an upstream Worker can modify.
- Cross-zone Worker subrequests can use a fixed Cloudflare Worker IP.
- A service binding is not a documented automatic guarantee of original browser-IP preservation.

The API's ingress limiter and Better Auth both depended on source identity. A naive proxy could group unrelated visitors together or accept spoofable headers. Mobile still needed the public API, so browser CORS could not be treated as protection against direct scripted requests.

The chosen design used a named private entrypoint and sanitized internal context. Public requests must not be promoted to private traffic merely by supplying internal headers. Local tests establish parts of that boundary; real edge ownership and incoming Worker subrequest behavior still need deployed proof.

## 6. Implementation and review cycle, PR #197

Work began in a separate worktree with the implementation plan and problem record. The proxy stayed opt-in while runtime and deployment behavior were developed.

[PR #197](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/197) introduced:

- Private API entrypoint and web transport adapter.
- Rate-limit provider extraction, preserving existing policy behavior.
- Separate public API origin and browser-facing auth base URL.
- Server-only session resolution and username-readiness helpers.
- Public landing handling, protected page wrappers, and setup guards.
- A browser-facing session-refresh response that transfers cookie mutations.
- Safe relative return destinations and bounded refresh-loop handling.
- Staging binding configuration and coordinated API/web deployment.

Independent reviews found and corrected several defects before that PR was merged:

1. Eager `cloudflare:workers` loading broke ordinary Next builds. Runtime-specific loading and narrow types were needed.
2. Dynamic `process.env[name]` access prevented `NEXT_PUBLIC_*` values from being inlined into browser bundles. Static references replaced it.
3. Better Auth's successful JSON `null` session response was initially misclassified as unavailable. It now means signed out.
4. URL normalization could turn encoded dot segments into a protocol-relative redirect. Final normalized destinations are validated, with encoded attack regression tests.
5. A protected guard was incorrectly applied to the public landing page. Signed-out visitors now retain the landing page.
6. Refresh routes and the catch-all proxy needed opt-in checks before loading or invoking the binding.
7. Expired-cookie deletion initially sent public landing visitors to sign-in. Refresh now returns to the validated destination and lets that route make its own decision.
8. A generic layout used `/home` as the return target, losing deep links. It was removed, then replaced by route-local wrappers using framework route parameters and search parameters.
9. Email and Google sign-in initially ignored the recorded `next` value. Both now consume a shared validated relative destination.
10. A legacy post alias evaluated its redirect before its guard and dropped queries. It now preserves the query and redirects to the guarded canonical route.
11. API and web workflows could independently change auth modes. A coordinated release captures one commit and mode, deploys/proves API first, and then deploys web.
12. Rollback selection, proof commit attribution, retry-safe artifact names, and contradictory setup documentation needed correction.

Protected route wrappers cover home, messaging, post creation, settings, and profile routes. The legacy post URL delegates to its canonical guarded route. API authorization remains authoritative; a UI guard or layout is not permission to access protected data.

The final hosted CI also caught interaction with newer main changes: app-wide Cloudflare types conflicted with DOM types, and Next webpack followed a Worker-only import during E2E development. Narrow module declarations and runtime loading changes restored the builds. The auth E2E was updated to expect the intended validated `/settings` return rather than an unconditional `/home`.

All four hosted CI jobs passed before the owner-requested admin rebase merge of PR #197. Its main merge commit was `78cbd9b`.

## 7. Staging configuration and controlled activation

The owner confirmed staging was the only deployed environment. The feature switch was rollout protection, not a user-facing preference.

The two staging origins are:

```text
Web: https://staging.dayli.agroupforcoders.com
API: https://api.staging.dayli.agroupforcoders.com
```

Before proxy activation, the owner added the web callback to the existing Google web OAuth client:

```text
https://staging.dayli.agroupforcoders.com/api/auth/callback/google
```

The existing API callback was retained for testing and rollback. Callback registration must precede enabling proxy mode; adding a Google URI alone does not change Better Auth's base URL.

The coordinated release captures `STAGING_BROWSER_PROXY_ENABLED`. Browser variables are compiled into the web build, not changed by editing runtime variables after deployment. In proxy mode, Better Auth uses the web auth origin while `PUBLIC_API_BASE_URL` remains the direct API origin for native clients and realtime tickets.

An enabled coordinated deployment, run `36813094821`, passed API, Hyperdrive proof, and web jobs at `78cbd9b`. This proved deployment execution and the existing database connectivity probe, not correct auth behavior through the new proxy.

## 8. Live proxy failure and the request reconstruction fix

Post-deployment GET checks found:

- Web `/api/auth/get-session`: empty HTTP 500.
- Direct API `/api/auth/get-session`: HTTP 200 and JSON `null`.

The owner chose to keep staging enabled during investigation rather than roll back. Web logs were initially disabled; after the owner enabled them, the exception was:

```text
TypeError: Invalid URL: [object Request]
```

An initial hypothesis blamed dynamic platform-module loading. The live stack instead identified request construction in `forwardBrowserApiRequest()`. That speculative import change was discarded.

The failing code used `new Request(request, ...)`. The Vinext-style request wrapper was not recognised as a cloneable request by the other runtime constructor, so it was interpreted as the URL string `[object Request]`.

[PR #202](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/202) reconstructs the request from its explicit URL, method, sanitized headers, redirect mode, signal, and streamed body. Non-GET/HEAD bodies use compatible duplex handling. The regression test reproduces the old cross-brand failure and verifies field/body preservation. API ingress already used explicit reconstruction.

PR #202 was admin rebase-merged at the owner's request as `82571ce6`. Focused current-main tests passed; hosted CI was not awaited at merge time. Subsequent deployed anonymous session checks returned HTTP 200, JSON `null`, and no-store, confirming the earlier proxy failure was gone.

This was a compatibility assumption in our proxy at the framework/runtime boundary, not evidence of a universal vinext failure.

## 9. Hosted-mutation hold and its removal

A separate [PR #199](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/199) introduced a default-deny hosted-mutation manifest while this work was underway. It blocked deployments, secret sync, migrations, and cleanup unless a separate authorization commit named a release. Its stated purpose was to compensate for missing configured environment reviewers.

The hold blocked an attempted deployment of the proxy fix. It was not required by Cloudflare or the auth architecture. After explanation, the owner explicitly requested removing it rather than creating allow/deny commits for each staging deployment.

[PR #206](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/206) removed the hold and its dedicated machinery while retaining main-only restrictions, same-repository event checks, environments, secret/resource validation, captured commit/mode, deployment sequencing, and migration safeguards. The owner requested immediate admin merge before hosted CI and independent review finished.

The subsequent review found a regression: a delayed successful CI event could select an older main ancestor. [PR #208](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/208) restored current-main matching for automatic and implicit manual releases, while retaining explicit historical rollback selection. It was reviewed and locally tested before admin merge.

The hold remains removed. GitHub Environment approval only exists if configured in repository settings; workflow YAML does not create reviewers. Capture-time freshness checks cannot cancel a release already underway if main advances afterward.

## 10. Second staging incident: code ahead of database schema

After the request fix, the owner reported password login, password reset, and Google failures. API logs showed Drizzle/Postgres errors in user/session lookups; media cleanup also failed. This was not evidence that the password was wrong.

Investigation found:

- The last verified successful staging migration at that point covered only through `0014_link_post_media`.
- A later migration attempt had been blocked by the hosted hold before applying anything.
- Deployed code expected migrations `0015` through `0018`.
- `0016` adds `user.username_changed_at`, used by the full user schema passed to the auth adapter.
- `0018` adds media cleanup fields, consistent with the cleanup failures.

The supplied logs did not expose the nested PostgreSQL SQLSTATE, so the missing-column explanation was initially a strongly supported diagnosis, not a directly observed database cause. The owner then applied the pending staging migrations and reported all auth and messaging flows working. That outcome strongly supported schema drift as the cause.

The green Hyperdrive proof did not contradict this. It tested connectivity, role, transactions, constraints, and a dedicated probe table, not the application's complete migration ledger or user schema.

## 11. Deployment migration gate and persistent web logs, PR #211

The owner requested preventing this code/schema mismatch and making web logs stay enabled after deployments.

[PR #211](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/211) added:

- A read-only control-plane check that the direct staging migrator URL and configured Hyperdrive identify the same database host, name, and port, with separate migrator/app roles.
- Exact ordered migration-ledger hash verification before secret synchronization or deployment.
- Reason-specific failures for pending history, changed hashes, and unknown/newer history.
- Shared staging database-state concurrency for manual migrations and the API deployment/proof.
- Trusted tooling pinned separately from the selected release, allowing compatible historical application checkouts to use current deployment verification.
- Web observability and invocation logging in source configuration, generated-config preservation/overlay, and pre-deployment checks.

Review required matching the actual Hyperdrive target rather than assuming two independent connection configurations named the same database. It also corrected misleading recovery instructions and historical rollback failures caused by missing scripts in old checkouts. Five identity tests were added to the CI command after a final coverage finding.

All four hosted CI jobs passed before PR #211 was admin rebase-merged as `0a8af61b`.

The gate verifies ledger history, not every physical schema object. Manual DDL can still cause drift. Database-state concurrency covers API work through proof, not the subsequent web deployment. GitHub concurrency is not a durable FIFO queue and can replace pending runs. Out-of-band DDL remains outside these controls.

Web logging had been enabled only through the dashboard and was not represented in Wrangler. Making it versioned and asserting generated settings prevents the deployment from silently omitting it. Log only necessary diagnostics, not credentials, cookie values, OAuth codes, or raw personal request data. Retained observability can incur usage costs.

## 12. The gate caught a later pending migration

Read-only release verification watched run `36824749946` for `289c8a7` fail at the schema gate because `0019_privacy_legal_foundation` was pending. API and web mutation steps were skipped, preserving the prior working deployment. The database identity check had passed.

Migration `0019` adds legal/lifecycle tables and permission changes, and requires an owner-provisioned `lifecycle_worker` role. The owner confirmed that role existed and authorized staging migration and redeployment. Before dispatching another migration, a read-only check found run `36825132480` had already successfully applied and verified `0019`; no duplicate migration was dispatched in that step.

This demonstrated the intended gate behavior: reject a release with missing schema rather than deploy it and discover auth failures afterward.

## 13. Automatic forward staging migrations, PR #214

The owner asked why staging needed two actions and requested a single coordinated release. Separate migration actions were a safety choice, not a technical requirement.

[PR #214](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/214) implements:

```text
Validate release and database identity
    -> Check migration safety
    -> Read-only pending plan
    -> Apply pending migrations only when present
    -> Verify exact migration history
    -> Sync reviewed secrets
    -> Deploy and prove API
    -> Deploy web
```

Main CI and manual dispatch without a commit override use forward mode. An explicit `commit_sha`, even if it names current main, uses rollback verification-only mode. It does not apply migrations or downgrade the database. Manual production migration behavior is unchanged.

Pinned tooling reads the selected application's migrations. The apply operation retains its advisory lock and rechecks history under that lock. Errors stop deployment, and a no-pending plan skips apply. Required database roles still need owner provisioning.

Focused tests, the canonical isolated PostgreSQL fixture, and independent review passed. An earlier standalone database test invocation failed because it did not provision the privacy preflight database; the canonical fixture resolved that setup issue. All four hosted CI jobs passed before admin rebase merge as `4c89413b`.

A migration can persist even if a later deployment fails. Code rollback is not database rollback. This workflow does not promise atomic or zero-downtime release behavior.

## 14. Local Worker boundary proof, PR #213

[PR #213](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/213) adds a local workerd named service-binding test, explicitly run in CI and `verify:local`.

It exercises the real API entrypoint with an isolated synthetic web fixture and no remote account, database, R2, or production bindings. It verifies:

- Public handler plus forged private context returns 503.
- Named entrypoint without valid private context returns 400.
- Named entrypoint with valid private context reaches normal application routing and returns the expected database-free 404.

The test does not claim that a 404 proves streamed body preservation. Review caught that overclaim and the initial omission of the dedicated command from CI; both were fixed.

The test proves local boundary behavior, not the deployed web adapter or Cloudflare edge provenance. Complete cookie lifecycle integration encountered a local Hyperdrive socket-close blocker and remains incomplete. The runbook records that limitation rather than marking the flow covered.

Review and all hosted CI jobs passed before merge as `6d5e2552`.

## 15. Redirect observations and the original performance goal

Live anonymous requests to `/settings?tab=account` returned HTTP 200 without a `Location` header or meta refresh, but the streamed HTML contained a server-generated `NEXT_REDIRECT` targeting the sign-in page with the encoded destination preserved.

A JavaScript-disabled browser remained at the protected URL. Therefore:

- The server made a redirect decision, visible in the streamed response.
- This observation is not proof of an HTTP 3xx redirect before any page content.
- It is not proof that navigation works without JavaScript.
- No before/after timing measurement was collected, so a quantified performance claim remains unsupported.

Framework streaming semantics must be considered when evaluating whether this implementation meets the original immediate-redirect expectation.

## 16. Evidence boundaries and remaining work

### Established

- The owner reports normal email/Google login, logout, refresh, and messaging work on staging.
- The cross-brand Request failure was reproduced, fixed, reviewed, and followed by a working deployed anonymous session endpoint.
- The migration gate blocked a real pending-schema deployment before Worker changes.
- Local workerd tests distinguish private and public entrypoint handling.
- PR #213 and #214 code review and hosted CI passed before merge.

### Still required

1. Verify the post-#214 coordinated release, including pending/no-op planning, final schema verification, and deployed web logging preservation.
2. Establish visitor-IP ownership and spoof resistance through Cloudflare, including incoming Worker subrequests and requests from two independent networks. Do not use raw IPs in retained evidence.
3. Verify deployed private-entrypoint isolation and prove public callers cannot promote internal headers to trusted context.
4. Complete session expiry, revocation, refresh, deletion, and multiple-cookie handling through the actual proxy and service binding.
5. Verify native bearer access, direct ticket WebSockets, and direct presigned R2 upload/CORS behavior with appropriate test accounts and devices.
6. Resolve or document the local Hyperdrive cookie-lifecycle test blocker without adding a production-only test bypass.
7. Decide whether the observed streamed redirect meets the product expectation or whether a pre-stream response boundary is needed.

The temporary proxy mode flag remains useful for recovery until this evidence exists. Removing the flag and obsolete direct-browser path is optional cleanup, not a prerequisite for calling the deployed normal flows functional. Mobile, WebSocket, and R2 direct paths must not be removed with that cleanup.

## 17. Working and authorization practices used

Implementation was done in separate worktrees, normally using the owner-selected `implementor-terra`, with read-only scouts and independent reviewers. PR descriptions and this record distinguish agent-run tests from owner-reported staging checks.

The owner explicitly authorized staging activation, selected keeping the broken proxy enabled during investigation, requested several admin merges, requested removal of the hosted hold, and later approved staging migration/redeployment. Those actions do not imply standing authorization to alter production or disclose credentials.

Some urgent merges were performed before hosted checks finished at the owner's request, notably the focused request fix and hold removal. Later review found the stale-release regression, which was repaired separately. Other merges waited for review and all four hosted jobs. These differences are recorded rather than treating every merge as equivalently verified.

This record deliberately omits raw session cookies, passwords, OAuth codes, connection strings, account identifiers, client IP addresses, and copied request headers. Temporary local paths and raw diagnostic artifacts are not required to understand or operate the migration.

## 18. PR index

| PR | Outcome | Purpose |
| --- | --- | --- |
| [#189](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/189) | Closed, superseded | Interim API landing bounce |
| [#197](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/197) | Merged | Web-origin auth proxy, guards, coordinated staging deployment |
| [#199](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/199) | Merged separately, later removed | Hosted-mutation hold |
| [#202](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/202) | Merged | Cross-runtime Request reconstruction |
| [#206](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/206) | Merged | Owner-requested hold removal |
| [#208](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/208) | Merged | Reject stale automatic releases |
| [#211](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/211) | Merged | Database identity/ledger gate and persistent web logs |
| [#213](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/213) | Merged | Local workerd entrypoint proof in CI |
| [#214](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/214) | Merged | Automatic forward staging migrations |
| [#217](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/217) | Merged | Reject unsafe cross-origin mutations and fail closed on limiter outages |

## 19. Security audit follow-up, 2026-10-01

A follow-up review confirmed two application-layer findings. The fixes landed in PR #217 as `d9481b6b52a06c4452e81428ca957847a5c1f41c` after independent review and all four hosted CI jobs passed. Local verification covered 458 API tests and one workerd boundary test. This records the merge, not deployment verification, and does not close the outstanding provenance work.

### Fixed P1: actual cross-origin application mutations

Application CORS previously rejected untrusted preflights but allowed actual requests to continue to routing without CORS response headers. That still permitted a simple cross-origin form submission to reach a cookie-authenticated, bodyless relationship mutation. A sibling site under the same site could send the victim's cookie under the cookie's SameSite rules.

The `/api/v1` middleware now reuses the strict auth-origin policy for actual unsafe methods. A non-empty untrusted `Origin`, including `null` or a malformed value, receives `403` before authentication or route services run. An unsafe request carrying a Better Auth session cookie must also carry an origin, so an origin-less cookie request is rejected. These rules apply even if an `Authorization` header accompanies a cookie, so mixed credentials cannot downgrade the check. Trusted web origins continue to work. Origin-less native bearer requests remain supported. Safe methods remain routable, but receive no CORS grant for an untrusted origin.

Focused route tests cover a real bodyless relationship action from cross-site and sibling origins, malformed and `null` origins, an origin-less session cookie, trusted browser mutations, origin-less native bearer mutations, preflight handling, and an untrusted safe request. The mutation service is asserted not to run for rejected requests.

### Fixed P2: Cloudflare native limiter outages

The Cloudflare limiter adapter previously converted every thrown binding error into `allowed`. Missing bindings were already distinct, but an outage silently disabled ingress, auth, read, write, and action protection.

The adapter now returns `unavailable` for both missing bindings and caught backend failures. Ingress, including `/api/auth`, fails closed with `503` before the auth provider runs. After a server-verified identity, authenticated reads, writes, and action-specific buckets also fail closed with `503` when their rate-limit policy cannot be evaluated. An exhausted live bucket remains `429`, and a successful live bucket remains allowed. The operational alert is the fixed `rate_limit_backend_unavailable` label only. It deliberately excludes limiter keys, IP addresses, credentials, request data, and caught exception text.

Focused tests distinguish missing, unavailable, denied, and allowed decisions. They also prove an auth ingress outage does not call the auth provider and assert that alert arguments do not contain test actor or credential material.

### Unresolved P1: Worker source identity

This remains an external Cloudflare verification gate, not a confirmed local fix. Current Cloudflare documentation says that a same-zone Worker subrequest derives `CF-Connecting-IP` from `x-real-ip`, which the caller Worker can alter. It also says a direct browser request has `x-real-ip` stripped. The observed normal direct-browser staging traffic contains both `cf-connecting-ip` and `x-real-ip`, so rejecting `x-real-ip` would break normal users and is not a valid mitigation. Service-binding documentation establishes private invocation, but does not provide a documented origin-authentication guarantee for the source context carried by this application.

At this audit stage, no source-header filter or speculative Worker provenance change had been deployed. The proposed next step was an owner-approved, no-state staging diagnostic to distinguish normal direct requests from incoming Worker requests without retaining sensitive metadata. The owner subsequently approved temporary diagnostic setup, recorded below.

## 20. Approved deployed provenance diagnostic, 2026-10-01

The owner asked the assistant to implement and set up the diagnostic directly, without a sub-agent. Wrangler access to the staging account was confirmed. Two temporary Workers were deployed on new, randomly named staging subdomains. The receiver imports the production `selectBrowserSource()` function. The caller has a fixed receiver destination and no access to the application or database. Worker secrets gate requests and key the returned identity hashes. Both Workers reject requests after six hours; cleanup remains required to delete the resources.

The direct request retained its source identity when either of two synthetic `x-real-ip` values was supplied. A directly forged `CF-Worker` was absent at the receiver. A combined forwarding forgery returned 403 from the edge, which does not establish which individual header triggered rejection. Legitimate direct requests still included `x-real-ip`, confirming that blanket rejection of that header would be wrong.

The same-zone caller selected two different synthetic identities by changing `x-real-ip`. This reproduces the issue with the actual production selector at the Cloudflare edge, rather than only in a local request fixture. Omitting or forging `CF-Worker` did not remove the same-zone marker at the receiver in these cases. Calls through the workers.dev endpoint received the documented fixed Worker IP and a different Worker marker. The baseline same-zone call also received the fixed IP when it did not supply `x-real-ip`, so that address alone must not be used to classify caller provenance.

The initial system-resolver run could not resolve the new caller hostname. The complete comparison used Cloudflare public DNS with normal TLS hostname validation and no system DNS changes. This selected IPv4; the deployed Chromium browser check used IPv6. Their different hashes are not evidence of two independent networks.

Eight Node tests, a real workerd smoke test, focused lint, and strict Worker-source typechecking passed. The deployed Chromium check confirmed that the page removes its token fragment and returns a sanitized sample. No login, cookie lifecycle, named-entrypoint, application mutation, database, or actual rate-limit-bucket test occurred. The app's source-selection policy was not changed.

The owner then supplied labelled PC and mobile samples at 08:27 and 08:28 UTC. Both were accepted as direct requests without a Worker marker. Their source fingerprints differed, with IPv6 on the PC and IPv4 on mobile. These samples establish distinct selected identities, not rate-limit enforcement. The differing address families also mean hash inequality alone does not establish independent physical networks.

After the device results, the assistant deleted both temporary Workers. The Cloudflare API confirmed no remaining diagnostic Workers or custom-domain mappings, and authoritative DNS returned no records for either hostname. Local access-token files and the private-link symlink were removed. Sanitized reports remain locally. The app and database were not changed.

`CF-Worker` remains a candidate rejection signal, supported by these observed cases and Cloudflare documentation, but enforcement and broader compatibility testing remain separate work. See [Temporary source-provenance diagnostic](./proxy-provenance-diagnostic.md) for commands, interpretation limits, device results, and cleanup.

## 21. Worker-origin rejection implementation, 2026-10-01

After seeing the diagnostic and device results, the owner requested the fix. The assistant implemented it directly. The web proxy and public API fetch handler reject any present `CF-Worker` header with a no-store 403 before forwarding or constructing the application. The selector rejects the same marker. No `x-real-ip` blanket filter or Worker-zone allowlist was added.

Review of the server-rendered path found that session and username helpers reconstructed requests using only cookies and `cf-connecting-ip`. Those helpers now preserve `cf-worker`, including an empty value, so they cannot remove the rejection signal before invoking the proxy. Tests also cover the existing refresh route's preservation of incoming headers and its no-cookie error response. Public landing rendering can remain available without making a session or profile request for marked traffic.

The API's private named entrypoint bypasses the public fetch handler intentionally. Its source-context validation and service-binding trust boundary remain unchanged. The workerd integration fixture now compiles the real production web proxy instead of emulating it. Tests show public and web-proxy rejection while private entrypoint routing still works. This is not a deployed vinext cookie-lifecycle proof.

A second temporary edge diagnostic used the patched selector. All twelve Worker-originated cases were rejected, covering six same-zone and six workers.dev variants. Direct requests still selected a source identity, and the edge stripped a directly forged Worker marker. The combined direct forwarding forgery still returned 403. These are deployed selector observations, not proof that the main staging application has received the patch.

All temporary diagnostic resources and local access-token files were removed afterward. Cloudflare API inventory and authoritative DNS confirmed cleanup. The full `pnpm verify:local` suite passed, including 461 API tests, 150 web tests, two proxy workerd tests, ten diagnostic tests, builds, generated clients, Flutter checks, and isolated PostgreSQL verification.

This intentionally disallows other Cloudflare Workers from calling the public API, including Worker-based monitors and integrations. Direct browsers, native bearer clients, the private service binding, and scheduled handlers remain supported by the code paths and local tests. The app rollout and deployed compatibility checks remain pending; the proxy recovery flag is retained.

## References for platform assumptions

- [Cloudflare visitor-IP behavior in Worker subrequests](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip-in-worker-subrequests)
- [Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Cloudflare native rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Better Auth rate limiting](https://www.better-auth.com/docs/concepts/rate-limit)

Recheck current platform documentation and repository code before relying on a historical observation for a future release.
