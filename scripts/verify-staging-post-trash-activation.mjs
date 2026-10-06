#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const digestPattern = /^[a-f0-9]{64}$/;
const markerPattern = /^staging-trash-proof-[a-f0-9]{32}$/;
const syntheticEmailPattern = /^(staging-trash-proof-[a-f0-9]{32})-2@synthetic\.invalid$/;

function fail(message) {
  throw new Error(`Staging post Trash activation preflight failed: ${message}`);
}

export function validateApprovedDigest(value) {
  if (value === undefined || value === "") return "";
  if (!digestPattern.test(value)) fail("the approved marker digest is invalid.");
  return value;
}

function markerDigest(marker) {
  return createHash("sha256").update(marker).digest("hex");
}

export function assessEligiblePostTrashRows(rows, approvedDigest) {
  const approval = validateApprovedDigest(approvedDigest);
  if (!Array.isArray(rows)) fail("eligible-row metadata is invalid.");
  let approved = 0;
  let unknown = 0;
  for (const row of rows) {
    const emailMatch = typeof row?.owner_email === "string" ? syntheticEmailPattern.exec(row.owner_email) : null;
    const marker = emailMatch?.[1];
    const exactSynthetic = !!marker && markerPattern.test(marker) && row.owner_name === `${marker}-2` &&
      row.reflective_answer === `${marker}:2` && Number(row.trash_generation) === 1 &&
      Number(row.owner_post_count) === 1 && Number(row.media_count) === 1 &&
      Number(row.reservation_count) === 1 && row.reservations_exact === true &&
      Number(row.other_post_refs) === 0 && Number(row.avatar_refs) === 0;
    if (exactSynthetic && approval !== "" && markerDigest(marker) === approval) approved += 1;
    else unknown += 1;
  }
  return { eligible: rows.length, approved, unknown };
}

export async function inspectEligiblePostTrash(client, approvedDigest) {
  const approval = validateApprovedDigest(approvedDigest);
  try {
    await client.unsafe("BEGIN READ ONLY");
    await client.unsafe("SET LOCAL lock_timeout = '5s'");
    await client.unsafe("SET LOCAL statement_timeout = '10s'");
    await client.unsafe("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    const identity = await client.unsafe("SELECT current_user, session_user");
    if (identity.length !== 1 || identity[0]?.current_user !== "migrator" || identity[0]?.session_user !== "migrator") {
      fail("the database session is not the migrator role.");
    }
    const rows = await client.unsafe(`
      SELECT post.reflective_answer, post.trash_generation::text,
        owner.name AS owner_name, owner.email AS owner_email,
        (SELECT count(*) FROM public.posts owned WHERE owned.author_id = owner.id)::text AS owner_post_count,
        (SELECT count(*) FROM public.post_media media WHERE media.post_id = post.id)::text AS media_count,
        (SELECT count(*) FROM public.post_media media
          JOIN public.media_reservation reservation ON reservation.id = media.reservation_id
          WHERE media.post_id = post.id)::text AS reservation_count,
        NOT EXISTS (
          SELECT 1 FROM public.post_media media
          LEFT JOIN public.media_reservation reservation ON reservation.id = media.reservation_id
          LEFT JOIN public.legacy_cloudinary_media legacy ON legacy.media_id = media.id
          WHERE media.post_id = post.id AND (
            media.reservation_id IS NULL OR reservation.id IS NULL OR legacy.media_id IS NOT NULL OR
            reservation.owner_id <> owner.id OR reservation.object_key <> 'media/' || owner.id || '/' || reservation.id OR
            reservation.status <> 'validated' OR reservation.cleanup_claimed_at IS NOT NULL
          )
        ) AS reservations_exact,
        (SELECT count(*) FROM public.post_media media
          WHERE media.reservation_id IN (
            SELECT own_media.reservation_id FROM public.post_media own_media WHERE own_media.post_id = post.id
          ) AND media.post_id <> post.id)::text AS other_post_refs,
        (SELECT count(*) FROM public.profile_avatars avatar
          WHERE avatar.reservation_id IN (
            SELECT media.reservation_id FROM public.post_media media WHERE media.post_id = post.id
          ))::text AS avatar_refs
      FROM public.posts post
      JOIN public."user" owner ON owner.id = post.author_id
      WHERE post.trashed_at IS NOT NULL
        AND post.trash_purge_due_at <= clock_timestamp()
        AND (post.trash_lease_expires_at IS NULL OR post.trash_lease_expires_at <= clock_timestamp())
        AND (post.trash_next_attempt_at IS NULL OR post.trash_next_attempt_at <= clock_timestamp())
        AND NOT EXISTS (
          SELECT 1 FROM public.account_lifecycles lifecycle
          WHERE lifecycle.user_id = post.author_id AND lifecycle.state <> 'active'
        )
      ORDER BY post.trash_purge_due_at, post.id
    `);
    const result = assessEligiblePostTrashRows(rows, approval);
    await client.unsafe("COMMIT");
    return result;
  } catch (error) {
    try { await client.unsafe("ROLLBACK"); } catch { /* Transaction may not have started. */ }
    if (error instanceof Error && error.message.startsWith("Staging post Trash activation preflight failed:")) throw error;
    fail("the read-only eligibility query failed.");
  }
}

function validateEnvironment(environment) {
  if (environment.MIGRATION_TARGET !== "staging") fail("MIGRATION_TARGET must be staging.");
  let databaseUrl;
  try { databaseUrl = new URL(environment.DATABASE_URL ?? ""); }
  catch { fail("DATABASE_URL is invalid."); }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || databaseUrl.username !== "migrator" ||
      !databaseUrl.hostname.endsWith(".neon.tech") || databaseUrl.hostname.includes("-pooler") ||
      !["require", "verify-ca", "verify-full"].includes(databaseUrl.searchParams.get("sslmode"))) {
    fail("DATABASE_URL must use the direct staging migrator target with TLS.");
  }
  return databaseUrl.toString();
}

async function defaultClientFactory(connectionString) {
  try {
    const require = createRequire(path.join(import.meta.dirname, "..", "packages", "db", "package.json"));
    const postgres = require("postgres");
    return postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, onnotice: () => undefined });
  } catch { fail("the PostgreSQL client could not be initialized."); }
}

export async function runStagingPostTrashActivationPreflight({ environment = process.env, clientFactory = defaultClientFactory } = {}) {
  const approvedDigest = validateApprovedDigest(environment.STAGING_POST_TRASH_APPROVED_MARKER_DIGEST);
  const connectionString = validateEnvironment(environment);
  let client;
  try { client = await clientFactory(connectionString); }
  catch { fail("the PostgreSQL client could not be initialized."); }
  let result;
  let failure;
  try { result = await inspectEligiblePostTrash(client, approvedDigest); }
  catch (error) { failure = error; }
  try { await client.end({ timeout: 5 }); }
  catch { if (!failure) fail("the PostgreSQL client could not be closed."); }
  if (failure) throw failure;
  if (result.unknown > 0 || result.approved !== result.eligible) fail("unknown eligible content blocks activation.");
  return result;
}

if (import.meta.main) {
  runStagingPostTrashActivationPreflight().then(
    (result) => console.log(`staging_post_trash_activation eligible=${result.eligible} approved=${result.approved} unknown=${result.unknown}`),
    (error) => { console.error(error instanceof Error ? error.message : "Staging post Trash activation preflight failed."); process.exitCode = 1; },
  );
}
