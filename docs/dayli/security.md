# Security and privacy

## The chosen privacy model

Dayli uses HTTPS, encryption at rest, and application access controls for both posts and messages. It does not use end-to-end encryption. The backend can read content for delivery, recovery, media handling, and mood analysis. Private content is not public, but it is not cryptographically hidden from Dayli's operators.

This supersedes the earlier Matrix and client-managed key proposal. There are no account encryption identities, recipient key grants, cross-device key transfers, or recovery codes. Normal authenticated access and account recovery govern server-held history.

Explain this in user-facing privacy language. Do not describe DMs, solo entries, or biometric lock as protection from the service provider.

## Threat boundaries

Protect against unauthorised users, stolen credentials, insecure links, accidental public media exposure, injection, XSS, abusive uploads, leaked logs, and vulnerable dependencies. A compromised privileged server, database credential, or authorised operator account can expose content. Provider disk encryption does not stop those attacks.

Use TLS for client/API, API/provider, realtime, storage, email-provider, and database connections with certificate validation. Verify encryption at rest for PostgreSQL, media, provider snapshots, and backups. Restrict administrative access, require MFA, use least-privilege credentials, and audit sensitive operator actions.

Keep production access limited to necessary people. Avoid routine inspection of private content. Any moderation or support access needs explicit role checks, purpose, and audit records.

## Authorisation policy

| Resource | Who may access it |
| --- | --- |
| Solo entry | Owner, unless they explicitly issue a selected-post share. |
| Friends entry before release | Owner only. |
| Friends entry after release | Owner and authorised friends, subject to blocks. |
| Explicitly shared post | Owner and valid grant recipients, subject to release and revocation. |
| Conversation/message | Its current authorised participants, subject to request status and block policy. |
| Mood history, recap, future note | Owner. Sharing a post does not share their history or recap. |
| Media | A viewer authorised for the attached post, after any release gate. Pending uploads remain owner-only. |
| Realtime channel | Authenticated owner of the user-scoped channel, subscribe-only. |

Public username/avatar/profile discoverability must not make posts public. Check IDs and ownership on every route. Apply the same policy to list, detail, nested-resource, media, export, and sharing endpoints. The Flutter or React UI never decides permission for the backend.

## Account and session security

Keep Better Auth as the authentication authority. Browser sessions need Secure, HttpOnly cookies where supported by the chosen flow, an appropriate SameSite policy, and CSRF/origin checks for mutations. Flutter stores native bearer sessions in Keychain/Keystore-backed storage. Do not use localStorage for long-lived browser bearer tokens.

Test expiry, logout, revocation, password reset, session lists, and stolen-device signout. Configure reset emails with short-lived single-use tokens, throttling, generic responses that avoid account enumeration, and session revocation policy. Account recovery restores access to server-held content; it cannot restore a draft that never left a lost phone.

Native OAuth needs state, exact redirects, PKCE where the selected flow supports it, and a safe single-use handoff. Never embed an OAuth client secret or put a reusable session token into a deep-link URL. Validate assistant/deep-link parameters independently of the caller.

## Local data and biometrics

Protect mobile drafts and sensitive caches at rest with a tested encrypted database or encrypted-record layer. Keep its local key in protected native storage. This key is device-local storage protection, not a shared E2EE identity. Losing it may lose unsynced drafts; server-held posts and messages remain recoverable after login.

`local_auth` prompts are not enough to prove protected key storage. Test whether key access requires device authentication, plus passcode fallback, changed biometric enrolment, lockout, reinstall, and key invalidation. Clear sensitive UI state when the app locks and obscure app-switcher previews.

Minimise persistent browser caching of private content. Keep offline browser draft support limited unless its storage policy is implemented and tested. No plaintext draft/message in analytics, crash reports, clipboard history by default, or unexamined temporary files. A stolen unlocked device or malicious browser script can read content the user can read.

## Private media

Use private object buckets. The API checks the post's current permissions and release time before issuing short-lived downloads. Treat signed URLs as bearer credentials. Redact query strings and use restrictive referrer policy. A previously issued URL may work until expiry even after access is revoked.

