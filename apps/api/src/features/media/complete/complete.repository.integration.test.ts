import { createDayliDatabase } from "@dayli/db";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { readBetterAuthRuntimeConfiguration } from "../../auth/better-auth";
import { registerPostgresBetterAuthRoutes } from "../../auth/route";
import { createFakeR2Reader } from "../../../infrastructure/media/r2.fake";
import { validJpegBytes } from "../../../infrastructure/media/media-format.fixtures";
import { createHyperdriveMediaReservationRuntime } from "../shared/media-reservation-runtime";
import { resolveSession } from "../../../infrastructure/auth/session";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { ApiEnv } from "../../../env";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const hasTestDatabaseConfig = Boolean(migratorUrl && appUrl);
const origin = "https://api.example.test";
const trustedOrigins = "https://api.example.test,https://web.example.test";
const secret = "test-only-better-auth-secret-that-is-at-least-32-characters";

// The R2 reader is faked (proving real DB atomicity is the point here, matching
// how #21's integration test uses fake R2 credentials since presigning needs no
// network) — but a real R2 config is still threaded through for shape-completeness.
const r2Bindings = {
  R2_ACCOUNT_ID: "test-account",
  R2_BUCKET_NAME: "dayli-media-test",
  R2_ACCESS_KEY_ID: "test-access-key-id",
  R2_SECRET_ACCESS_KEY: "test-secret-access-key",
};

function requireLocalTestUrl(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for PostgreSQL media reservation integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test") {
    throw new Error(`${name} must target localhost:5433/dayli_test.`);
  }
  return value;
}

function createProductionApp(objects: Map<string, Uint8Array>) {
  const env: ApiEnv = {
    HYPERDRIVE: { connectionString: requireLocalTestUrl(appUrl, "TEST_APP_DATABASE_URL") },
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_BASE_URL: origin,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
    ...r2Bindings,
  };
  const configuration = readBetterAuthRuntimeConfiguration(env);
  if (!configuration) throw new Error("Test Better Auth configuration is invalid.");

  const runtime = createHyperdriveMediaReservationRuntime(
    configuration.hyperdrive,
    {
      accountId: r2Bindings.R2_ACCOUNT_ID,
      bucketName: r2Bindings.R2_BUCKET_NAME,
      accessKeyId: r2Bindings.R2_ACCESS_KEY_ID,
      secretAccessKey: r2Bindings.R2_SECRET_ACCESS_KEY,
    },
    createFakeR2Reader(objects),
  );
  const api = createApp({
    media: {
      runtime,
      resolveSession: (request) => withHyperdriveDatabase(
        configuration.hyperdrive,
        (database) => resolveSession(request, configuration, database),
      ),
    },
  });
  registerPostgresBetterAuthRoutes(api, env);
  return api;
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", origin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

/** See reserve/postgres.integration.test.ts — Better Auth rate-limits sign-up per IP. */
function syntheticIpFor(email: string): string {
  let hash = 0;
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `203.0.113.${(hash % 254) + 1}`;
}

async function signUp(app: ReturnType<typeof createProductionApp>, email: string) {
  const response = await app.fetch(request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": syntheticIpFor(email) },
    body: JSON.stringify({ name: "Media Test User", username: `media_${email.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`.slice(0, 30), email, password: "not-a-real-password" }),
  }));
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

interface ReservationJson {
  id: string;
  status: string;
  failureReason?: string;
}

