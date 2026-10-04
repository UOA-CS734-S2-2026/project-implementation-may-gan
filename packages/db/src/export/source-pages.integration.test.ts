import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const appUrl = process.env.TEST_LIFECYCLE_APP_DATABASE_URL;
const workerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
function fixture(value: string, role: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== role) {
    throw new Error("Export sources require the isolated lifecycle database.");
  }
  return value;
}

(migratorUrl && appUrl && workerUrl ? describe : describe.skip)("reviewed export source pages", () => {
  const migrator = postgres(fixture(migratorUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_lifecycle_test`, "migrator"), { max: 1 });
  const app = postgres(fixture(appUrl ?? `postgresql://app:app@localhost:${port}/dayli_lifecycle_test`, "app"), { max: 1 });
  const worker = postgres(fixture(workerUrl ?? `postgresql://lifecycle_worker:lifecycle_worker@localhost:${port}/dayli_lifecycle_test`, "lifecycle_worker"), { max: 1 });
  const nonce = crypto.randomUUID();
  const owner = `source-owner-${nonce}`;
  const peer = `source-peer-${nonce}`;
  const session = `source-session-${nonce}`;
  const request = `source-request-${nonce}`;
  const lease = `source-lease-${nonce}`;
  const conversation = `source-conversation-${nonce}`;
  const terms = `source-terms-${nonce}`;
  const post = `source-post-${nonce}`;
  const restorable = `source-restorable-${nonce}`;
  const expired = `source-expired-${nonce}`;
  const otherPost = `source-other-post-${nonce}`;
  const revision = `source-revision-${nonce}`;
  const attachment = `source-attachment-${nonce}`;
  const liveMedia = `source-live-media-${nonce}`;
  const foreignKeyMedia = `source-foreign-key-media-${nonce}`;
  const liveReservation = `source-live-reservation-${nonce}`;
  const foreignKeyReservation = `source-foreign-key-reservation-${nonce}`;
  const avatarReservation = `source-avatar-reservation-${nonce}`;
  const note = `source-note-${nonce}`;
  const authored = `source-authored-${nonce}`;
  const received = `source-received-${nonce}`;

  beforeAll(async () => {
    await migrator`insert into public."user" (id, name, email, bio) values
      (${owner}, 'Owner', ${`${owner}@example.test`}, 'My own profile'),
      (${peer}, 'Peer', ${`${peer}@example.test`}, 'Other private profile')`;
    await migrator`insert into public.session (id, token, user_id, expires_at)
      values (${session}, ${`source-token-${nonce}`}, ${owner}, '2090-01-01T00:00:00Z')`;
    await migrator`insert into public.legal_document_versions (id, kind, version, content_digest, status, effective_at)
      values (${terms}, 'terms', 1, ${"d".repeat(64)}, 'effective', now() - interval '2 days')`;
    await migrator`insert into public.terms_acceptances (user_id, terms_version_id, accepted_at)
      values (${owner}, ${terms}, now() - interval '1 day')`;
    await migrator`insert into public.age_declarations (user_id, declaration_version, declared_at)
      values (${owner}, 'age-16-v1', now() - interval '1 day')`;
    await migrator`insert into public.posts
      (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at,
        trashed_at, restore_until, trash_purge_due_at)
      values
      (${post}, ${owner}, '2026-10-02', 'prompt-10-02', 'Own journal', 5, 'solo', now() - interval '2 days', now() - interval '47 hours', null, null, null),
      (${restorable}, ${owner}, '2026-10-01', 'prompt-10-02', 'Restorable journal', 5, 'solo', now() - interval '2 days', now() - interval '47 hours', now() - interval '1 hour', now() + interval '167 hours', now() + interval '335 hours'),
      (${expired}, ${owner}, '2026-09-30', 'prompt-10-02', 'Expired trash', 5, 'solo', now() - interval '10 days', now() - interval '9 days', now() - interval '200 hours', now() - interval '32 hours', now() + interval '136 hours'),
      (${otherPost}, ${peer}, '2026-10-02', 'prompt-10-02', 'Peer private journal', 5, 'solo', now() - interval '2 days', now() - interval '47 hours', null, null, null)`;
    await migrator`update public.posts
      set weather_condition = 'rain', weather_temperature_c = 11, weather_place_name = 'Auckland'
      where id = ${post}`;
    await migrator`insert into public.post_media (id, post_id, attachment_order, detached_at)
      values (${attachment}, ${post}, 0, now() - interval '1 day')`;
    await migrator`insert into public.media_reservation
      (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values (${liveReservation}, ${owner}, ${`media/${owner}/${liveReservation}`}, 'audio/mp4', 512,
        'validated', now() - interval '1 day', now() + interval '1 day'),
        (${foreignKeyReservation}, ${owner}, ${`media/${peer}/${foreignKeyReservation}`}, 'image/jpeg', 300,
        'validated', now() - interval '1 day', now() + interval '1 day'),
        (${avatarReservation}, ${owner}, ${`media/${owner}/${avatarReservation}`}, 'image/jpeg', 256,
        'validated', now() - interval '1 day', now() + interval '1 day')`;
    await migrator`insert into public.post_media (id, post_id, attachment_order, reservation_id, accepted_at)
      values (${liveMedia}, ${restorable}, 0, ${liveReservation}, now() - interval '1 day'),
        (${foreignKeyMedia}, ${post}, 1, ${foreignKeyReservation}, now() - interval '1 day')`;
    await migrator`insert into public.profile_avatars (user_id, reservation_id, set_at)
      values (${owner}, ${avatarReservation}, now() - interval '1 day')`;
    await migrator`insert into public.post_revisions
      (id, post_id, revision_number, previous_reflective_answer, previous_rating,
        previous_audience, previous_prompt_id, previous_attachment_refs, created_at)
      values (${revision}, ${post}, 1, 'Earlier answer', 4, 'solo', 'prompt-10-02',
        jsonb_build_array(jsonb_build_object('media_id', ${attachment}::text, 'attachment_order', 0, 'status', 'detached')),
        now() - interval '1 day')`;
    await migrator`insert into public.tomorrow_notes
      (id, post_id, author_id, note, submitted_at, available_on)
      values (${note}, ${post}, ${owner}, 'Private tomorrow note', now() - interval '1 day', '2026-10-03')`;
    const ordered = [owner, peer].sort();
    await migrator`insert into public.conversations
      (id, user_low_id, user_high_id, initiator_id, participant_low_id, participant_high_id,
        initiator_participant_id, request_state, last_message_sequence, last_change_sequence,
        last_activity_at, created_at, updated_at)
      values (${conversation}, ${ordered[0]}, ${ordered[1]}, ${owner}, ${ordered[0]}, ${ordered[1]}, ${owner},
        'active', 2, 0, now() - interval '1 day', now() - interval '2 days', now() - interval '1 day')`;
    await migrator`insert into public.conversation_members
      (conversation_id, user_id, participant_id, last_read_sequence, receipt_sequence, created_at, updated_at)
      values (${conversation}, ${owner}, ${owner}, 2, 0, now() - interval '2 days', now() - interval '1 day'),
        (${conversation}, ${peer}, ${peer}, 2, 0, now() - interval '2 days', now() - interval '1 day')`;
    await migrator`insert into public.messages
      (id, conversation_id, sequence, sender_id, sender_participant_id, client_message_id, request_fingerprint, body, created_at)
      values (${authored}, ${conversation}, 1, ${owner}, ${owner}, ${`client-${nonce}-one`}, ${"a".repeat(64)}, 'Own authored body', now() - interval '1 day'),
        (${received}, ${conversation}, 2, ${peer}, ${peer}, ${`client-${nonce}-two`}, ${"b".repeat(64)}, 'Received private body', now() - interval '1 day')`;
    expect((await app`select * from public.request_account_export(${owner}, ${session}, ${request})`)[0]?.request_id)
      .toBe(request);
    expect((await worker`select * from public.claim_account_exports(10, ${lease}, 120)`).map((row) => row.request_id))
      .toContain(request);
  });

  afterAll(async () => {
    try {
      await migrator`delete from public.conversations where id = ${conversation}`;
      await migrator`delete from public.relationship_blocks where blocker_id = ${peer} and blocked_id = ${owner}`;
      await migrator`delete from public.tomorrow_notes where id = ${note}`;
      await migrator`delete from public.post_revisions where id = ${revision}`;
      await migrator`delete from public.profile_avatars where user_id = ${owner}`;
      await migrator`delete from public.post_media where id in (${attachment}, ${liveMedia}, ${foreignKeyMedia})`;
      await migrator`delete from public.media_reservation where id in (${liveReservation}, ${foreignKeyReservation}, ${avatarReservation})`;
      await migrator`delete from public.posts where id in (${post}, ${restorable}, ${expired}, ${otherPost})`;
      await migrator`delete from public."user" where id in (${owner}, ${peer})`;
      await migrator`delete from public.messaging_participants where id in (${owner}, ${peer})`;
      await migrator`delete from public.legal_document_versions where id = ${terms}`;
    } finally { await Promise.all([migrator.end(), app.end(), worker.end()]); }
  });

  const page = (kind: string, after: string | null = null, token = lease, limit = 50) => worker<{
    record_key: string; payload: Record<string, unknown>;
  }[]>`select * from public.read_account_export_page(${request}, ${token}, ${kind}, ${after}, ${limit})`;

  it("emits reviewed account and legal evidence without secret profile fields", async () => {
    const [profile] = await page("profile");
    expect(profile?.payload).toMatchObject({ id: owner, bio: "My own profile" });
    expect(profile?.payload).not.toHaveProperty("role");
    expect(profile?.payload).not.toHaveProperty("legal_registration_admission");
    expect(await page("terms")).toEqual([expect.objectContaining({ record_key: terms })]);
    expect(await page("age")).toEqual([expect.objectContaining({ record_key: "age-16-v1" })]);
    expect(await page("not-reviewed")).toEqual([]);
    await expect(app`select * from public.read_account_export_page(${request}, ${lease}, 'profile', null, 50)`)
      .rejects.toThrow();
  });

  it("paginates owned posts and includes only still-restorable Trash", async () => {
    const posts = await page("posts");
    expect(posts.map((row) => row.record_key).sort()).toEqual([post, restorable].sort());
    expect(posts.find((row) => row.record_key === restorable)?.payload).toMatchObject({ reflective_answer: "Restorable journal" });
    expect(posts[0]?.payload).not.toHaveProperty("trash_lease_token");
    expect(posts.find((row) => row.record_key === post)?.payload).toMatchObject({
      weather_condition: "rain", weather_temperature_c: 11, weather_place_name: "Auckland",
    });
    expect(posts.find((row) => row.record_key === restorable)?.payload).toMatchObject({
      weather_condition: null, weather_temperature_c: null, weather_place_name: null,
    });
    const first = await page("posts", null, lease, 1);
    expect(first).toHaveLength(1);
    const rest = await page("posts", first[0]!.record_key, lease, 1);
    expect(rest).toHaveLength(1);
    expect(rest[0]?.record_key).not.toBe(first[0]?.record_key);
  });

  it("projects revision attachment keys and private notes without their source internals", async () => {
    const [entry] = await page("revisions");
    expect(entry?.record_key).toBe(revision);
    expect(entry?.payload.previous_attachment_refs).toEqual([
      { media_id: attachment, attachment_order: 0, status: "detached" },
    ]);
    expect(entry?.payload).not.toHaveProperty("object_key");
    expect((await page("notes"))[0]?.payload).toMatchObject({ note: "Private tomorrow note", author_id: owner });
  });

  it("exports reviewed media reference fields without exposing reservations or detached bytes", async () => {
    const refs = await page("post_media");
    expect(refs.map((row) => row.record_key).sort()).toEqual([attachment, liveMedia, foreignKeyMedia].sort());
    expect(refs.find((row) => row.record_key === attachment)?.payload).toMatchObject({
      id: attachment, post_id: post, attachment_order: 0, post_trashed: false,
    });
    expect(refs.find((row) => row.record_key === liveMedia)?.payload).toMatchObject({
      post_id: restorable, post_trashed: true, detached_at: null,
    });
    expect(JSON.stringify(refs)).not.toContain("reservation_id");
    expect(JSON.stringify(refs)).not.toContain("object_key");
    const avatars = await page("profile_avatars");
    expect(avatars).toHaveLength(1);
    expect(avatars[0]?.payload).toMatchObject({ user_id: owner });
    expect(avatars[0]?.payload.set_at).toBeTruthy();
    expect(JSON.stringify(avatars)).not.toContain("reservation_id");
    expect(await page("post_media", null, "wrong-token")).toEqual([]);
    await expect(app`select * from public.read_account_export_page(${request}, ${lease}, 'post_media', null, 50)`)
      .rejects.toThrow();
  });

  it("proves post and avatar references before returning internal R2 keys to the worker", async () => {
    const files = await worker<{ file_id: string; post_id: string | null; post_trashed: boolean; file_kind: string; content_type: string; object_key: string }[]>`
      select * from public.read_account_export_file_page_v2(${request}, ${lease}, null, 25)`;
    expect(files.map((file) => file.file_id).sort()).toEqual([`avatar:${owner}`, `post:${liveMedia}`].sort());
    expect(files).toEqual(expect.arrayContaining([
      expect.objectContaining({ file_id: `post:${liveMedia}`, post_id: restorable,
        post_trashed: true, content_type: "audio/mp4", object_key: `media/${owner}/${liveReservation}` }),
      expect.objectContaining({ file_id: `avatar:${owner}`, post_id: null, post_trashed: false,
        file_kind: "profile_avatar", object_key: `media/${owner}/${avatarReservation}` }),
    ]));
    expect(await worker`select * from public.read_account_export_file_page_v2(${request}, 'wrong-token', null, 25)`)
      .toEqual([]);
    await expect(app`select * from public.read_account_export_file_page_v2(${request}, ${lease}, null, 25)`)
      .rejects.toThrow();
    await expect(worker`select * from public.read_account_export_file_page(${request}, ${lease}, null, 25)`)
      .rejects.toThrow();
    const [first] = await worker<{ file_id: string }[]>`
      select * from public.read_account_export_file_page_v2(${request}, ${lease}, null, 1)`;
    expect((await worker<{ file_id: string }[]>`
      select * from public.read_account_export_file_page_v2(${request}, ${lease}, ${first!.file_id}, 1)`)[0]?.file_id)
      .not.toBe(first?.file_id);
  });

  it("exports only currently readable authored messages, never received bodies or previews", async () => {
    const messages = await page("messages");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.record_key).toBe(authored);
    expect(messages[0]?.payload.body).toBe("Own authored body");
    expect(JSON.stringify(messages)).not.toContain("Received private body");
    expect(messages[0]?.payload).not.toHaveProperty("reply_to_message_id");
    expect(await page("messages", null, "wrong-token")).toEqual([]);
  });

  it("keeps readable authored history after a block but stops when membership is removed", async () => {
    await migrator`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${peer}, ${owner}, now())`;
    expect((await page("messages")).map((row) => row.record_key)).toEqual([authored]);
    await migrator`delete from public.conversation_members
      where conversation_id = ${conversation} and user_id = ${owner}`;
    expect(await page("messages")).toEqual([]);
    expect(await page("messages", null, "wrong-token")).toEqual([]);
  });

  it("reauthorizes a file when its Trash restore deadline passes", async () => {
    const fileId = `post:${liveMedia}`;
    const [authorized] = await worker<{ object_key: string; byte_size: string; content_type: string }[]>`
      select * from public.authorize_account_export_file(${request}, ${lease}, ${fileId})`;
    expect(authorized).toMatchObject({ object_key: `media/${owner}/${liveReservation}`, content_type: "audio/mp4" });
    expect(await worker`select * from public.authorize_account_export_file(${request}, 'wrong-token', ${fileId})`).toEqual([]);
    expect(await worker`select * from public.authorize_account_export_file(${request}, ${lease}, ${`post:${foreignKeyMedia}`})`).toEqual([]);
    await expect(app`select * from public.authorize_account_export_file(${request}, ${lease}, ${fileId})`)
      .rejects.toThrow();
    await migrator`update public.posts set trashed_at = now() - interval '169 hours',
      restore_until = now() - interval '1 hour', trash_purge_due_at = now() + interval '167 hours'
      where id = ${restorable}`;
    expect(await worker`select * from public.authorize_account_export_file(${request}, ${lease}, ${fileId})`).toEqual([]);
  });
});
