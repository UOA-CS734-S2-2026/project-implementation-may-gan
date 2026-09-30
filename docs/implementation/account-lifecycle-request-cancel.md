# Account lifecycle request and cancellation slice

This slice adds the authenticated request, cancellation, and status routes from issue #161. It does not start a worker, claim purge work, delete an account, delete posts, delete R2 objects, or alter export deadlines. `ACCOUNT_DELETION_REQUESTS_ENABLED` must equal `enabled` before a new request can be accepted. Missing configuration is disabled. Cancellation of an existing pending request remains available when new requests are disabled.

## Transition contract

- Request and cancellation lock user, session, lifecycle, then management grant in that order. A missing lifecycle row is created only while the user row lock is held.
- Management grants are bound to the user, session, action, current lifecycle generation, PostgreSQL expiry, and one-time consumption. Consumption and the state transition are in one transaction.
- PostgreSQL creates the request, cancellation, and purge deadlines at 168 and 336 hours. Cancellation checks `cancel_until > now()` and fails exactly at the boundary.
- A successful request keeps only the proof session as a policy-restricted session. Other sessions, socket tickets, push registrations, and queued recipient delivery work are invalidated in the committed transaction. Realtime Durable Object revocation is post-commit and best effort because the pending lifecycle policy is the fail-closed authority.
- A successful cancellation increments generation, deletes all sessions and socket tickets, and returns `reauthenticationRequired: true`. It does not mint an unrestricted token or bypass Terms, age, underage, link-revocation, or post-Trash policy.

## Visibility and writes

Pending authors are filtered from feeds, post detail, username search, and profile lookup in the database query before pagination. Message write access treats a pending peer as activity-blocked under the existing conversation lock. Existing recipient message history is not deleted or concealed by this slice.

Media-download authorization on this base is not yet a post-media serving route. When issue #190 lands media-reference and download routes, those queries must include the same pending-author predicate before any object authorization or signed URL is issued.

## Migration integration blocker

No migration is included. The reviewed foundation base already owns lifecycle and management-grant schema. Migration numbering has a known `0014` naming collision between main media history and the private foundation history. Do not rebase, renumber, copy, or create ad hoc lifecycle DDL. Export issue #191 owns the next coordinated DDL after `0027`; this slice must be integrated only after that owner resolves the migration journal and filename plan.

## Remaining #161 work

Physical purge, bounded worker claims, report-only execution, export cancellation at purge start, post and object cleanup, participant finalization, and clients remain separate work. This route slice deliberately has no scheduled handler or production activation path.
