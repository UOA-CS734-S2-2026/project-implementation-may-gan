# Messaging participant identity handoff

Issue #160 adds a durable, profile-free `messaging_participants` row for every user. Its opaque participant ID begins equal to the existing user ID for active-client compatibility, but it is a separate record. The row stores only the active-user mapping, state, and creation time. It stores no email, profile, session, credential, provider account, or message text.

`0015_messaging_participants` backfills every existing user, moves direct pairs, memberships, message senders, reactions, and conversation-change members to participant references, and removes their cascading user foreign keys. A user deletion triggers a participant detachment to `deleted` with a null active-user mapping. Retained messages and reactions therefore remain readable to the other participant. Conversation projections use the literal `Deleted account` only when the mapped participant is deleted, and never join the deleted profile.

Active delivery remains user-based. Realtime outbox jobs are created only for active participant mappings. Existing user-owned outbox jobs, socket tickets, and push devices retain their user foreign keys and are removed with the user. Final realtime and push authorization rechecks an active recipient mapping.

The inspection-only `messaging_retained_conversation_candidates` view identifies conversations with no active participant. It does not delete data and is not an authorization boundary.

## #161 integration boundary

Only the future lifecycle orchestration may physically delete a user, after its claim, generation, and cancellation-window checks establish irreversible cleanup. It must first resolve user-owned relationship dependencies, then delete the user. The participant trigger performs only the safe detachment described above. #161 must treat the candidate view as a hint and must independently establish that every participant's seven-day cancellation window has ended. It must delete conversation children, conversation rows, and retained participant rows in a reviewed, idempotent order. This slice adds no lifecycle procedure, claim path, schedule, worker binding, or destructive conversation cleanup.

The retained message body remains identifying content. This design is retention for the surviving participant, not anonymization. Export work remains out of scope. A future export must select only the requester's authored text and must not expose received reply text.
