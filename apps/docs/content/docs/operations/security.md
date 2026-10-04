---
title: Security operations
description: Operate Dayli's permissions, credentials, abuse controls, privacy boundaries, and incident response without exposing user data.
---

# Security operations

Security operations keep the rules in the code true after deployment. That includes checking who may act, limiting credentials, responding when providers fail, and collecting enough evidence to fix a problem without creating a second privacy problem in the logs.

Dayli has staging, not a documented production application environment. The procedures here apply to reviewed staging operations and incident preparation. They do not claim a pager, on-call rotation, production control, or legal response process exists.

## Authentication and authorization are different checks

Authentication answers who sent the request. Authorization answers whether that authenticated person may perform this action on this resource now.

Dayli uses Better Auth sessions from host-only Secure, HttpOnly, `SameSite=Lax` cookies for browsers and signed bearer sessions for native clients. A valid session is not permission to read every post, change every friendship, or enter every conversation. Routes and repositories apply resource policy again, with race-sensitive checks inside the same PostgreSQL transaction as the write.

Useful examples include:

- the server derives the actor from the verified session, never a user ID supplied in request data;
- active reciprocal friendship is required for friend-only reads;
- one block in either direction denies the relevant peer action;
- media access repeats the current parent post or profile check;
- messaging checks participant and block state in the write transaction;
- hidden resources commonly return `404` so the response does not confirm their existence.

Interface guards improve navigation but are not a security boundary. If a hidden button is the only thing stopping an action, the action is not protected.

Read [Accounts and authentication](/docs/systems/accounts-and-authentication), [Friends and feed visibility](/docs/systems/friends-and-feed-visibility), [Media uploads and storage](/docs/systems/media-uploads-and-storage), and [Messaging](/docs/systems/messaging) for the system-specific policies.

## Current profile and content privacy

Older records describe all profile posts as friend-only. Current server policy is more precise.

- An owner can read their active posts, including `solo` and unreleased posts.
- Active friends can read released `friends` posts.
- Other signed-in or anonymous readers can read released `friends` posts when the author has a public profile.
- `solo` and unreleased posts remain owner-only even for public profiles.
- A known block in either direction returns `404` before a public-profile grant.
- Private profiles can still appear in narrow authenticated username search results so a request can be sent, but that result does not reveal the profile or archive.

Web and Flutter now provide signed-out public profile and post journeys. They refetch when session identity changes and return a person to the same route after sign-in without automatically replaying a friend, message, like, or comment action. Do not use interface copy as the authorization specification. The shared database predicates in `apps/api/src/features/permissions` remain authoritative.

Likes and comments keep the owner-and-friend boundary even on a public profile. Their routes require a signed-in account with a username, and each action checks that the post is still visible through the friend preview policy. Public post access does not grant interaction access.

Messages are not end-to-end encrypted. Dayli's authorized backend can read stored text to deliver and manage a conversation. Unsend clears current stored content and leaves a tombstone, but it cannot recall text a recipient or operating system already displayed or saved.

## Browser and API boundary

The web Worker can proxy browser API requests through the private `BrowserProxyEntrypoint`. The public API remains available for mobile, realtime tickets, and other supported direct paths.

The proxy has one configured upstream. It strips forwarding, hop-by-hop, Cloudflare, and internal headers, rejects public Worker callers, and does not proxy upload bytes or browser WebSockets. Unsafe cookie-authenticated API requests require an exact trusted origin. CORS by itself is not a mutation defence because it may hide a response after a request has already changed state.

Proxy mode and origins are release inputs. Change them through the coordinated workflow described in [Environments and deployment](/docs/operations/environments-and-deployment). Do not disable origin checks, accept wildcard origins, trust a forwarded actor header, or route around the private entrypoint to recover a release.

TLS protects supported HTTPS and WSS traffic in transit. Private R2 storage and signed URLs control storage access. These controls do not make message text end-to-end encrypted, and they cannot recall downloaded media. An authenticated signed R2 URL remains usable until its short expiry even if access changes meanwhile.

## Rate limits and abuse controls

Dayli uses native Cloudflare rate-limit bindings for ingress, general reads and writes, messages, media, realtime, and selected direct actions. Keys include a public environment scope so staging buckets do not overlap another environment.

An exhausted healthy bucket returns `429` with `Retry-After`. A missing binding, invalid scope, absent edge source address, or limiter backend failure returns `503`. This fail-closed choice avoids silently removing abuse controls during a provider fault. The health route and CORS preflight are handled separately.

Rate limits are one layer, not authorization or capacity proof. Do not increase them during an incident merely to hide `429`, and do not remove them to turn `503` green. First distinguish legitimate exhaustion from `rate_limit_backend_unavailable`, inspect binding names and environment scope, and use sanitized aggregate counts. Never log raw IP addresses, actor IDs, source fingerprints, auth headers, or limiter keys.

Username search also has a PostgreSQL-backed per-account quota of 30 searches in 60 seconds. That persistent feature limit is distinct from edge request limits.

## Least privilege and credential handling

Use the smallest credential for each job:

