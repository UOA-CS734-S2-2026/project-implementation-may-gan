# Product decisions

These decisions were agreed by the team in September 2026. Change them through a reviewed documentation update before changing dependent permissions or schemas.

## Friendship and post history

When a friendship becomes active, both users can read all previously released posts with the `friends` audience. Ending or blocking the friendship removes journal access. Solo posts remain owner-only.

Authors may edit released posts. Each edit creates an immutable revision. Readers see an `Edited` marker and can inspect earlier versions when they still have permission to read the post.

## Editing and deleting posts

Agreed in October 2026 for #76–#78. Authors can edit the reflective answer, caption, rating, and audience of their own post, before or after release. The prompt, day, media, and tomorrow note stay as posted. Anyone other than the author sees only earlier versions that were shared with friends; a version written while the post was solo stays with its author.

Authors can delete a post at any time, which moves it to Trash (#250). It disappears for everyone at once and can be restored for 7 days. If that Auckland day hasn't ended, they can post again for it; a past day can never be reposted, and a restore is refused once the day has a newer post. Cleanup follows the [deletion rules](#deletion-backups-and-recovery) below.

## Likes and comments

Agreed in October 2026 for #79 and #80. The post's author and their active friends can like it and comment on it, and lose that ability the moment they lose access to the post. A public account lets anyone signed in read its released posts, but not like or comment on them. Comments take one level of replies. Commenters can edit and delete their own comments. The post's author can delete, but not edit, any comment on their post. Deleting a top-level comment hides its replies. People across a block don't see each other's likes or comments on a shared friend's post.

## Daily prompt versions and tomorrow notes

The server owns the daily prompt for each Auckland calendar day. Version-one reference data reuses the 366 prompts and stable `prompt-MM-DD` IDs from `732-workspace/group-project-wdcc` at source commit `7d2dfd6`. Prompt rows are immutable. A changed prompt is a new versioned row with a new ID and an Auckland effective date; historical posts continue to reference the original prompt row and text.

The submitted tomorrow note is an immutable author-only note stored outside ordinary post and revision projections. It becomes visible only to its author from the following Auckland day. It is separate from a chosen-date future-self note. Editing post content never exposes the tomorrow note early or to another reader.

## Blocking and messages

Blocking immediately prevents new messages, edits, reactions, unsending, shared read receipts, typing or presence events, profile access, and journal access. Existing direct-message history remains readable by both users. Neither user can resume peer-visible conversation activity until the block is removed. A private read cursor may still clear the actor's own badge without publishing a receipt.

### Messaging scope clarification

The messaging planning conversation selected text direct messaging on web and Flutter, with inboxes, unread badges, read receipts, replies, reactions, editing, and unsending. Friends may start conversations immediately; non-friends may send one initial message until the recipient accepts. Authors may edit their messages within 15 minutes and unsend them later. Unsent messages retain a tombstone without the body; previously seen text and delivered alerts cannot be recalled.

Foreground updates use hibernating WebSockets with small change notifications and authorized REST fetches, not periodic polling. Mobile push through FCM/APNs is in scope, with configuration and physical-device verification as release gates. Image/video attachments remain blocked on the separate R2 upload owner. Group chats are deferred until group membership and blocking rules are agreed.

The [messaging system guide](../../apps/docs/content/docs/systems/messaging/index.mdx) records the implemented request states, reaction limits, and generic push presentation. Provider and physical-device checks remain release gates.

## Profiles

A profile shows the owner every post they have written, including solo posts and today's post before release, labelled so the owner can tell who sees each one. A public account exposes its public name, username, bio, avatar, streak summary, and released `friends` posts to anyone, including visitors without a session. A private account remains discoverable by username, but non-friends receive only that username and a generic private-profile state. An active friend sees the normal private profile and its released `friends` posts. Blocking in either direction hides the whole profile from a known signed-in viewer.

The owner can change their bio, public name, profile visibility, and username. A username can change at most once every 30 days; the previous handle stays reserved for 30 days, and links to it redirect to the new one. The avatar is a photo the owner uploads; provider photos such as a Google account picture are never shown.

## Public post access

Account visibility is the only anonymous journal-read grant. A released `friends` post from a public account is readable through its profile and direct URL without signing in. Changing the account to private, changing the post to `solo`, making it unreleased, deleting it, or moving it to Trash removes that access immediately. Private-account posts still require the owner or an active friend. `solo` and unreleased posts remain owner-only. There are no opaque share links or per-post public tokens.

Public avatars and media attached to publicly readable posts use an authorized Worker route that checks the current parent profile or post on every request. Anonymous reads do not use permanent public object URLs or signed URL windows. Downloaded copies cannot be recalled.

## Media and supported devices

A post accepts up to three photos, or one video. Photos and a video are not mixed in one post, matching the WDCC design (decided for #22). Each attachment is limited to 10 MB after compression, the post total is limited to 25 MB, and each video is limited to 15 seconds. A post may also carry one voice memo, stored as a voice memo, alongside its photos or video: `audio/mp4` only, at most 60 seconds and 2 MB, counted in the 25 MB total, recorded in the mobile app and playable on every device (#63). Clients compress media before upload and remove location metadata. Keep the schema capable of supporting a higher attachment count later.

The initial release supports iOS 16 and newer and Android 10, API 29, and newer. Features unavailable on a supported device need a documented fallback.

## Database provider and migrations

Neon PostgreSQL 18 is the database provider. Staging uses a separate Neon project for synthetic data only. The staging owner reports restricted roles, grants, and migrations verified. Hyperdrive and an API Worker are attached, and the full private transaction proof passed at `1fb6388`. A synthetic staging browser account was created for a manual email/password test. Google, Resend, and native auth remain untested. Production will use a separate project and is not deployed. Schema changes are additive, forward-only Drizzle migrations owned by `packages/db` and released staging-before-production through the protected manual workflow documented in [Database migrations](database-migrations.md).

## Deletion, backups, and recovery

Deleted posts and accounts must become inaccessible through the application immediately. The planned cleanup job runs as the `migrator` role and removes active database records and media in dependency order: post children (`tomorrow_notes`, `post_revisions`, legacy media, and `post_media`) before posts, then relationship rows and post children before accounts. Immutable-history triggers must allow this bypass only for that cleanup role; every batch must be recorded and retried on failure. Encrypted backups may retain deleted data for up to 30 days while they age out. Operators do not use backups to selectively restore content that a user deleted.

For course and pilot stages, the recovery point objective is 24 hours and the recovery time objective is 8 hours. These are targets until a recorded restoration exercise verifies them.

## Existing frontend reuse

Andrew Meads approved reuse of the existing frontend around August 2026 on the condition that the team rebuilds the backend. Keep the approval evidence in the team's course records. Attribute imported code to `732-workspace/group-project-wdcc` and its source commit. Do not import credentials, dependencies, build output, or obsolete backend code.
