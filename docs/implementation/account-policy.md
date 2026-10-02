# Account policy boundary

This #159 slice installs a server-owned policy boundary before every `/api/v1/*` route in the configured Worker app. Exact public exceptions are health, OpenAPI, and contract-test reads. Every other route defaults to the ordinary capability, so new routes cannot accidentally become available to restricted accounts.

`GET /api/v1/account/status` and `GET /api/v1/account/policy` are authenticated, content-free, `Cache-Control: no-store` reads. They return only a stable restriction and currently actionable capability names: `ordinary`, `restricted_cleanup`, `policy_read`, and Better Auth signout. Deferred lifecycle, export, appeal, and management labels are not advertised until their routes exist. They are intentionally not added to OpenAPI so the generated mobile and web clients remain byte-for-byte on their existing API contract.

The PostgreSQL projection treats a missing lifecycle row as active. Draft and notice Terms never gate access. Once an effective Terms version reaches its server timestamp, existing users must accept that exact version and make the separate age declaration before ordinary use. Active bans take precedence over all policy states. Purging and failed purge take precedence over underage, pending-deletion, and legal gates. Pending deletion remains restricted to policy and lifecycle reads, cancellation verification, export, and signout capabilities.

No physical deletion, lifecycle transition, legal publication, checkbox flow, export worker, or provider proof is included. Messaging storage and participant authorization are unchanged: this slice neither deletes retained history nor changes the authorized cleanup paths introduced through migration 0024. Realtime ticket issuance, WebSocket upgrade, delayed realtime delivery, and push destination decryption each repeat a fresh ordinary-capability check. A failed lookup suppresses delivery or upgrade before any payload or push token is exposed.

Restricted accounts may still use only exact owner-scoped negative cleanup routes: unsend and reaction removal, request decline or cancellation, push-device unregister, avatar removal, friendship removal, and unblock. Route matching is exact, and repository ownership checks remain authoritative. Request acceptance and every other positive write retain the ordinary capability. Purging and failed-purge accounts are terminal: they may read policy state and sign out, but cannot run cleanup mutations.

The delivery suite exercises real PostgreSQL leasing with two local mock Durable Object endpoints. It proves that an allowed recipient receives only a body-free event and a banned recipient receives no frame. This is not a hosted WebSocket or provider-delivery claim.

## Deliberately deferred blockers

`operator_cases` remains unavailable to the `app` role. The policy model has an underage-restricted precedence branch, but this deployment does not project it. Issue #168 remains deferred until a narrow reviewed boundary can establish the current subject without exposing case data or accepting an arbitrary subject parameter.

Migration 0025 is an inactive Google OIDC intent schema only. It does not grant the app role access to intent rows or management grants, and it provides no proof promotion, grant issuance or consumption, OAuth callback, browser or native endpoint, lifecycle mutation, or live-provider claim. Issue #179 is not complete. A future separately reviewed OIDC boundary must verify signed token claims and fresh `auth_time`, enforce openid-only scope and PKCE, bind the live session, linked raw subject, exact action, and lifecycle generation, issue and consume an expiring single-use grant safely, and clean up expired state.
