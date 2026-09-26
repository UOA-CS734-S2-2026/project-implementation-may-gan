# Supabase to Neon migration boundary

Status: the repository contains a users-and-login-accounts direct-transfer script. No legacy or production data has been copied, modified, or queried for this document.

## Implemented users and accounts import scope

`pnpm db:migration:users-and-accounts` is a direct PostgreSQL to PostgreSQL transfer, not an export/import workflow. It reads only `public.user` and `public.account` from Supabase with a separately provisioned `LEGACY_SUPABASE_USERS_ACCOUNTS_READONLY_DATABASE_URL` credential, then writes only those two tables in Neon with the protected `users_accounts_importer` role. It preserves text user and account IDs, profile fields other than legacy bans, timestamps, Better Auth provider IDs and account IDs, account-to-user links, and compatible credential password hashes.

The command is a dry run unless `--apply` and `APPLY_USERS_ACCOUNTS_IMPORT="IMPORT users and accounts"` are both supplied. It validates both complete table shapes, uses a read-only source transaction, requires exactly the known three fixture users and zero fixture-owned accounts, checks user, account, and provider identity uniqueness, uses a transaction-scoped advisory lock plus serializable apply transaction, and never updates an existing target row. An exact replay is accepted without a write. A user ID, email, username, account ID, or `(provider_id, account_id)` collision blocks the whole import. The JSON report has aggregate counts only.

This implemented scope is narrower than the full-data boundary below. Posts, post media, friendships, requests, conversations, messages, read state, comments, likes, `session`, and `verification` are not read or transferred. Omitted records are not deleted from Supabase or Neon. The full-data policy remains the contract for a future separately approved importer.

### Account compatibility and sensitive-material policy

The local legacy code uses Better Auth 1.5.6 with its default email/password setting. Its installed implementation and the target Better Auth 1.7.5 implementation both use the `salt:derived-key` lowercase hexadecimal format produced by scrypt with `N=16384`, `r=16`, `p=1`, a 16-byte salt, and a 64-byte derived key. The importer copies a password only for `provider_id="credential"`, requires `account_id=user_id`, and rejects any hash outside that exact format. It does not transform passwords. Other hash formats, custom password hooks, credential account mappings other than `account_id=user_id`, password material on non-credential accounts, and providers other than the locally configured `google` are blockers, not fallback/reset behavior.

For a Google account the importer preserves only `id`, `user_id`, `provider_id`, `account_id`, and account timestamps. It intentionally does not select or copy `access_token`, `refresh_token`, `id_token`, token expiry fields, or `scope`. These fields are sensitive, may be expired or revoked, and Better Auth 1.7.5 can be configured to encrypt OAuth tokens, whereas the target currently does not enable that option. A source token cannot therefore be assumed to be plaintext or compatible with a target encryption configuration. OAuth tokens and scopes are reacquired only after a fresh provider authorization.

Structural account copy is not proof of Google sign-in. The new deployment must independently configure the Google client ID, client secret, approved target callback URI, trusted origins, consent screen, and the Better Auth Google provider before a tested Google authorization can use the copied `(provider_id, account_id)` mapping. The current target worker has no Google provider configuration. A conflicting email or provider subject must block or follow an explicitly approved account-linking policy, never be merged by this importer.

The user approved discarding legacy bans because they have no meaningful source ban history. The importer never selects or copies `banned`, `ban_reason`, or `ban_expires`. New target users retain the schema defaults of `false`, `null`, and `null`; replay never clears or replaces any target ban fields. The schema columns remain available for future moderation. Sessions and verification records are deliberately excluded, so all users must establish a new session. Credential users can sign in only when the supported hash validation succeeds; no password reset is performed by the importer.

Before a rehearsal, an administrator must provision the source role with `CONNECT` and `SELECT` on `public.user` and `public.account` only. On Neon, do not run the retained owner and migrator bootstrap files until a secure first-password procedure for restricted SQL-created roles has been verified. Neon rejects `psql`'s `\password` hash. Defer the `users_accounts_importer` credential until an approved rehearsal needs it; do not create the role through Neon Console or place a plaintext password in SQL Editor, shell history, Git, or chat. Rerun the migrator bootstrap after both Better Auth target tables exist so it grants only `USAGE` on `public` plus `SELECT` and `INSERT` on `public.user` and `public.account`, then rerun the read-only role verification. Use direct TLS URLs from a protected secret store. Do not run the command against a live database without the source-freeze, rehearsal, backup, and release approvals in this document.

