# Security and privacy

Content is server-readable. HTTPS, encryption at rest, and permissions protect it, but a privileged backend compromise can expose it. Restrict operator access, require administrative MFA, and audit sensitive actions. Do not claim end-to-end encryption.

## Permissions

| Resource | Access |
| --- | --- |
| Solo post | Owner only. |
| Friends post | Owner before release; active friends afterward, including friends who joined after release, subject to blocks. |
| Public-account friends post | Anyone after release. A known signed-in block is denied before public-profile access. |
| Messages | Authorised participants, subject to request/block policy. |
| Mood history, recap, future note | Owner. |
| Media | Pending reservations are owner-only. Public avatar and post-media reads use an authorized Worker route that rechecks the current parent on every request. |
| Socket | Verified user's own Durable Object. |

Enforce checks on every list, detail, export, preview, and media route. A public profile exposes released `friends` posts, but never `solo`, unreleased, deleted, trashed, detached-media, or blocked content. Account visibility is the only anonymous journal-read grant. There are no public share tokens. Restrict database exposure; privileged Drizzle connections can bypass RLS, so services must authorise independently. Keep profile and post responses out of shared caches.

## Sessions and sockets

Detailed ticket, alarm, and revocation behaviour is in the [implementation reference](../implementation/implementation-reference.md).

Better Auth is the sole identity authority. Browser cookies need Secure/HttpOnly settings, appropriate SameSite, exact credentialed CORS, and CSRF/origin checks. Flutter stores bearer sessions in protected native storage. OAuth needs safe state, redirects, PKCE where supported, and no reusable credentials in URLs. The [authentication security and verification page](../../apps/docs/content/docs/systems/accounts-and-authentication/security-and-verification.mdx) records the current Worker and Flutter proof and the remaining deployment checks.

Socket tickets are short-lived, single-use, session-bound, and atomically consumed. Validate browser origins. Only internal bindings publish updates. Persist expiry metadata and enforce revocation after hibernation; ordinary timers are insufficient. Fetch message bodies through authorised REST.

Password recovery uses expiring one-time tokens, throttling, safe email delivery, and session-revocation policy. It restores server history, not lost unsynced drafts.

## Data and device protection

Keep R2 private. The reservation route limits the declared type and a 10 MB size, completion checks the uploaded object's actual size, format, and 15-second video limit, and post creation enforces three photos or one video and 25 MB per post when it links uploads to the post. Clients strip photo EXIF and video location metadata before upload, and never log or store presigned URLs. Authenticated owner and friend downloads use 5-minute private URLs after the post permission check; see [Downloads](media-reservations.md#downloads). Anonymous public-profile media instead passes through an authorized Worker route that rechecks its parent on every request. It does not use a permanent public URL or an anonymous signed URL window. Logs and errors never include signed URLs, object keys, or secrets. Downloaded copies cannot be recalled. Deleted data becomes inaccessible immediately, cleanup removes active records and media, and encrypted backups expire within 30 days.

Protect local drafts/credentials and hide app-switcher previews. `local_auth` alone does not prove protected key storage. Test passcode fallback, lockout, enrolment changes, and reinstall. Minimise browser persistence and temporary files.

The camera is used only when the author chooses it. The app asks for access at that tap, never when the composer opens or in the background, and a refusal never blocks posting (see [Camera access](media-reservations.md#flutter-client)). Dayli does not save photos or videos taken in the app to the device photo library, and the compressor strips EXIF and location metadata from them before upload, as for library picks. A photo or video the system finishes after Android ends the app is added only to the draft of the user who started it: the app records the user and draft before opening the camera or library, and discards or holds for its owner anything that doesn't match, so a second account on the phone can never receive or upload it.

The microphone is used only while the author records a voice memo, and only after they tap record. The app asks at that first tap, after a short explanation that it records only while recording and that the author can listen to the memo and remove it before posting. It never records when the composer opens, on returning to the app or in the background: recording stops if the app leaves the foreground, and closing the composer mid-take discards the take. A refusal never blocks posting (see [Voice memo recording](media-reservations.md#voice-memo-recording)). The recording is written to the user's own protected media folder and uploaded to private storage as soon as it is saved, as photos are. Removing or replacing it deletes the file, sign-out deletes it with the user's other media, and an upload that is never posted is removed by cleanup. Once posted, a voice memo has the post's access and retention: only people who can read the post can get a short-lived URL for it, and deleting the post, blocking, or changing the audience stops new URLs immediately. The loudness picture drawn while recording stays on the device and is never uploaded.

Push defaults to generic text. Remove account token associations on logout. Location and microphone access need informed consent and preview. Screenshot reporting is best-effort.

## Required review

Use [OWASP Top Ten](https://owasp.org/www-project-top-ten/) and [MASVS](https://mas.owasp.org/MASVS/) to test cross-user access, SQL injection/XSS, OAuth/reset abuse, SSRF/provider URLs, dependency/secrets handling, media decoding, and resource exhaustion.

Use parameterised SQL, bounded validation, escaped text, scoped credentials, redacted logs, and safe failure policies. Cloudflare throttles are approximate; enforce strict quotas transactionally. Inspect seeded canary content for leakage into logs, caches, telemetry, or other users' responses.
