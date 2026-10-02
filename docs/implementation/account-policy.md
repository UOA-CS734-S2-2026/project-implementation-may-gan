# Account policy boundary

This #159 slice installs a server-owned policy boundary before every `/api/v1/*` route in the configured Worker app. Exact public exceptions are health, OpenAPI, and contract-test reads. Every other route defaults to the ordinary capability, so new routes cannot accidentally become available to restricted accounts.

`GET /api/v1/account/status` and `GET /api/v1/account/policy` are authenticated, content-free, `Cache-Control: no-store` reads. They return only a stable restriction and allowed capability names. They are intentionally not added to OpenAPI so the generated mobile and web clients remain byte-for-byte on their existing API contract.

The PostgreSQL projection treats a missing lifecycle row as active. Draft and notice Terms never gate access. Once an effective Terms version reaches its server timestamp, existing users must accept that exact version and make the separate age declaration before ordinary use. Active bans take precedence over all policy states. Purging and failed purge take precedence over underage, pending-deletion, and legal gates. Pending deletion remains restricted to policy and lifecycle reads, cancellation verification, export, and signout capabilities.

No physical deletion, lifecycle transition, legal publication, checkbox flow, export worker, or provider proof is included. Messaging storage and participant authorization are unchanged: this slice neither deletes retained history nor changes the authorized cleanup paths introduced through migration 0024. Realtime ticket issuance, WebSocket upgrade, delayed realtime delivery, and push destination decryption each repeat a fresh ordinary-capability check. A failed lookup suppresses delivery or upgrade before any payload or push token is exposed.

Restricted accounts may still use only exact owner-scoped negative cleanup routes: unsend and reaction removal, request decline or cancellation, push-device unregister, avatar removal, friendship removal, and unblock. Route matching is exact, and repository ownership checks remain authoritative. Request acceptance and every other positive write retain the ordinary capability.

## Deliberately deferred blockers

`operator_cases` remains unavailable to the `app` role. The policy model has an underage-restricted precedence branch, but the deployed projection never asserts it. A future change must expose only the current subject's boolean restriction through a narrow reviewed database view or procedure. It must not grant `app` direct operator-case access.

Although 0019 contains session-bound account-management-grant storage, this slice does not expose issuance or consumption. There is no reviewed lifecycle mutation endpoint to consume a grant, and password or Google reauthentication needs an end-to-end Better Auth proof design. Adding a token-producing endpoint without its action consumer would broaden the API without completing an authorization boundary.