- the Worker uses the restricted `app` role through Hyperdrive;
- migrations use the direct `migrator` role only inside protected workflows;
- reviewed lifecycle and export work uses a separate `lifecycle_worker` connection;
- the Cloudflare deployment token remains in CI and never becomes a Worker secret;
- R2 credentials stay bucket-scoped;
- browser `NEXT_PUBLIC_*` inputs contain no secrets.

GitHub environment and Worker metadata can confirm a name exists. They cannot confirm its value is current or equal in two stores. Follow [Environment configuration](/docs/operations/environment-configuration) for the inventory, destinations, and provider-specific rotation order.

Do not print secrets to compare them. Do not use shell environment dumps, raw Worker settings payloads, database URLs, cookie values, bearer tokens, reset links, signed R2 URLs, socket tickets, device tokens, or service-account JSON as evidence.

### Rotate ordinary provider credentials

Where the provider permits overlapping credentials, create a new least-privilege credential, update the protected source, run the owning workflow, perform the focused check, and only then revoke the old credential. Google, Resend, R2, and the Cloudflare deployment token have different destinations, so one generic bulk rotation is unsafe.

Changing `BETTER_AUTH_SECRET` invalidates signed sessions. Plan a new sign-in check and user impact. Do not rotate it to switch browser proxy mode.

`PUSH_TOKEN_ENCRYPTION_KEY` is deliberately not synchronized by the normal GitHub secret sync. Replacing or losing it makes existing encrypted push registrations unreadable. Rotation needs a reviewed data and key migration, not a routine `secret put`. `FCM_SERVICE_ACCOUNT_JSON` may be synchronized only when the owner-managed encryption key exists.

The observed staging inventory on 4 October 2026 did not contain either push secret. Treat push as unconfigured in that snapshot, not as enabled encryption or successful FCM delivery. Code support is not deployed proof.

## Privacy-aware logging and evidence

Collect the smallest record that can answer the operational question. Safe evidence usually includes:

- allowlisted failure category;
- UTC timestamp and environment label;
- code revision or workflow run when known;
- method and path template, without query strings;
- status class and named component;
- aggregate count or bounded duration.

Do not retain request or response bodies, message text, profile fields, email addresses, raw browser console dumps, cookies, authorization headers, full URLs, signed query strings, R2 keys, conversation IDs, object IDs, raw provider errors, or database rows.

The staging authentication synthetic follows this rule. It prints fixed phase labels, durations, and allowlisted categories, and keeps no screenshot, trace, HAR, browser storage, or raw Playwright error. Use [Synthetic testing](/docs/development/testing/synthetic-testing) as the model for credentialed browser evidence.

Operational logs are not an analytics archive. If a new category is needed, add the narrow category and a fixture that proves sensitive values cannot appear.

## Incident handling

An incident is a suspected or confirmed loss of confidentiality, integrity, availability, or control. Examples include a leaked credential, unauthorized content access, an origin-check bypass, unexpected data changes, a provider compromise, or logs containing private content.

### Triage and contain

1. Record the UTC start time, reporter, environment, affected component, known revision, and a sanitized symptom category.
2. Preserve existing workflow and provider metadata. Do not download broad data sets or turn on verbose body logging.
3. Decide whether the issue is authentication, authorization, credential exposure, data integrity, availability, or privacy disclosure. More than one category may apply.
4. Escalate to the repository or environment owner. The repository does not define a pager, so use the team's approved human channel rather than inventing one here.
5. Use the narrowest approved containment control. Examples are revoking one credential, disabling one provider integration, stopping a release, or using an existing feature flag. Do not improvise database deletion or broaden permissions.
6. If configuration must change, use the protected workflow and preserve review. An emergency does not make copied credentials safer.

For a suspected credential leak, assume exposure until the owning provider says otherwise. Revoke or rotate the specific credential, inspect provider metadata for use in the relevant time window, redeploy through the owning workflow, and test the affected path. Consider dependent material separately. Rotating a deploy token does not rotate Worker secrets.

For suspected unauthorized data access, stop sharing raw samples. Preserve category, timestamps, affected route class, account or object count if it can be computed safely, and revision. Access to user content for investigation requires explicit owner approval and the minimum necessary scope. Do not paste content into an issue or chat.

### Recover and learn

Recovery should restore the intended policy, not merely make the alert disappear. Verify the denied case as well as the allowed case, record what remains uncertain, and distinguish local reproduction from deployed evidence.

After containment, write a sanitized incident record with timeline, cause, affected boundary, evidence limits, actions taken, credential rotations, data handling decisions, and follow-up owners. Legal notification, user communication, data retention, and external reporting requirements need the institution's approved process and accountable owner. This repository does not define those requirements, so do not invent thresholds or deadlines.

## Security verification boundaries

Local API, web, PostgreSQL, and workerd tests cover many policy and adapter cases. They do not prove Cloudflare edge identity, current provider credentials, deployed origin lists, or physical-device push.

The [authentication security record](/docs/systems/accounts-and-authentication/security-and-verification) documents dated edge experiments and remaining gaps. The [media verification guide](/docs/systems/media-uploads-and-storage/setup-and-verification) separates fake-storage tests from real R2 checks. The [messaging verification guide](/docs/systems/messaging/setup-and-verification) separates local Durable Object and PostgreSQL evidence from deployed WebSocket and device proof.

State the narrow result you have. "The local denied-access test passed" is useful. "Security is verified" is not.
