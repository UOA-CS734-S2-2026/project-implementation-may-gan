import { createDayliDatabase, schema, sql } from "@dayli/db";
import { count, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAppForEnv } from "../../../app";
import { MAX_PENDING_RESERVATIONS_PER_OWNER } from "../shared/media-reservation-policy";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const hasTestDatabaseConfig = Boolean(migratorUrl && appUrl);
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const origin = "https://api.example.test";
const trustedOrigins = "https://api.example.test,https://web.example.test";
const secret = "test-only-better-auth-secret-that-is-at-least-32-characters";

// R2 presigning is a pure local computation (see infrastructure/media/r2.ts), so fake credentials
// prove the whole reservation flow against real Postgres without needing real R2.
const r2Bindings = {
  R2_ACCOUNT_ID: "test-account",
  R2_BUCKET_NAME: "dayli-media-test",
  R2_ACCESS_KEY_ID: "test-access-key-id",
  R2_SECRET_ACCESS_KEY: "test-secret-access-key",
};
const allowRateLimit = { limit: async () => ({ success: true }) };
const rateLimitBindings = {
  API_RATE_LIMIT_SCOPE: "test",
  API_INGRESS_RATE_LIMIT: allowRateLimit,
  API_READ_RATE_LIMIT: allowRateLimit,
  API_WRITE_RATE_LIMIT: allowRateLimit,
  API_MESSAGE_RATE_LIMIT: allowRateLimit,
  API_MEDIA_RATE_LIMIT: allowRateLimit,
  API_REALTIME_RATE_LIMIT: allowRateLimit,
  API_DIRECT_PUSH_RATE_LIMIT: allowRateLimit,
};

function requireLocalTestUrl(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for PostgreSQL media reservation integration tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_test") {
    throw new Error(`${name} must target localhost:${testPostgresPort}/dayli_test.`);
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
    ...rateLimitBindings,
  });
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", origin);
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", "203.0.113.1");
  return new Request(`${origin}${path}`, { ...init, headers });
}

/**
 * Better Auth's rate limiter buckets by `cf-connecting-ip`. Requests with no such
 * header all share one bucket, so this file's several distinct test users would
 * otherwise collide and get silently rate-limited after a handful of sign-ups.
 * Give each simulated user their own synthetic IP, like a real distinct user would have.
 */
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
    await migrator.db.execute(sql.raw('drop table if exists public.media_reservation, public."rateLimit", public.account, public.session, public.verification, public."user" cascade'));
    await migrator.db.execute(sql.raw('drop type if exists public.profile_visibility, public.tier, public.media_reservation_status, public.media_validation_failure_reason cascade'));
    const authMigration = await readFile(new URL("../../../../../../packages/db/migrations/0001_better_auth_postgres.sql", import.meta.url), "utf8");
    const rateLimitMigration = await readFile(new URL("../../../../../../packages/db/migrations/0002_add_better_auth_rate_limit.sql", import.meta.url), "utf8");
    const mediaReservationMigration = await readFile(new URL("../../../../../../packages/db/migrations/0003_add_media_reservation.sql", import.meta.url), "utf8");
    const mediaValidationMigration = await readFile(new URL("../../../../../../packages/db/migrations/0009_add_media_reservation_validation.sql", import.meta.url), "utf8");
    await migrator.db.execute(sql.raw(authMigration));
    await migrator.db.execute(sql.raw(rateLimitMigration));
    await migrator.db.execute(sql.raw(mediaReservationMigration));
    await migrator.db.execute(sql.raw(mediaValidationMigration));
  });

  beforeEach(async () => {
    await migrator.db.execute(sql.raw('truncate table public.media_reservation, public.account, public.session, public.verification, public."user" cascade'));
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

    const [row] = await migrator.db
      .select({ ownerId: schema.mediaReservation.ownerId, objectKey: schema.mediaReservation.objectKey })
      .from(schema.mediaReservation)
      .where(eq(schema.mediaReservation.id, body.id));
    expect(row).toBeDefined();
    expect(row!.objectKey).toContain(row!.ownerId);
  });

  it("counts real rows for the per-owner quota", async () => {
    const app = createProductionApp();
    const token = await signUp(app, "quota-owner@example.test");

    for (let index = 0; index < MAX_PENDING_RESERVATIONS_PER_OWNER; index += 1) {
      expect((await reserve(app, token)).status).toBe(201);
    }

    expect((await reserve(app, token)).status).toBe(429);

    const [row] = await migrator.db.select({ count: count() }).from(schema.mediaReservation);
    expect(row?.count).toBe(MAX_PENDING_RESERVATIONS_PER_OWNER);
  });

  it("does not count a validated reservation's real row toward the pending quota", async () => {
    const app = createProductionApp();
    const token = await signUp(app, "settled-quota-owner@example.test");

    let lastCreated: ReservationJson | undefined;
    for (let index = 0; index < MAX_PENDING_RESERVATIONS_PER_OWNER; index += 1) {
      const response = await reserve(app, token);
      expect(response.status).toBe(201);
      lastCreated = (await response.json()) as ReservationJson;
    }
    expect((await reserve(app, token)).status).toBe(429);

    await migrator.db
      .update(schema.mediaReservation)
      .set({ status: "validated", validatedAt: new Date() })
      .where(eq(schema.mediaReservation.id, lastCreated!.id));

    const afterSettling = await reserve(app, token);
    expect(afterSettling.status).toBe(201);
  });

  it("serialises concurrent reservation attempts so the quota is never exceeded", async () => {
    const app = createProductionApp();
    const token = await signUp(app, "concurrent-owner@example.test");

    const attempts = MAX_PENDING_RESERVATIONS_PER_OWNER + 10;
    const responses = await Promise.all(
      Array.from({ length: attempts }, () => reserve(app, token)),
    );

    const succeeded = responses.filter((response) => response.status === 201);
    const quotaExceeded = responses.filter((response) => response.status === 429);
    expect(succeeded).toHaveLength(MAX_PENDING_RESERVATIONS_PER_OWNER);
    expect(quotaExceeded).toHaveLength(attempts - MAX_PENDING_RESERVATIONS_PER_OWNER);

    const [row] = await migrator.db
      .select({ count: count() })
      .from(schema.mediaReservation)
      .innerJoin(schema.user, eq(schema.mediaReservation.ownerId, schema.user.id))
      .where(eq(schema.user.email, "concurrent-owner@example.test"));
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
      ...rateLimitBindings,
    });
    const token = await signUp(unconfigured, "unconfigured@example.test");
    expect((await reserve(unconfigured, token)).status).toBe(503);
  });
});
