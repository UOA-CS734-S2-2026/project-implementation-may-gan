import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { AwsClient } from "aws4fetch";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { validateStagingOrigins } from "../../../scripts/staging-origins.mjs";

const shaPattern = /^[a-f0-9]{40}$/;
const markerPattern = /^staging-trash-proof-[0-9a-f]{32}$/;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const requiredTrashMigrations = [30, 31, 32, 33, 34];
const defaultMigrationsRoot = fileURLToPath(new URL("../migrations", import.meta.url));

type Database = Sql<Record<string, never>>;
type Fixture = { ownerId: string; postId: string; mediaId: string; reservationId: string; objectKey: string; generation: number };
export type ProofPhase = "configuration" | "migration_ledger" | "restore_fixture" | "purge_fixture" |
  "guarded_seed" | "scheduled_cleanup" | "complete";
export type ProofFailureCategory = "configuration_failure" | "migration_ledger_failure" | "normal_api_failure" |
  "guard_failure" | "scheduled_cleanup_failure";
type Evidence = {
  targetSha: string;
  deployedSha: string;
  runDigest: string;
  markerDigest: string;
  acceleratedSyntheticProof: true;
  startedAt: string;
  finishedAt: string;
  outcome: "passed" | "incomplete";
  phase: ProofPhase;
  failureCategory: ProofFailureCategory | null;
  checks: Record<string, boolean>;
  counts: Record<string, number>;
};

export function validateProofTarget(input: { targetSha?: string; checkedOutSha?: string; mainSha?: string; deployedSha?: string }) {
  const values = [input.targetSha, input.checkedOutSha, input.mainSha, input.deployedSha];
  if (values.some((value) => !shaPattern.test(value ?? "")) || new Set(values).size !== 1) {
    throw new Error("Staging Trash proof revision mismatch.");
  }
  return input.targetSha!;
}

export function validateMarker(marker: string): string {
  if (!markerPattern.test(marker)) throw new Error("Synthetic marker is invalid.");
  return marker;
}

export async function discoverExpectedMigrationLedger(migrationsRoot = defaultMigrationsRoot) {
  const journal = JSON.parse(await readFile(resolve(migrationsRoot, "meta/_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const entries = journal.entries.sort((a, b) => a.idx - b.idx);
  if (!requiredTrashMigrations.every((idx) => entries.some((entry) => entry.idx === idx))) {
    throw new Error("Required Trash migrations are absent from the reviewed ledger.");
  }
  return Promise.all(entries.map(async (entry) => ({
    idx: entry.idx,
    hash: createHash("sha256").update(await readFile(resolve(migrationsRoot, `${entry.tag}.sql`))).digest("hex"),
  })));
}

export async function verifyMigrationLedger(sql: Database, migrationsRoot = defaultMigrationsRoot): Promise<number> {
  const expected = await discoverExpectedMigrationLedger(migrationsRoot);
  const relation = await sql<{ ledger: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations')::text as ledger`;
  if (relation.length !== 1 || relation[0]?.ledger !== "drizzle.__drizzle_migrations") {
    throw new Error("Migration ledger is unavailable.");
  }
  const applied = await sql<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations order by id`;
  if (applied.length !== expected.length || applied.some((row, index) => row.hash !== expected[index]?.hash)) {
    throw new Error("Staging migration ledger does not exactly match the target revision.");
  }
  return applied.length;
}

export function classifyProofFailure(phase: ProofPhase): ProofFailureCategory {
  if (phase === "configuration") return "configuration_failure";
  if (phase === "migration_ledger") return "migration_ledger_failure";
  if (phase === "guarded_seed") return "guard_failure";
  if (phase === "scheduled_cleanup") return "scheduled_cleanup_failure";
  return "normal_api_failure";
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error("Staging Trash proof configuration is incomplete.");
  return value;
}


async function api<T>(origin: string, path: string, init: RequestInit = {}, expected = 200): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${origin}${path}`, init);
  if (response.status !== expected) throw new Error("A staging API proof step failed.");
  try { return { response, body: await response.json() as T }; }
  catch { throw new Error("A staging API proof step returned invalid JSON."); }
}

async function createAccount(origin: string, marker: string, ordinal: number): Promise<string> {
  const current = (await api<{ status: string; termsVersionId?: string; termsContentDigest?: string }>(
    origin, "/api/v1/legal/current",
  )).body;
  if (current.status !== "effective" || typeof current.termsVersionId !== "string" ||
      typeof current.termsContentDigest !== "string" || !/^[a-f0-9]{64}$/.test(current.termsContentDigest)) throw new Error("Current registration terms are unavailable.");
  const intent = (await api<{ token: string; binding: string }>(origin, "/api/v1/legal/registration-intent", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      flow: "email", termsVersionId: current.termsVersionId, termsContentDigest: current.termsContentDigest,
      acceptedTermsAndDeclaredAge16: true,
    }),
  })).body;
  const suffix = marker.slice(-16);
  const signup = await api(origin, "/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dayli-registration-intent": intent.token,
      "x-dayli-registration-binding": intent.binding,
    },
    body: JSON.stringify({
      name: `${marker}-${ordinal}`,
      username: `trashproof_${ordinal}_${suffix}`,
      email: `${marker}-${ordinal}@synthetic.invalid`,
      password: randomBytes(24).toString("base64url"),
    }),
  });
  const token = signup.response.headers.get("set-auth-token");
  if (!token) throw new Error("Synthetic account session was not issued.");
  return token;
}