Dayli will move from the legacy Supabase PostgreSQL database in the WDCC implementation to Neon PostgreSQL. Neon is the only target. This document fixes the data boundary for later rehearsal and cutover work. It does not approve a production cutover, create a Neon schema, change application connections, or transfer data.

## Non-negotiable operating policy

- Preserve every non-fixture user and its existing text primary key. Later import work must insert the legacy user ID as the Neon identity key, not generate a replacement.
- Preserve non-fixture posts, post media metadata, friendships, friend requests, conversations, messages, conversation read state, comments, and likes with their legacy primary and foreign keys where those tables have them.
- Do not migrate `session` rows or `verification` rows. Users must establish a new session in the target system.
- Omit only the documented seed fixtures and only after the fixture-reference checks below show that the omission is referentially safe. Do not use names, email addresses, dates, or an ad hoc pattern to identify fixtures.
- At cutover, Supabase becomes read-only before the final source inventory. There is no dual-write period. The application switches to Neon only after a successful rehearsal and approved verification.
- Rehearse the complete import and verification procedure against an isolated copy before any production cutover. Phase one does not authorise a source export or production database access.
- Cloudinary media bytes are outside this PostgreSQL boundary. `post_media` metadata is in scope, but media-byte retention, access, and any R2 copy require the Cloudinary checkpoint below.

## Legacy source inventory

The boundary was derived from the legacy repository at `732-workspace/group-project-wdcc`, specifically `lib/db/schemas` and `lib/db/seed`. It has not been inferred from a live database. The table names below are therefore the only schema contract accepted by the phase-one inventory command.

| Legacy table | Policy | Import condition or note |
| --- | --- | --- |
| `user` | Include | Preserve every non-fixture row and its `id`. Preserve profile metadata subject to the target privacy model. |
| `account` | Include with restrictive field policy | Preserve account ID, user link, provider ID, provider account ID, credential password hash only when it matches the documented Better Auth format, and timestamps. Never select or copy OAuth tokens, token expiry fields, or scope. |
| `session` | Exclude | Deliberately invalidated at cutover. |
| `verification` | Exclude | Deliberately invalidated at cutover. |
| `daily_prompts` | Recreate as reference data | The known prompt catalog is seed data but non-fixture posts reference it. Recreate the approved catalog with stable prompt IDs before importing posts, then verify its ID coverage. Do not silently omit it. |
| `posts` | Include | Preserve non-fixture posts, IDs, author IDs, prompt IDs, timestamps, text, captions, ratings, and local dates. |
| `post_media` | Include as metadata | Preserve non-fixture post media IDs, post IDs, Cloudinary `public_id`, URL, type, order, and timestamps. This does not copy bytes. |
| `friendships` | Include | Preserve relationships for non-fixture users and their composite keys. |
| `friend_requests` | Include | Preserve IDs, endpoints, status, and timestamps for non-fixture users. |
| `conversations` | Include | Preserve IDs, both participant IDs, initiator IDs, status, and timestamps. |
| `messages` | Include | Preserve IDs, conversation IDs, sender IDs, bodies, and timestamps. |
| `conversation_reads` | Include | Preserve composite keys, last-read message IDs, and timestamps as messaging state. |
| `comments` | Include | Preserve IDs, post and author links, reply hierarchy, text, and timestamps. |
| `post_likes` | Include | Preserve composite keys and timestamps. |

The expected dependency order for a later full-data import is reference prompts, users and accounts, posts, post media, friendships and requests, conversations, messages, conversation reads, comments, then likes. The users-and-accounts importer does not transfer dependent content. The later full-data implementation may use an equivalent transaction-safe order, but it must not disable constraints and leave unresolved references.

## Known fixture baseline

These static counts come from the legacy seed source, not from a hosted database. They contain no customer data and are the only baseline counts committed to Git in phase one.

