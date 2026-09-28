# Friends UI feature implementation plan

Status: approved feature work on `feature/friends-ui`, based on `refactor/backend-action-slices` at `cd00116`.

## Confirmed product scope

- Authenticated people can search a **username prefix** after entering at least two characters. Search is bounded, debounced by clients, cursor-paginated, stably ordered, and rate limited in a persistent transaction.
- Search deliberately includes private accounts as a narrow discovery exception. A result exposes only `username` and a display name, plus the opaque account ID needed for a relationship command. It never exposes email, biography, image, visibility, or a profile URL. This is not an ordinary private-profile access grant.
- An account without a username is not discoverable. Signup and profile setup must assign a username before that account can be found. There is no email or display-name fallback.
- Search and friend/request projections exclude the actor, active blocks in either direction, and banned accounts. A user absent from the `user` table is unavailable and excluded. The current lifecycle schema has no soft-delete column; a banned account remains excluded while `banned` is true, except an expired temporary ban is treated as inactive.
- There is intentionally no public blocked-user directory. Existing direct block/unblock commands remain available to callers that already know a relationship target, but discovery must never reveal a blocked identity.
- Web and Flutter replace their friends placeholders with search, current friends, and incoming/outgoing requests. They show loading, empty, and recoverable errors. They protect against stale async responses after a session/account change.

## API shape

Add relationship action slices, sharing the existing verified `require-session` middleware and no-store feature middleware:

- `GET /api/v1/relationships/search?q={username-prefix}&limit=&cursor=` returns minimal discoverable cards and a relationship state useful for the add/request controls.
- `GET /api/v1/relationships/friends?limit=&cursor=` returns active friends as minimal cards.
- Extend `GET /api/v1/relationships/requests` with the other participant's minimal card, retaining its request identifier and direction semantics.

The server derives the actor solely from Better Auth. Relationship mutations continue to use existing action endpoints. Search uses an actor-owned, transactional fixed-window quota, rather than an in-memory Worker counter.

## Delivery sequence

1. Add and test contracts, database quota/index migration, minimal projections, block and lifecycle filters, pagination, and rate limits.
2. Register routes and regenerate OpenAPI TypeScript and Dart clients.
3. Add client-side relationship adapters/controllers, then web and Flutter screens with focused tests, including in-flight account-switch safety.
4. Verify unit, route, generated-client, type, lint, Flutter, and isolated PostgreSQL coverage. Do not use or tear down shared database volumes.

## Integration note

Migration `0009_relationship_search` and the generated relationship contracts overlap with the separate messaging work. No deployed migration history was changed and this branch must not be rebased or cherry-picked onto messaging until the orchestrator selects the migration ordering and resolves the shared contract generation deliberately.