async function createFixture(origin: string, token: string, marker: string, ordinal: number): Promise<Fixture> {
  const authorization = { authorization: `Bearer ${token}` };
  const reservation = (await api<{ id: string; upload: { url: string; requiredHeaders: Record<string, string> } }>(
    origin, "/api/v1/media-reservations", {
    method: "POST", headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ contentType: "image/jpeg", byteSize: jpeg.byteLength }),
  }, 201)).body;
  const uploadHeaders = new Headers(reservation.upload.requiredHeaders);
  const upload = await fetch(reservation.upload.url, { method: "PUT", headers: uploadHeaders, body: jpeg });
  if (!upload.ok) throw new Error("Synthetic media upload failed.");
  const complete = (await api<{ status: string }>(origin, `/api/v1/media-reservations/${encodeURIComponent(reservation.id)}/complete`, {
    method: "POST", headers: authorization,
  })).body;
  if (complete.status !== "validated") throw new Error("Synthetic media validation failed.");
  const day = (await api<{ localDate: string; prompt: { id: string } }>(
    origin, "/api/v1/posting-days/current", { headers: authorization },
  )).body;
  const created = (await api<{ id: string; authorId: string; media: Array<{ id: string }> }>(origin, "/api/v1/posts", {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json", "idempotency-key": randomUUID() },
    body: JSON.stringify({
      localDate: day.localDate,
      promptId: day.prompt.id,
      reflectiveAnswer: `${marker}:${ordinal}`,
      rating: 5,
      audience: "solo",
      attachments: [reservation.id],
    }),
  }, 201)).body;
  if (created.media.length !== 1 || !created.media[0]?.id) throw new Error("Synthetic post media was not attached.");
  const fixture = { ownerId: created.authorId, postId: created.id, mediaId: created.media[0].id,
    reservationId: reservation.id, objectKey: `media/${created.authorId}/${reservation.id}`, generation: 0 };
  if (await objectIsAbsent(fixture.objectKey)) throw new Error("Synthetic object was absent before Trash.");
  return fixture;
}

async function trashFixture(origin: string, token: string, fixture: Fixture): Promise<void> {
  const trashed = (await api<{ generation: number }>(origin,
    `/api/v1/posts/${encodeURIComponent(fixture.postId)}/trash`, {
      method: "POST", headers: { authorization: `Bearer ${token}` },
    })).body;
  if (!Number.isSafeInteger(trashed.generation) || trashed.generation < 1) {
    throw new Error("Synthetic Trash generation is invalid.");
  }
  fixture.generation = trashed.generation;
}

async function proveAndRestore(origin: string, token: string, fixture: Fixture): Promise<void> {
  const headers = { authorization: `Bearer ${token}` };
  await api(origin, `/api/v1/posts/${encodeURIComponent(fixture.postId)}`, { headers }, 404);
  await api(origin, `/api/v1/posts/${encodeURIComponent(fixture.postId)}/media/${encodeURIComponent(fixture.mediaId)}`, { headers }, 404);
  const list = (await api<{ posts: Array<{ id?: string }> }>(origin, "/api/v1/posts/trash", { headers })).body;
  if (!Array.isArray(list.posts) || !list.posts.some((post) => post.id === fixture.postId)) {
    throw new Error("Synthetic Trash list proof failed.");
  }
  const restored = (await api<{ status: string }>(origin, `/api/v1/posts/${encodeURIComponent(fixture.postId)}/restore`, {
    method: "POST", headers,
  })).body;
  if (restored.status !== "restored") throw new Error("Synthetic Trash restore proof failed.");
  await api(origin, `/api/v1/posts/${encodeURIComponent(fixture.postId)}`, { headers });
  await api(origin, `/api/v1/posts/${encodeURIComponent(fixture.postId)}/media/${encodeURIComponent(fixture.mediaId)}`, { headers });
}

