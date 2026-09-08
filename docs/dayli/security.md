# Security and privacy

## Privacy boundary

Posts and messages are server-readable. Use HTTPS, verified database/provider TLS, encryption at rest, and server-side access controls. Dayli's backend can read content; private does not mean hidden from the service operator. There is no E2EE, Matrix, or user-held encryption recovery code.

A compromised privileged server or database credential can expose content despite disk encryption. Restrict operator access, require administrative MFA, audit sensitive actions, and avoid routine inspection of private entries.

## Permissions

| Resource | Allowed viewer |
| --- | --- |
| Solo post | Owner, unless explicitly shared. |
| Friends post before release | Owner only. |
| Released friends post | Owner and authorised friends, subject to blocks. |
| Explicitly shared post | Owner and active grant recipients, after release. |
| Messages | Authorised conversation participants, subject to request/block policy. |
| Mood history, recap, future note | Owner; sharing one post grants no archive access. |
| Media | Viewer authorised for its post. Pending uploads remain owner-only. |
| WebSocket updates | Authenticated user connected to their own Durable Object. |

Apply the same checks to list, detail, nested-resource, media, export, and preview routes. Public profile discovery never grants journal access. Disable public database access or verify strict RLS where exposure is required. Privileged Drizzle connections may bypass RLS, so services still enforce authorisation.

## Sessions and sockets

Better Auth runs in the Hono API. Prefer same-site web/API domains with host-scoped API session cookies, credentialed browser requests, an exact CORS allowlist, appropriate SameSite settings, and CSRF/origin checks. Separate preview domains require an explicit auth setup, not wildcard credentialed CORS. Next.js must not create a second identity authority.

Flutter stores bearer sessions in protected native storage. Prove expiry, revocation, logout, Google/native OAuth, and password recovery. OAuth needs state, exact redirects, PKCE where supported, and a safe single-use handoff. Do not embed client secrets or reusable credentials in URLs. Check Sign in with Apple requirements before store release.

Issue short-lived, single-use socket tickets through authenticated REST. Consume atomically, derive the Durable Object identity from the verified session, validate browser origins, and redact tickets. Only internal backend bindings may publish updates; clients cannot choose another user's object or invoke a public broadcast route.

Persist enough connection metadata to enforce expiry after hibernation. Implement logout/revocation signalling and expiration checks. Keep events minimal and fetch bodies through REST, so an event does not bypass content permissions. See [Architecture](architecture.md) for the connection flow.

Normal account recovery restores server-held history. Use one-time expiring reset tokens, throttling, non-enumerating responses, verified delivery configuration, and session-revocation policy. It cannot recover unsynced drafts from a lost phone.

## Local data, media, and notifications

Protect mobile drafts/caches at rest and store local keys/credentials through Keychain/Keystore-backed access. `local_auth` alone is a UI prompt, not proof of hardware-protected keys. Test passcode fallback, changed enrolment, lockout, reinstall, and key invalidation. Hide app-switcher previews and minimise browser persistence and temporary files.

Keep R2 private. Authorise short-lived downloads, redact signed URLs, validate real media types and sizes, and strip unnecessary EXIF. Use bounded safe processing before making uploads available. Revocation cannot recall downloaded copies or immediately expire an already issued URL. Document object deletion and backup retention.

Push is generic by default. No journal extract, rating, track, note body, or message preview goes to FCM/APNs. Associate tokens with the current account, remove them on logout, and clean invalid tokens. Disclosure must include providers that see operational metadata.

## Context and sharing

Location and recording require informed permission and a preview of collected context. Avoid precise location retention by default. Provider failure or denial must not block posting. Screenshot alerts are best-effort, not anti-leak guarantees; disclose reporting and attribution limits.

Store hashed invitation tokens with expiry, atomic use limits, and revocation. An unused single-use link can be forwarded; disclose that the first authenticated claimant gets the selected post. Recipient-bound invitations offer stronger control.

## OWASP evidence

Consult the current [OWASP Top Ten](https://owasp.org/www-project-top-ten/) and [MASVS](https://mas.owasp.org/MASVS/). Record tests and remaining risks in course issues.

| Risk | Required control/evidence |
| --- | --- |
| Broken access control | Cross-user IDs, before-midnight reads, blocked users, revoked grants, socket routing, and cache isolation tests. |
| Cryptographic/auth failures | TLS/storage checks, session and recovery tests, safe OAuth, protected local storage, honest privacy claims. |
| Injection/XSS | Parameterised SQL, bounded Zod inputs, escaped text, restricted URLs, CSP, no arbitrary HTML. |
| Insecure design | Deadline/request races, invitation forwarding, upload abuse, and explicit failure policies. |
| Misconfiguration/supply chain | Private buckets, scoped bindings/CI credentials, reviewed dependencies, separate environments, no secrets in generated clients. |
| Logging failures | Redacted logs and request IDs, auth/access-denied alerts, operator audit records, no content/reset tokens in telemetry. |
| SSRF/unsafe processing | Allowlisted provider hosts, redirect/private-address checks for proxies, bounded media decoding. |
| Resource exhaustion | Route throttles, strict transactional quotas, retry limits, and failure tests. |

Workers rate limiting is approximate and location-local. It cannot enforce exact global quotas. Do not inherit the old limiter's fail-open behaviour for sensitive operations without a protective fallback. Inspect logs, local storage, telemetry, and responses with seeded canary content. Authorised database content is expected; unrelated exposure is a failure.
