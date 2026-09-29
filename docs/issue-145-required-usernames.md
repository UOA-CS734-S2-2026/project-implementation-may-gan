# Issue 145: required usernames

## What changed

Password registration now sends a required username, email, password, and an optional public name. The username is the stable public lookup handle. Better Auth's immutable `user.id` remains the authorization identity.

Google does not copy a provider name into the public profile. New Google accounts and imported accounts without a username are routed to `/setup-username` on web and mobile before application screens or session-bound integrations start. Logout remains available there.

`POST /api/v1/profile/username` is actor-scoped, private (`Cache-Control: no-store`), and one-time. It cannot rename an existing username. Relationship, messaging, realtime, and push-device APIs reject username-less actors in production, even if a client bypasses navigation.

## Migration and rollout

`0013_required_usernames.sql` deliberately does not rewrite legacy handles. It:

1. Adds a trigger that normalizes and validates new handles while leaving legacy rows untouched when unrelated profile fields change.
2. Takes a transaction advisory lock per case-folded handle in that trigger. It rejects case-insensitive collisions without requiring a unique lower-case index that could fail against legacy duplicates.
3. Does not backfill `display_username` from Better Auth's provider-owned `name`. Public cards and messaging peers use an explicitly chosen `display_username`, falling back to the username.

Apply the migration using the protected migration workflow, after its required restore-point check, before deploying the Worker and clients. Do not apply it directly to a live database. Existing duplicate or uppercase imports are intentionally left unchanged and may not be renamed by this release.

## Verification

Run `pnpm verify:local`, `pnpm --filter @dayli/api test:realtime`, `pnpm generate:clients:check`, and `cd apps/mobile && flutter test`. For PostgreSQL validation, use the local test database to exercise two concurrent claims of the same mixed-case username and confirm exactly one succeeds.