export async function seedPastDeadline(tx: TransactionSql, input: Fixture & { marker: string }): Promise<string> {
  validateMarker(input.marker);
  await tx`set local lock_timeout = '5s'`;
  await tx`set local statement_timeout = '15s'`;
  await tx`select pg_advisory_xact_lock(hashtextextended('posts:author:' || ${input.ownerId}, 734))`;
  const owners = await tx<{ id: string; email: string; name: string; lifecycle: string }[]>`
    select owner.id, owner.email, owner.name, coalesce(lifecycle.state::text, 'active') as lifecycle
    from public."user" owner left join public.account_lifecycles lifecycle on lifecycle.user_id = owner.id
    where owner.id = ${input.ownerId} for update of owner`;
  if (owners.length !== 1 || owners[0]?.name !== `${input.marker}-2` ||
      owners[0]?.email !== `${input.marker}-2@synthetic.invalid` || owners[0]?.lifecycle !== "active") {
    throw new Error("Synthetic owner guard failed.");
  }
  const posts = await tx<{ id: string; generation: string; answer: string; failure: string | null; lease: string | null }[]>`
    select id, trash_generation::text as generation, reflective_answer as answer,
      trash_failure_category as failure, trash_lease_token as lease
    from public.posts where id = ${input.postId} and author_id = ${input.ownerId} for update`;
  if (posts.length !== 1 || posts[0]?.answer !== `${input.marker}:2` ||
      Number(posts[0]?.generation) !== input.generation || posts[0]?.failure !== null || posts[0]?.lease !== null) {
    throw new Error("Synthetic post guard failed.");
  }
  const reservations = await tx<{ id: string; object_key: string; status: string; claimed: Date | null }[]>`
    select reservation.id, reservation.object_key, reservation.status, reservation.cleanup_claimed_at as claimed
    from public.media_reservation reservation
    join public.post_media media on media.reservation_id = reservation.id
    where reservation.id = ${input.reservationId} and reservation.owner_id = ${input.ownerId}
      and media.post_id = ${input.postId} for update of reservation, media`;
  const expectedKey = `media/${input.ownerId}/${input.reservationId}`;
  if (reservations.length !== 1 || reservations[0]?.object_key !== expectedKey ||
      reservations[0]?.status !== "validated" || reservations[0]?.claimed !== null) {
    throw new Error("Synthetic reservation guard failed.");
  }
  const references = await tx<{ post_refs: string; avatar_refs: string; media_count: string }[]>`
    select
      (select count(*) from public.post_media where reservation_id = ${input.reservationId} and post_id <> ${input.postId})::text as post_refs,
      (select count(*) from public.profile_avatars where reservation_id = ${input.reservationId})::text as avatar_refs,
      (select count(*) from public.post_media where post_id = ${input.postId})::text as media_count`;
  if (references[0]?.post_refs !== "0" || references[0]?.avatar_refs !== "0" || references[0]?.media_count !== "1") {
    throw new Error("Synthetic reference guard failed.");
  }
  const updated = await tx`
    with seeded as (select clock_timestamp() - interval '337 hours' as trashed_at)
    update public.posts set trashed_at = seeded.trashed_at,
      restore_until = seeded.trashed_at + interval '168 hours',
      trash_purge_due_at = seeded.trashed_at + interval '336 hours', updated_at = clock_timestamp()
    from seeded where id = ${input.postId} and author_id = ${input.ownerId} and trash_generation = ${input.generation}
      and trashed_at is not null and restore_until > clock_timestamp() and trash_purge_due_at > clock_timestamp()
      and trash_lease_token is null and trash_lease_expires_at is null
      and trash_failure_category is null and trash_next_attempt_at is null`;
  if (updated.count !== 1) throw new Error("Synthetic deadline seed did not update exactly one row.");
  return expectedKey;
}

async function absentCounts(sql: Database, fixture: Fixture): Promise<{ post: number; media: number; reservation: number }> {
  const [row] = await sql<{ post_count: string; media_count: string; reservation_count: string }[]>`
    select (select count(*) from public.posts where id = ${fixture.postId} and author_id = ${fixture.ownerId})::text as post_count,
      (select count(*) from public.post_media where post_id = ${fixture.postId})::text as media_count,
      (select count(*) from public.media_reservation where id = ${fixture.reservationId} and owner_id = ${fixture.ownerId})::text as reservation_count`;
  return { post: Number(row?.post_count), media: Number(row?.media_count), reservation: Number(row?.reservation_count) };
}

async function objectIsAbsent(objectKey: string): Promise<boolean> {
  const account = required("CLOUDFLARE_ACCOUNT_ID");
  const bucket = required("STAGING_R2_BUCKET_NAME");
  const client = new AwsClient({
    accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    service: "s3", region: "auto",
  });
  const key = objectKey.split("/").map(encodeURIComponent).join("/");
  const response = await client.fetch(`https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key}`, { method: "HEAD" });
  if (response.status === 404) return true;
  if (!response.ok) throw new Error("Synthetic object HEAD failed.");
  return false;
}