| Fixture set | Expected rows | Identity rule |
| --- | ---: | --- |
| users | 3 | Exact IDs: `seed_user_alice`, `seed_user_bob`, `seed_user_carol` |
| accounts | 0 | No fixture-owned accounts are allowed. Any such row blocks the import. |
| posts | 12 | The exact post ID and author pairs in the closure below |
| post media | 0 | No post-media seed exists |
| friendships | 4 | The exact composite keys in the closure below |
| friend requests | 2 | The exact request ID and endpoint keys in the closure below |
| daily prompts | 366 | IDs formed as `prompt-MM-DD` |

### Exact exclusion closure

Later import code may exclude only these exact source keys. It must not exclude all rows owned by or related to fixture users.

- Users: `seed_user_alice`, `seed_user_bob`, `seed_user_carol`.
- Posts owned by `seed_user_alice`: `seed_post_alice_1`, `seed_post_alice_2`, `seed_post_alice_3`, `seed_post_alice_4`, `seed_post_alice_5`, `seed_post_alice_6`, `seed_post_alice_7`, `seed_post_alice_8`, `seed_post_alice_9`.
- Posts owned by `seed_user_bob`: `seed_post_bob_1`, `seed_post_bob_2`.
- Posts owned by `seed_user_carol`: `seed_post_carol_1`.
- Friendships: (`seed_user_alice`, `seed_user_bob`), (`seed_user_bob`, `seed_user_alice`), (`seed_user_alice`, `seed_user_carol`), and (`seed_user_carol`, `seed_user_alice`).
- Friend requests: (`req_alice_to_bob`, `seed_user_alice`, `seed_user_bob`) and (`req_carol_to_alice`, `seed_user_carol`, `seed_user_alice`), expressed as (`id`, `sender_id`, `receiver_id`).

The fixture user IDs are not a deletion rule. A row that merely references a fixture user is not safe to discard. For example, a real user's like of a fixture post is an unexpected fixture-linked row and must be preserved or deliberately remediated before exclusion. There are no known fixture rows in `post_media`, conversations, messages, conversation reads, comments, or likes.

## Repeatable sanitized baseline inventory

`pnpm db:migration:inventory` is the only phase-one database tool. It requires `LEGACY_SUPABASE_READONLY_DATABASE_URL`, rather than the Neon migration URL. Its connection must target a TLS-protected `*.supabase.co` PostgreSQL endpoint. Provision its role with `CONNECT` and `SELECT` only on the listed legacy tables. Do not use an owner, service-role, migration, or application credential.

The command opens `BEGIN READ ONLY`, applies a 3-second local lock timeout and 15-second local statement timeout. It makes only aggregate `count(*)` queries against the fixed table list, fixture-reference joins, and foreign-key-style reference checks. It emits table labels and decimal counts only. It never selects IDs, profile fields, messages, tokens, URLs, Cloudinary metadata, or credentials. Its errors are sanitised and never echo the connection string.

Run it only after an authorised source administrator has supplied a dedicated read-only credential, and redirect the output to an approved protected evidence location. Do not commit generated source counts to Git, since small aggregates can still be operationally sensitive. The command does not retry automatically. On a sanitized timeout failure, confirm that source writers and maintenance work are idle, then retry once. If it times out again, stop and escalate to the source administrator. Do not relax timeouts, use a stronger credential, or run a write query to work around the failure.

```bash
LEGACY_SUPABASE_READONLY_DATABASE_URL='postgresql://inventory_reader:<password>@<project>.supabase.co/postgres?sslmode=require' \
  pnpm db:migration:inventory > /secure/location/supabase-inventory.json
```

The output has this sanitised shape. Counts are decimal strings so the tool never loses precision.

```json
{
  "format": "dayli-supabase-neon-inventory/v1",
  "source": "supabase-postgresql",
  "readOnlyTransaction": true,
  "counts": {
    "user": "<aggregate>",
    "posts": "<aggregate>",
    "post_media": "<aggregate>"
  },
  "knownFixtureRows": {
    "user": "3",
    "posts": "12",
    "friendships": "4",
    "friend_requests": "2"
  },
  "unexpectedFixtureLinkedRows": {
    "posts": "0",
    "post_media": "0",
    "friendships": "0"
  },
  "sourceReferenceViolations": {
    "posts.author_id": "0",
    "messages.conversation_id_or_sender_id": "0"
  }
}
```