Reserve upload paths and byte quotas before granting uploads. Check actual file content and decode limits, not just the supplied MIME type. Reject executable/active formats for post media. Isolate risky processing, strip unnecessary EXIF, and keep originals private. Add scanning as appropriate to supported formats and the upload threat model.

Deletion should remove application records or mark them for deletion and enqueue retried object cleanup. Document backup retention and final purge timing. Neither deletion nor access revocation can erase a recipient's downloaded copy.

## Realtime, messaging, and push

PostgreSQL stores message bodies, and the backend may read them. Restrict queries to participants and bound pagination. Authorise read receipts and request acceptance too. Lock pending-request state during writes to prevent concurrent sends from bypassing its one-message limit.

Only the backend publishes realtime invalidations. Mint short-lived, narrowly scoped Ably tokens. Keep message bodies out of broker payloads so every content read still passes REST authorisation. Ably and push providers still see operational metadata; list them in the privacy inventory.

Use generic lock-screen notifications by default. A push should not expose a private rating, journal extract, track, future note, or message body. Unregister invalid tokens, associate tokens with the current account, and remove associations on logout. Never use public notification topics to distribute private content.

## Context and sharing

Ask before location or microphone access. Show exactly which weather/music/audio context will accompany an entry. Remove or coarse-grain location metadata unless users explicitly choose to keep it. Provider lookup failures and denied permissions must leave posting usable.

Screenshot alerts are best-effort reports, not proof that capture happened or that no capture occurred. They cannot detect external cameras, all OS mechanisms, or modified clients. Tell viewers when reporting is active and avoid accusatory wording when capture-to-post attribution is uncertain.

Hash invitation tokens in PostgreSQL, expire them, apply atomic use limits, and never log them. A single-use link can be forwarded before redemption; disclose that the first authenticated claimant receives access. Offer recipient-bound grants for stronger control. Signup does not establish friendship or broader archive access.

## OWASP review

Consult the current [OWASP Top Ten](https://owasp.org/www-project-top-ten/) and [Mobile Application Security Verification Standard](https://mas.owasp.org/MASVS/). Record evidence and remaining risks in course issues.

| Risk | Control and test evidence |
| --- | --- |
| Broken access control | Cross-user ID tests for posts, media, messages, grants, profiles, and history; test before release and after block/revocation. |
| Cryptographic failures | TLS verification, provider storage/backup encryption checks, local storage inspection, secret management, no false E2EE claims. |
| Authentication failures | Session/recovery tests, throttling, safe native OAuth, administrative MFA, stolen-device signout. |
| Injection and XSS | Parameterised SQL, bounded Zod inputs, escaped text, restricted URLs, no arbitrary HTML, CSP. |
| Insecure design | Review deadline races, invitation forwarding, reset abuse, pending-message races, and quota exhaustion before implementation. |
| Misconfiguration | Private buckets, database exposure checks, restricted CORS, protected internal jobs, non-production test credentials. |
| Supply-chain and integrity failures | Lockfiles, reviewed dependency changes, protected branches, scoped CI tokens, secrets/signing controls. |
| Logging and monitoring failures | Redacted structured logs, request IDs, access-denied and auth alerts, audit records, no private content or reset tokens in telemetry. |
| SSRF and unsafe integrations | Do not fetch arbitrary user-provided music/media URLs server-side. Allowlist provider hosts and check redirects/private addresses when proxying. |
| Resource exhaustion and exceptional conditions | Byte quotas, bounded cursors/date ranges, timeouts, outbox leases, retry limits, safe failure handling. |

The existing limiter has a fail-open path. Decide deliberately which operations may continue when Upstash is unavailable. Authentication, invitation redemption, and upload issuance need protective fallback limits or temporary refusal, not unlimited access.

Use synthetic canary content to inspect database access, logs, local storage, telemetry, media URLs, and push payloads. Server-readable content in the authorised database is expected; the same content in an unrelated log or another user's response is a failure.