async function reserve(app: ReturnType<typeof createProductionApp>, token: string, body: Record<string, unknown>) {
  const response = await app.fetch(request("/api/v1/media-reservations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
  return (await response.json()) as ReservationJson;
}

function complete(app: ReturnType<typeof createProductionApp>, token: string, id: string) {
  return app.fetch(request(`/api/v1/media-reservations/${id}/complete`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  }));
}

(hasTestDatabaseConfig ? describe : describe.skip)("Media reservation completion PostgreSQL persistence", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(
    migratorUrl ?? "postgresql://migrator:migrator@localhost:5433/dayli_test",
    "TEST_DATABASE_URL",
  ));

  beforeAll(async () => {
    await migrator.client.unsafe('drop table if exists public.media_reservation, public."rateLimit", public.account, public.session, public.verification, public."user" cascade');
    await migrator.client.unsafe('drop type if exists public.profile_visibility, public.tier, public.media_reservation_status, public.media_validation_failure_reason cascade');
    const authMigration = await readFile(new URL("../../../../../../packages/db/migrations/0001_better_auth_postgres.sql", import.meta.url), "utf8");
    const rateLimitMigration = await readFile(new URL("../../../../../../packages/db/migrations/0002_add_better_auth_rate_limit.sql", import.meta.url), "utf8");
    const mediaReservationMigration = await readFile(new URL("../../../../../../packages/db/migrations/0003_add_media_reservation.sql", import.meta.url), "utf8");
    const mediaValidationMigration = await readFile(new URL("../../../../../../packages/db/migrations/0009_add_media_reservation_validation.sql", import.meta.url), "utf8");
    await migrator.client.unsafe(authMigration);
    await migrator.client.unsafe(rateLimitMigration);
    await migrator.client.unsafe(mediaReservationMigration);
    await migrator.client.unsafe(mediaValidationMigration);
  });

  beforeEach(async () => {
    await migrator.client.unsafe('truncate table public.media_reservation, public.account, public.session, public.verification, public."user" cascade');
  });

  afterAll(async () => {
    await migrator.close();
  });

  it("persists a validated outcome on a real row", async () => {
    const objects = new Map<string, Uint8Array>();
    const app = createProductionApp(objects);
    const token = await signUp(app, "validated-owner@example.test");

    const created = await reserve(app, token, { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength });
    const [beforeRow] = await migrator.client`select owner_id, object_key from public.media_reservation where id = ${created.id}`;
    objects.set(beforeRow!.object_key as string, validJpegBytes);

    const response = await complete(app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "validated" });

    const [row] = await migrator.client`select status, failure_reason, validated_at from public.media_reservation where id = ${created.id}`;
    expect(row).toMatchObject({ status: "validated", failure_reason: null });
    expect(row!.validated_at).not.toBeNull();
  });

  it("persists a failed outcome with its reason on a real row", async () => {
    const objects = new Map<string, Uint8Array>();
    const app = createProductionApp(objects);
    const token = await signUp(app, "failed-owner@example.test");

    const created = await reserve(app, token, { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength });
    const [beforeRow] = await migrator.client`select owner_id, object_key from public.media_reservation where id = ${created.id}`;
    objects.set(beforeRow!.object_key as string, new Uint8Array([1, 2, 3])); // wrong bytes, wrong size

    const response = await complete(app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "failed", failureReason: "byte_size_mismatch" });

    const [row] = await migrator.client`select status, failure_reason, validated_at from public.media_reservation where id = ${created.id}`;
    expect(row).toMatchObject({ status: "failed", failure_reason: "byte_size_mismatch" });
    expect(row!.validated_at).not.toBeNull();
  });

  it("serialises concurrent completion attempts into one consistent final outcome", async () => {
    const objects = new Map<string, Uint8Array>();
    const app = createProductionApp(objects);
    const token = await signUp(app, "concurrent-complete-owner@example.test");

    const created = await reserve(app, token, { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength });
    const [beforeRow] = await migrator.client`select object_key from public.media_reservation where id = ${created.id}`;
    objects.set(beforeRow!.object_key as string, validJpegBytes);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => complete(app, token, created.id)),
    );
    for (const response of responses) expect(response.status).toBe(200);
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<ReservationJson>));
    for (const body of bodies) expect(body.status).toBe("validated");

    const rows = await migrator.client`select status, failure_reason, validated_at from public.media_reservation where id = ${created.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "validated", failure_reason: null });
    expect(rows[0]!.validated_at).not.toBeNull();
  });
});
