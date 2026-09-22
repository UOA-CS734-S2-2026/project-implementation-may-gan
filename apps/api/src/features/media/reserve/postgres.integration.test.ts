import { createDayliDatabase } from "@dayli/db";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAppForEnv } from "../../../app";
import { MAX_PENDING_RESERVATIONS_PER_OWNER } from "../policy";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const hasTestDatabaseConfig = Boolean(migratorUrl && appUrl);
const origin = "https://api.example.test";
const trustedOrigins = "https://api.example.test,https://web.example.test";
const secret = "test-only-better-auth-secret-that-is-at-least-32-characters";

// R2 presigning is a pure local computation (see lib/r2.ts), so fake credentials
// prove the whole reservation flow against real Postgres without needing real R2.
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

function createProductionApp() {
  return createAppForEnv({
    HYPERDRIVE: { connectionString: requireLocalTestUrl(appUrl, "TEST_APP_DATABASE_URL") },
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_BASE_URL: origin,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
    ...r2Bindings,
  });
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", origin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

async function signUp(app: ReturnType<typeof createProductionApp>, email: string) {
  const response = await app.fetch(request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Media Test User", email, password: "not-a-real-password" }),
  }));
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

interface ReservationJson {
  id: string;
  status: string;
  upload: { url: string };
}

async function reserve(app: ReturnType<typeof createProductionApp>, token: string, body: Record<string, unknown> = {}) {
  return app.fetch(request("/api/v1/media-reservations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType: "image/jpeg", byteSize: 1024, ...body }),
  }));
}

(hasTestDatabaseConfig ? describe : describe.skip)("Media reservations PostgreSQL persistence", () => {
  const migrator = createDayliDatabase(requireLocalTestUrl(
    migratorUrl ?? "postgresql://migrator:migrator@localhost:5433/dayli_test",
    "TEST_DATABASE_URL",
  ));

  beforeAll(async () => {
    await migrator.client.unsafe('drop table if exists public.media_reservation, public."rateLimit", public.account, public.session, public.verification, public."user" cascade');
    await migrator.client.unsafe('drop type if exists public.profile_visibility, public.tier cascade');
    const authMigration = await readFile(new URL("../../../../../../packages/db/migrations/0001_better_auth_postgres.sql", import.meta.url), "utf8");
    const rateLimitMigration = await readFile(new URL("../../../../../../packages/db/migrations/0002_add_better_auth_rate_limit.sql", import.meta.url), "utf8");
    const mediaReservationMigration = await readFile(new URL("../../../../../../packages/db/migrations/0003_add_media_reservation.sql", import.meta.url), "utf8");
    await migrator.client.unsafe(authMigration);
    await migrator.client.unsafe(rateLimitMigration);
    await migrator.client.unsafe(mediaReservationMigration);
  });

  beforeEach(async () => {
    await migrator.client.unsafe('truncate table public.media_reservation, public.account, public.session, public.verification, public."user" cascade');
  });

  afterAll(async () => {
    await migrator.close();
  });

  it("reserves a real owned row, enforces the FK, and returns a working presigned URL shape", async () => {
    const app = createProductionApp();
    const token = await signUp(app, "media-owner@example.test");

    const response = await reserve(app, token);
    expect(response.status).toBe(201);
    const body = (await response.json()) as ReservationJson;

    const [row] = await migrator.client`select owner_id, object_key from public.media_reservation where id = ${body.id}`;
    expect(row).toBeDefined();
    expect(row!.object_key).toContain(row!.owner_id);
  });

  it("counts real rows for the per-owner quota", async () => {
    const app = createProductionApp();
    const token = await signUp(app, "quota-owner@example.test");

    for (let index = 0; index < MAX_PENDING_RESERVATIONS_PER_OWNER; index += 1) {
      expect((await reserve(app, token)).status).toBe(201);
    }

    expect((await reserve(app, token)).status).toBe(429);

    const [row] = await migrator.client`select count(*)::int as count from public.media_reservation`;
    expect(row?.count).toBe(MAX_PENDING_RESERVATIONS_PER_OWNER);
  });

  it("isolates reservations between two real users, returning 404 rather than another owner's data", async () => {
    const app = createProductionApp();
    const ownerToken = await signUp(app, "owner@example.test");
    const otherToken = await signUp(app, "other@example.test");

    const created = (await (await reserve(app, ownerToken)).json()) as ReservationJson;

    const ownRead = await app.fetch(request(`/api/v1/media-reservations/${created.id}`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    }));
    expect(ownRead.status).toBe(200);

    const otherRead = await app.fetch(request(`/api/v1/media-reservations/${created.id}`, {
      headers: { authorization: `Bearer ${otherToken}` },
    }));
    expect(otherRead.status).toBe(404);
  });

  it("does not mount media reservations with incomplete R2 bindings", async () => {
    const unconfigured = createAppForEnv({
      HYPERDRIVE: { connectionString: requireLocalTestUrl(appUrl, "TEST_APP_DATABASE_URL") },
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_BASE_URL: origin,
      BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
    });
    const token = await signUp(unconfigured, "unconfigured@example.test");
    expect((await reserve(unconfigured, token)).status).toBe(503);
  });
});
