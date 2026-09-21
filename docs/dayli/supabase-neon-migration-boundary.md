# Supabase to Neon migration boundary

Status: phase one policy and inventory only. No legacy or production data has been copied, modified, or queried for this document.

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
| `account` | Deferred | Contains provider IDs, access tokens, refresh tokens, ID tokens, and password material. Do not copy it until the target authentication and reauthentication plan is approved. |
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

The expected dependency order for a later import is reference prompts, users, posts, post media, friendships and requests, conversations, messages, conversation reads, comments, then likes. The later implementation may use an equivalent transaction-safe order, but it must not disable constraints and leave unresolved references.

## Known fixture baseline

These static counts come from the legacy seed source, not from a hosted database. They contain no customer data and are the only baseline counts committed to Git in phase one.

| Fixture set | Expected rows | Identity rule |
| --- | ---: | --- |
| users | 3 | Exact IDs: `seed_user_alice`, `seed_user_bob`, `seed_user_carol` |
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
6. **Exclusions:** Neon contains zero imported legacy `session` and `verification` records. `account` has not been copied unless a separate approved authentication plan replaces this policy.
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

- **Authentication transition:** approve the target authentication model for legacy `account` rows. The default boundary is no credential, token, or password-material copy, which means users need reauthentication or a separately designed reset/linking flow while retaining their user IDs.
- **Prompt catalog ownership:** approve the exact target prompt catalog and stable ID strategy. Existing non-fixture posts require every referenced legacy prompt ID to exist before import.
- **Fixture closure:** confirm the static fixture baseline against the final aggregate inventory. Unexpected records linked to fixture identities block deletion until reviewed.
- **Cloudinary:** select retention or authorised R2 migration before any claim of media completeness.
- **Target schema mapping:** the current `packages/db` schema is still a foundation baseline. The importer cannot be built until its tables and constraints represent this boundary.

See [Database migrations](database-migrations.md) for Neon role and release controls, [Environments](environments.md) for credential handling, and [Existing code](existing-implementation.md) for the legacy-source review.
