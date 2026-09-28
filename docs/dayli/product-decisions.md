# Product decisions

These decisions were agreed by the team in September 2026. Change them through a reviewed documentation update before changing dependent permissions or schemas.

## Friendship and post history

When a friendship becomes active, both users can read all previously released posts with the `friends` audience. Ending or blocking the friendship removes journal access. Solo posts remain owner-only.

Authors may edit released posts. Each edit creates an immutable revision. Readers see an `Edited` marker and can inspect earlier versions when they still have permission to read the post.

## Daily prompt versions and tomorrow notes

The server owns the daily prompt for each Auckland calendar day. Version-one reference data reuses the 366 prompts and stable `prompt-MM-DD` IDs from `732-workspace/group-project-wdcc` at source commit `7d2dfd6`. Prompt rows are immutable. A changed prompt is a new versioned row with a new ID and an Auckland effective date; historical posts continue to reference the original prompt row and text.

The submitted tomorrow note is an immutable author-only note stored outside ordinary post and revision projections. It becomes visible only to its author from the following Auckland day. It is separate from a chosen-date future-self note. Editing post content never exposes the tomorrow note early or to another reader.

## Blocking and messages

Blocking immediately prevents new messages, read receipts, typing or presence events, profile access, and journal access. Existing direct-message history remains readable by both users. Neither user can resume the conversation until the block is removed.

### Messaging scope clarification

The messaging planning conversation selected text direct messaging on web and Flutter, with inboxes, unread badges, read receipts, replies, reactions, editing, and unsending. Friends may start conversations immediately; non-friends may send one initial message until the recipient accepts. Authors may edit their messages within 15 minutes and unsend them later. Unsent messages retain a tombstone without the body; previously seen text and delivered alerts cannot be recalled.

Foreground updates use hibernating WebSockets with small change notifications and authorized REST fetches, not periodic polling. Mobile push through FCM/APNs is in scope, with configuration and physical-device verification as release gates. Image/video attachments remain blocked on the separate R2 upload owner. Group chats are deferred until group membership and blocking rules are agreed.

The [messaging handoff](../implementation/messaging-implementation-handoff.md) distinguishes these confirmed choices from proposed defaults requiring review, including edit/unsend behavior during a block, request reopening, reaction limits, and push presentation. These clarifications do not mark any messaging feature as implemented or override the existing block rule without review.

## Shared links

Shared links do not create account grants.

A public account can create an opaque, unlisted link for a released non-solo post. Anyone with the link can view that post without signing in. The post does not become discoverable through profile or search views. Links do not expire automatically, but the author can revoke them. Deleting the post or making the account private also invalidates its links. Forwarded links work until invalidated, and downloaded copies cannot be recalled.

For a private account, a link grants no access. A viewer must sign in and be an active friend. Solo posts cannot have public links.

## Media and supported devices

A post accepts up to three attachments in any mix of photos and videos. Each attachment is limited to 10 MB, the post total is limited to 25 MB, and each video is limited to 15 seconds. Clients compress media before upload. Keep the schema capable of supporting a higher attachment count later.

The initial release supports iOS 16 and newer and Android 10, API 29, and newer. Features unavailable on a supported device need a documented fallback.

## Database provider and migrations

Neon PostgreSQL 18 is the database provider. Staging uses a separate Neon project for synthetic data only. The staging owner reports restricted roles, grants, and migrations verified. Hyperdrive and an API Worker are attached, and the full private transaction proof passed at `1fb6388`. A synthetic staging browser account was created for a manual email/password test. Google, Resend, and native auth remain untested. Production will use a separate project and is not deployed. Schema changes are additive, forward-only Drizzle migrations owned by `packages/db` and released staging-before-production through the protected manual workflow documented in [Database migrations](database-migrations.md).

## Deletion, backups, and recovery

Deleted posts and accounts must become inaccessible through the application immediately. The planned cleanup job runs as the `migrator` role and removes active database records and media in dependency order: post children (`tomorrow_notes`, `post_revisions`, legacy media, and `post_media`) before posts, then relationship rows and post children before accounts. Immutable-history triggers must allow this bypass only for that cleanup role; every batch must be recorded and retried on failure. Encrypted backups may retain deleted data for up to 30 days while they age out. Operators do not use backups to selectively restore content that a user deleted.

For course and pilot stages, the recovery point objective is 24 hours and the recovery time objective is 8 hours. These are targets until a recorded restoration exercise verifies them.

## Existing frontend reuse

Andrew Meads approved reuse of the existing frontend around August 2026 on the condition that the team rebuilds the backend. Keep the approval evidence in the team's course records. Attribute imported code to `732-workspace/group-project-wdcc` and its source commit. Do not import credentials, dependencies, build output, or obsolete backend code.