async function awaitScheduledWorker(sql: Database, fixture: Fixture): Promise<{ counts: { post: number; media: number; reservation: number }; objectAbsent: boolean }> {
  const deadline = Date.now() + 9 * 60_000;
  let counts = { post: 1, media: 1, reservation: 1 };
  let objectAbsent = false;
  do {
    counts = await absentCounts(sql, fixture);
    objectAbsent = await objectIsAbsent(fixture.objectKey);
    if (counts.post === 0 && counts.media === 0 && counts.reservation === 0 && objectAbsent) return { counts, objectAbsent };
    await delay(15_000);
  } while (Date.now() < deadline);
  throw new Error("Real scheduled Trash cleanup did not complete before the deadline.");
}

async function writeEvidence(path: string, evidence: Evidence): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}

async function run(): Promise<void> {
  const targetSha = validateProofTarget({
    targetSha: required("TARGET_SHA"), checkedOutSha: required("CHECKED_OUT_SHA"),
    mainSha: required("MAIN_SHA"), deployedSha: required("DEPLOYED_SHA"),
  });
  const marker = validateMarker(`staging-trash-proof-${randomBytes(16).toString("hex")}`);
  const startedAt = new Date().toISOString();
  const evidencePath = required("EVIDENCE_PATH");
  const evidence: Evidence = {
    targetSha, deployedSha: targetSha,
    runDigest: digest(`${required("GITHUB_RUN_ID")}:${required("GITHUB_RUN_ATTEMPT")}:${targetSha}`),
    markerDigest: digest(marker), acceleratedSyntheticProof: true, startedAt, finishedAt: startedAt,
    outcome: "incomplete", phase: "configuration", failureCategory: null,
    checks: { revisionAttested: true, metadataPreflight: true, migrationLedger: false, restore: false,
      guardedSeed: false, databaseAbsent: false, objectAbsent: false },
    counts: { migrations: 0, postsRemaining: -1, mediaRemaining: -1, reservationsRemaining: -1 },
  };
  let sql: Database | undefined;
  try {
    const databaseUrl = required("DATABASE_URL");
    if (new URL(databaseUrl).username !== "migrator") throw new Error("The guarded proof requires the staging migrator role.");
    sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
    evidence.phase = "migration_ledger";
    evidence.counts.migrations = await verifyMigrationLedger(sql);
    evidence.checks.migrationLedger = true;
    const { apiOrigin: origin } = validateStagingOrigins({
      siteHost: required("STAGING_AUTH_SITE_HOST"),
      apiOrigin: required("STAGING_AUTH_API_ORIGIN"),
      webOrigin: required("STAGING_AUTH_WEB_ORIGIN"),
    });
    evidence.phase = "restore_fixture";
    const restoreToken = await createAccount(origin, marker, 1);
    const restoreFixture = await createFixture(origin, restoreToken, marker, 1);
    await trashFixture(origin, restoreToken, restoreFixture);
    await proveAndRestore(origin, restoreToken, restoreFixture);
    evidence.checks.restore = true;
    evidence.phase = "purge_fixture";
    const purgeToken = await createAccount(origin, marker, 2);
    const purgeFixture = await createFixture(origin, purgeToken, marker, 2);
    await trashFixture(origin, purgeToken, purgeFixture);
    evidence.phase = "guarded_seed";
    purgeFixture.objectKey = await sql.begin((tx) => seedPastDeadline(tx, { ...purgeFixture, marker }));
    evidence.checks.guardedSeed = true;
    evidence.phase = "scheduled_cleanup";
    const result = await awaitScheduledWorker(sql, purgeFixture);
    evidence.counts.postsRemaining = result.counts.post;
    evidence.counts.mediaRemaining = result.counts.media;
    evidence.counts.reservationsRemaining = result.counts.reservation;
    evidence.checks.databaseAbsent = Object.values(result.counts).every((count) => count === 0);
    evidence.checks.objectAbsent = result.objectAbsent;
    evidence.phase = "complete";
    evidence.outcome = "passed";
  } catch (error) {
    evidence.failureCategory = classifyProofFailure(evidence.phase);
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    await writeEvidence(evidencePath, evidence);
    if (sql) await sql.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("staging-trash-lifecycle-proof.ts")) {
  run().then(
    () => console.log("staging_trash_proof outcome=passed evidence=sanitized"),
    () => { console.error("staging_trash_proof outcome=incomplete fixtures=preserved evidence=sanitized"); process.exitCode = 1; },
  );
}
