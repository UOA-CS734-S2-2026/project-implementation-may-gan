# Security and privacy

Content is server-readable. HTTPS, encryption at rest, and permissions protect it, but a privileged backend compromise can expose it. Restrict operator access, require administrative MFA, and audit sensitive actions. Do not claim end-to-end encryption.

## Permissions

| Resource | Access |
| --- | --- |
| Solo post | Owner unless explicitly shared. |
| Friends post | Owner before release; authorised friends afterward, subject to blocks. |
| Shared post | Active grant recipients after release. No broader archive access. |
| Messages | Authorised participants, subject to request/block policy. |
| Mood history, recap, future note | Owner. |
| Media | Same permission/release checks as its post; pending uploads owner-only. |
| Socket | Verified user's own Durable Object. |

Enforce checks on every list/detail/export/preview route. Public profiles never grant journal access. Restrict database exposure; privileged Drizzle connections can bypass RLS, so services must authorise independently. Keep private responses out of shared caches.

## Sessions and sockets

Detailed ticket, alarm, and revocation behaviour is in the [implementation reference](implementation-reference.md).

Better Auth is the sole identity authority. Browser cookies need Secure/HttpOnly settings, appropriate SameSite, exact credentialed CORS, and CSRF/origin checks. Flutter stores bearer sessions in protected native storage. OAuth needs safe state, redirects, PKCE where supported, and no reusable credentials in URLs.

Socket tickets are short-lived, single-use, session-bound, and atomically consumed. Validate browser origins. Only internal bindings publish updates. Persist expiry metadata and enforce revocation after hibernation; ordinary timers are insufficient. Fetch message bodies through authorised REST.

Password recovery uses expiring one-time tokens, throttling, safe email delivery, and session-revocation policy. It restores server history, not lost unsynced drafts.

## Data and device protection

Keep R2 private; validate real types/sizes and issue short-lived downloads. Redact signed URLs and secrets. Revocation cannot recall downloaded copies or immediately cancel existing URLs. Document deletion and backup retention.

Protect local drafts/credentials and hide app-switcher previews. `local_auth` alone does not prove protected key storage. Test passcode fallback, lockout, enrolment changes, and reinstall. Minimise browser persistence and temporary files.

Push defaults to generic text. Remove account token associations on logout. Location/microphone need informed consent and preview. Screenshot reporting is best-effort. Hash invitation tokens, expire them, and enforce atomic use limits; disclose forwarding risk.

## Required review

Use [OWASP Top Ten](https://owasp.org/www-project-top-ten/) and [MASVS](https://mas.owasp.org/MASVS/) to test cross-user access, SQL injection/XSS, OAuth/reset abuse, SSRF/provider URLs, dependency/secrets handling, media decoding, and resource exhaustion.

Use parameterised SQL, bounded validation, escaped text, scoped credentials, redacted logs, and safe failure policies. Cloudflare throttles are approximate; enforce strict quotas transactionally. Inspect seeded canary content for leakage into logs, caches, telemetry, or other users' responses.
