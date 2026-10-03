# Self-service export inventory, draft baseline

This is the source inventory for the single export service in #162, shared with #64, #65, and #66. It is not an active export implementation or approval to release user data. The machine-readable decisions are in `packages/db/src/export/inventory.ts`. The schema check lists every current table and column, compares them to the migrated PostgreSQL schema, and fails if a new column is not classified. A checked-in decision never automatically adds a field to an archive.

## Inclusion boundary

The planned owner-scoped sources are profile fields, owned active posts and revisions, private notes, currently readable authored messages, minimal Terms and age evidence, and still-restorable posts under `trash/`. Post and avatar upload bytes are in scope only when a source procedure independently proves the owner, live post or avatar link, reservation, and exact R2 object key. The binary source is not yet implemented. Message authorship alone does not authorize an export: the requester must also retain normal readable-history access at each page. Blocks do not erase readable history. Received bodies and reply previews are excluded. Content resembling a URL stays unchanged; internal signed URLs and R2 keys are never emitted as record fields.

The `post_revisions.previous_attachment_refs` JSON family is not exported as an arbitrary blob. Only `media_id`, `attachment_order`, and `status` may appear after validation. The registered object namespaces are `media/` and `private/data-exports/v2/`. A new namespace, JSON key family, table, or column requires its own inventory entry, source review, and positive or negative fixture before the service can be declared complete.

Authentication storage, secrets, push tokens, sessions, grant and OAuth state, logs, lifecycle control data, recipient identities, received messages, request fingerprints, raw legacy Cloudinary URLs, and operator cases are excluded from the self-service ZIP. Their exclusion does not settle a separate formal access request. Recipient-held conversation history and reactions survive a sender's deletion under the messaging retention decision, but the sender's archive cannot include another participant's private content.

## Retention and provider boundary

Account content remains subject to its own account and post Trash deadlines. A Trash item may enter `trash/` only while database time is strictly before its original restore deadline. Exports do not pause or extend a deletion. Ready archives expire after 24 hours, and purge takes precedence. The private cleanup inventory, durable archive ownership, unresolved incident evidence, and late multipart completion recovery are not implemented by this inventory checkpoint.

Dayli-controlled diagnostic and security logs have a 30-day maximum under #157. Minimal unresolved cleanup evidence expires 30 days after resolution. The separate content-free purge receipt expires 30 days after cleanup completion. Cloudflare, R2, Google, and delivery-provider retention cannot be inferred from PostgreSQL; verify live provider settings separately. No provider objects, raw logs, archive URLs, or credentials are made exportable by this inventory.

## Verification still required

The inventory unit test checks exact Drizzle tables and fields, JSON key families, and excluded canaries. The PostgreSQL test compares the inventory with the migrated `public` schema, including handwritten migrations. Before #162 merges as a service, add real owner-scoped source tests for every included kind, negative canaries for every exclusion family, object ownership proofs, lease and lifecycle races, ZIP limits, authenticated download, and provider-failure cleanup tests. These tests do not substitute for live R2 verification or approval to enable a destructive worker.
