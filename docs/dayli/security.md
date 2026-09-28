# Security and privacy

Content is server-readable. HTTPS, encryption at rest, and permissions protect it, but a privileged backend compromise can expose it. Restrict operator access, require administrative MFA, and audit sensitive actions. Do not claim end-to-end encryption.

## Permissions

| Resource | Access |
| --- | --- |
| Solo post | Owner only. Solo posts cannot have public links. |
| Friends post | Owner before release; active friends afterward, including friends who joined after release, subject to blocks. |
| Public shared post | Anyone with its active opaque link after release; it remains unlisted. Private-account links grant no access. |
| Messages | Authorised participants, subject to request/block policy. |
| Mood history, recap, future note | Owner. |
| Media | Pending reservations are owner-only. Future media reads must apply the same permission and release checks as their post. |
| Socket | Verified user's own Durable Object. |

Enforce checks on every list/detail/export/preview route. A public profile does not expose a journal through profile or discovery views; only an active opaque link exposes its linked released post. Restrict database exposure; privileged Drizzle connections can bypass RLS, so services must authorise independently. Keep private responses out of shared caches.

## Sessions and sockets

Detailed ticket, alarm, and revocation behaviour is in the [implementation reference](../implementation/implementation-reference.md).

Better Auth is the sole identity authority. Browser cookies need Secure/HttpOnly settings, appropriate SameSite, exact credentialed CORS, and CSRF/origin checks. Flutter stores bearer sessions in protected native storage. OAuth needs safe state, redirects, PKCE where supported, and no reusable credentials in URLs. The [authentication compatibility slice](authentication-compatibility.md) records the current Worker and Flutter proof and the remaining deployment checks.

Socket tickets are short-lived, single-use, session-bound, and atomically consumed. Validate browser origins. Only internal bindings publish updates. Persist expiry metadata and enforce revocation after hibernation; ordinary timers are insufficient. Fetch message bodies through authorised REST.

Password recovery uses expiring one-time tokens, throttling, safe email delivery, and session-revocation policy. It restores server history, not lost unsynced drafts.

## Data and device protection

Keep R2 private. The current reservation route limits the declared type and size, but actual type validation, attachment linking, and private downloads are not implemented. The completed flow must enforce three attachments, 10 MB per attachment, 25 MB per post, and 15-second videos. It must issue short-lived private downloads and redact signed URLs and secrets. Revocation cannot recall downloaded copies or immediately cancel existing URLs. Deleted data becomes inaccessible immediately, cleanup removes active records and media, and encrypted backups expire within 30 days.

Protect local drafts/credentials and hide app-switcher previews. `local_auth` alone does not prove protected key storage. Test passcode fallback, lockout, enrolment changes, and reinstall. Minimise browser persistence and temporary files.

Push defaults to generic text. Remove account token associations on logout. Location/microphone need informed consent and preview. Screenshot reporting is best-effort. Store only hashes of public share tokens and support immediate revocation. Disclose that forwarded links work until invalidated.

## Required review

Use [OWASP Top Ten](https://owasp.org/www-project-top-ten/) and [MASVS](https://mas.owasp.org/MASVS/) to test cross-user access, SQL injection/XSS, OAuth/reset abuse, SSRF/provider URLs, dependency/secrets handling, media decoding, and resource exhaustion.

Use parameterised SQL, bounded validation, escaped text, scoped credentials, redacted logs, and safe failure policies. Cloudflare throttles are approximate; enforce strict quotas transactionally. Inspect seeded canary content for leakage into logs, caches, telemetry, or other users' responses.
