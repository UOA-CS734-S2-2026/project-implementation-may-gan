# Terms and age acceptance backend

Status: backend contract and enforcement slice for issue #164. This does not publish a policy, set an effective date, or implement the web or Flutter restricted screens.

## Rollout

The database contains no seeded effective Terms version. Until an operator publishes a reviewed, renderable canonical Terms document with a matching SHA-256 digest, registration remains unchanged and the legal endpoints return `terms: null`. This is deliberate. A draft or notice record does not activate registration enforcement or an existing-user gate.

Before activation, an approved canonical UTF-8 document must be inserted into `legal_document_contents` for the exact version. The API verifies its SHA-256 digest against `legal_document_versions` on every current-Terms read. A missing or mismatched source fails closed for registration and acceptance, and `/api/v1/legal/terms/current/content` returns only verified source. The backend does not create or edit legal versions. Production activation requires approval, digest verification, and the owner and legal release gates. Development must not seed an unapproved version as a workaround.

Material Terms notices require at least 30 days between notice start and effective time, including direct publication and notice-to-effective transitions. A shorter window requires a nonblank recorded urgent reason. Minor notices do not create acceptance rows and do not require reacceptance.

## API contract

- `GET /api/v1/legal/terms/current` returns the server-owned effective Terms metadata and its digest-verified content URL, or `null` before publication.
- `GET /api/v1/legal/terms/current/content` returns canonical UTF-8 source only after the server verifies the version digest.
- `GET /api/v1/legal/terms/notice` returns a current notice, including whether it is material and any urgent reason, or `null`.
- `POST /api/v1/legal/registration-intents` requires literal `acceptTerms: true` and `declareAge16OrOlder: true`. It returns opaque 256-bit intent and flow-binding values, current server Terms metadata, `age-16-v1`, and a server expiry. It never accepts a client version, digest, actor ID, or timestamp.
- `POST /api/v1/account/legal/acceptance` accepts only a live Better Auth cookie or bearer actor. It requires literal affirmations plus the displayed current Terms ID and digest. It is idempotent, preserves the original database timestamp, and records no birth date.

The public legal routes are exact account-policy exemptions. The acceptance route is an exact restricted-management capability, so Terms-blocked and age-blocked users can complete it. An Origin header must match a trusted browser origin. Native bearer requests omit Origin. Every write requires JSON.

## Registration boundary

When current Terms are effective, the Better Auth HTTP authority atomically consumes an intent before a new email or native Google account request reaches Better Auth. Email and native requests carry both opaque values in `x-dayli-registration-intent` and `x-dayli-registration-binding`. Browser OAuth first binds Better Auth's server-generated state to the intent, then the callback consumes that binding. Existing linked Google users do not create a user row and are not asked for a new-registration intent. Google identity verification remains inside Better Auth, never an email match or raw claim check.

Intent consumption is an atomic database update and occurs before account creation. A provider failure consumes the proof rather than permitting a replay. The authority sets the selected server version on the single request database session. The value is explicitly cleared in a `finally` block before the connection is released. An `AFTER INSERT` user trigger verifies the current version and atomically writes both the Terms acceptance and `age-16-v1` declaration in Better Auth's user transaction. No database lock is held across Google or email-provider work.

Password reset and restored sessions do not create a user and cannot acquire an ordinary capability while current Terms or the age declaration is missing. Existing users are never inferred to have agreed. A reviewed underage restriction remains independent from any age checkbox and is not changed by acceptance.

## Verification boundary

The PostgreSQL suite covers app-role-only legal writes, effective publication provenance, canonical content verification, intent replay concurrency, server timestamps, and the Better Auth email creation boundary. Google provider callback and native signed-token fixtures remain required coverage for the corresponding client integration work. Web, Android, and iOS restricted-screen and full journey coverage remains owned by #165 and #169.