The full output includes every table in the boundary, exact known-fixture counts, unexpected fixture-linked counts for every included dependent table, and source reference-violation counts. Before exclusion, known fixture counts must equal 3 users, 12 posts, 4 friendships, and 2 friend requests. Every unexpected fixture-linked and source reference-violation count must be zero. Save one output before the rehearsal source copy, one after the source write freeze, and the equivalent Neon reconciliation evidence after each rehearsal. Record the code revision, operator, timestamp, source read-only confirmation, and evidence location separately. Do not add account names, hosts, credentials, row contents, or individual identifiers to that record.

## Rehearsal and cutover gates

A later migration implementation may proceed only when all of these checks pass:

1. **Source freeze:** the legacy application and all scheduled writers are disabled or confirmed read-only. The final aggregate inventory succeeds using the dedicated source role. There is no target write before this gate.
2. **Fixture safety:** inventory reports exactly 3 known users, 12 known posts, 4 known friendships, and 2 known friend requests. Every unexpected fixture-linked and source reference-violation count is zero. The importer excludes only the exact closure above. Any mismatch is a blocker, not a reason to broaden the fixture rule.
3. **Target shape:** Neon has reviewed schema constraints and the recreated prompt catalog before dependent rows are imported. The importer uses the source IDs directly.
4. **Row reconciliation:** for every included table, Neon counts equal the source counts after subtracting the approved fixture closure. The check records aggregate counts only.
5. **Identity and relationship integrity:** every expected non-fixture user ID exists exactly once in Neon. All post, media, friendship, request, conversation, message, read-state, comment, reply, and like foreign keys resolve. Duplicate composite relationships remain absent.
6. **Exclusions:** Neon contains zero imported legacy `session` and `verification` records. The account reconciliation confirms every imported account links to an imported user, has a unique `(provider_id, account_id)`, and has null token, token-expiry, and scope columns.
7. **Application evidence:** a rehearsal verifies sign-in or reauthentication, posts with media metadata, social relationships, requests, messaging, comments, and likes against the imported target. It must also verify that legacy URLs or Cloudinary references follow the approved media decision.
8. **Recovery:** the rehearsal records the Neon restore point, the forward-fix plan, and a tested decision to return the application to the previously read-only legacy service only before cutover approval. After the Neon switch, use the Neon restore and forward-fix procedures in [Database migrations](database-migrations.md).

A production cutover additionally needs the normal protected-environment approval, a fresh Neon restore point, a successful rehearsal of the same importer revision, and release-owner approval. This document does not replace those controls.

## Cloudinary checkpoint

Cloudinary is not PostgreSQL storage. The legacy `post_media` table holds Cloudinary `public_id` and delivery URL metadata, while profile images are stored as URLs in `user.image`. The phase-one inventory never calls Cloudinary and never treats a database row as proof that an asset exists or is accessible.

Before rehearsal, the release owner must choose and document one option:

1. retain Cloudinary as the asset system of record and validate every retained metadata reference with a Cloudinary inventory that does not expose URLs or asset names in shared evidence, or
2. copy approved assets to R2 with an authorised media migration, record an ID mapping, verify object count and content checksums in a protected record, and update metadata only after verification.

The decision must address post media and profile images, ownership and credentials, private-access rules, transformations, deletion/retention, broken or missing assets, rollback, and whether existing Cloudinary delivery URLs remain valid. Until it is approved, a rehearsal may validate relational metadata only. It must not claim that media bytes were migrated.

## Open decisions and blockers

- **OAuth deployment:** configure and test the Google provider independently. Copied provider identity mappings do not prove a Google callback, client registration, linking decision, or token refresh will work.
- **Prompt catalog ownership:** approve the exact target prompt catalog and stable ID strategy. Existing non-fixture posts require every referenced legacy prompt ID to exist before import.
- **Fixture closure:** confirm the static fixture baseline against the final aggregate inventory. Unexpected records linked to fixture identities block deletion until reviewed.
- **Cloudinary:** select retention or authorised R2 migration before any claim of media completeness.
- **Target schema mapping:** the current `packages/db` schema is still a foundation baseline. The importer cannot be built until its tables and constraints represent this boundary.

See [Database migrations](database-migrations.md) for Neon role and release controls, [Environments](environments.md) for credential handling, and [Existing code](existing-implementation.md) for the legacy-source review.
