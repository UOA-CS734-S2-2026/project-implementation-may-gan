# Central account policy foundation

This slice adds the server-side policy boundary for #159. It does not add account deletion mutation, cleanup execution, provider changes, or a client-side authorization bypass.

## Enforced now

`createAppForEnv` installs account-policy middleware before every `/api/v1/*` route. Every path is restrictive by default. The only public exceptions are exact `GET` health, OpenAPI, and contract-test routes. The restricted management entries are exact method and normalized-path matches. A lookalike, suffix, trailing-slash variant, or wrong method is an ordinary capability unless a reviewed route adds it to the allowlist.

The middleware resolves the Better Auth cookie or bearer session on the server, reads a content-free account-policy projection, and returns `403 FORBIDDEN` with a stable `details.restriction` value before ordinary feature middleware or repositories run. Resolver failures return `503`, never an allow decision. It applies to media, posts, relationships, messaging, realtime tickets, push-device routes, profile setup, and future `/api/v1` paths without changing those feature repositories.

`GET /api/v1/account/status` and `GET /api/v1/account/policy` are authenticated, no-store restricted-state reads. They contain only the restriction name and allowed capability names. They do not disclose deadlines, legal documents, operator cases, profile data, or another account's state.

The policy treats users with no lifecycle record as active. A present lifecycle row is authoritative. `pending_deletion`, `purging`, and `purge_failed` take precedence over legal gates. Pending accounts can read their restricted status, verify cancellation, export, read policy state, and sign out. They cannot use ordinary private routes. Purging accounts cannot export because an export must be removed when purge starts.

Terms and age gates activate only when an effective Terms version has reached its effective time. Draft and notice records cannot lock users out. Effective Terms require acceptance of that exact version. The age declaration remains separate and stores no birthday.

## Management grants

`account-management-grants.ts` provides the database primitive for reauthentication routes. It creates a 256-bit opaque token, derives a fixed 10-minute expiry from the server-issued instant, and stores only its SHA-256 digest. Callers cannot choose an expiry. Consumption atomically binds the digest to the original user, session, action, unconsumed state, grant expiry, and a still-live Better Auth session. Replayed, expired, revoked-session, and account-confused grants return the same false result.

`POST /api/v1/account/reauthenticate/password` now verifies the current cookie or bearer session through Better Auth's supported `/verify-password` handler. It requires an exact trusted browser origin when an Origin header is present, compares the verified Better Auth user to the current policy actor, and returns only a short-lived opaque grant in a no-store response. It accepts no asserted user ID. Normal sign-in has no lifecycle mutation and cannot cancel pending deletion.\n\nGoogle reauthentication is not implemented. It needs a server-owned browser continuation with Better Auth's OAuth state handling, plus a native flow that validates provider proof through Better Auth and compares the resulting linked provider subject to the active account. Do not accept a raw Google ID token or email claim at an account-management endpoint.

## Remaining integration work

`operator_cases` remains inaccessible to `app`, by design. The policy projection therefore does not yet read temporary underage restrictions. Add a narrowly scoped, reviewable database procedure or view that reveals only an actor's boolean restriction state before enabling the underage policy branch. Do not grant `app` direct operator-case access.

Deletion request, cancellation, export, appeal, and legal-acceptance endpoints remain later slices. The declared capability classifications reserve their policy gates without creating a lifecycle executor.\n\nThe messaging delivery runtime now resolves the same policy immediately before publishing realtime work or decrypting an FCM destination. Realtime delivery composes that policy with the existing leased-outbox, current-membership, and block authorization check. Non-ordinary recipients, including pending deletion, lifecycle failure, Terms, and age-restricted accounts, receive no delayed realtime or push delivery. Policy lookup failures suppress delivery. Realtime ticket issuance and ticket-based connection recheck ordinary capability before accepting a live session. This does not alter recipient identity or conversation retention, which remains #160 work.\n\n#160 remains required before physical user deletion.
