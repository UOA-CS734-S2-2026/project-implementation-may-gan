# Google account-management reauthentication plan

This is a coordinated follow-up to #159. It is a design and test plan only. No Google reauthentication endpoint or migration is included in this branch.

## Why the current tables are insufficient

`account_management_grants` is the final, opaque proof result. It has no field for an OAuth state, nonce, redirect continuation, or provider subject. `registration_intents` is bound to registration Terms and age choices. Reusing either table would mix unrelated purposes and risks storing provider bearer material in a lifecycle record.

The next migration prefix is reserved for #174 integration. Allocate a new prefix only after that work settles.

## Minimal record

Create a server-owned `account_google_reauthentication_intents` record with only:

- a SHA-256 state digest as the primary key, never the state token
- the current Dayli user ID and Better Auth session ID
- the management action and captured lifecycle generation
- a nonce digest or Better Auth-owned nonce reference
- issued, expiry, and consumed timestamps

The record must not retain an ID token, authorization code, access token, refresh token, email, profile, or redirect URL supplied by a client. It expires after a short fixed server-derived interval and is consumed atomically.

## Browser flow

1. Resolve the current Better Auth session and account policy. Reject a state and action pair before redirecting.
2. Generate opaque state server-side, store only its digest with user, session, action, lifecycle generation, and expiry.
3. Ask Better Auth to begin Google OAuth with server-owned state and nonce handling. Do not let the client select a callback target.
4. At the callback, let Better Auth validate state, issuer, audience, signature, expiry, and nonce. Read the verified provider subject from Better Auth's stored account mapping.
5. Require that the subject is already linked to the same current Dayli user. A different subject, a missing mapping, a changed session, a changed lifecycle generation, or a consumed or expired intent fails generically.
6. Consume the intent and issue the existing short-lived management grant in one transaction or a reviewed equivalent. The later lifecycle mutation must consume that grant while rechecking state and generation.

## Native flow

Native clients may submit a provider proof only to a Better Auth-supported validation endpoint. The server must obtain the verified subject from Better Auth, then apply the same linked-subject, session, action, lifecycle-generation, expiry, and single-use checks. It must not parse, trust, or compare a client-supplied JWT claim or email.

## Required tests

- Browser state and nonce mismatch, expiry, replay, wrong callback, and malicious return URL.
- Native invalid signature, issuer, audience, expiry, and nonce cases through Better Auth or its supported provider adapter.
- Google-only, password-plus-Google, and attacker-linked-other-account identities.
- Session revocation, session switching, lifecycle cancellation and re-request generation changes, concurrent intent consumption, and wrong action.
- Cookie browser origin checks and native bearer requests without Origin.
- Playwright desktop and mobile-browser journeys, plus Flutter Android and iOS integration journeys when #165 and #169 provide the client shells. API tests cannot substitute for those end-to-end checks.
