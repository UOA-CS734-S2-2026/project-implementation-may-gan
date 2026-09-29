import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import { createBetterAuthCompatibilitySlice } from "../../auth/better-auth";
import { MAX_ATTACHMENT_BYTES, MAX_PENDING_RESERVATIONS_PER_OWNER, RESERVATION_TTL_SECONDS } from "../shared/media-reservation-policy";
import { createUnusedR2Reader } from "../../../infrastructure/media/r2.fake";
import { createFakeMediaReservationRepository } from "../shared/media-reservation.repository.fake";
import type { MediaReservationRepository } from "../shared/media-reservation.repository";
import type { MediaReservationRuntime } from "../shared/media-reservation-runtime";

const origin = "https://worker.test";

const testR2Configuration = {
  accountId: "test-account",
  bucketName: "dayli-media-test",
  accessKeyId: "test-access-key-id",
  secretAccessKey: "test-secret-access-key",
};

function createFakeMediaRuntime(repository: MediaReservationRepository): MediaReservationRuntime {
  return {
    r2: testR2Configuration,
    r2Reader: createUnusedR2Reader(),
    async withRepository(operation) {
      return operation(repository);
    },
  };
}

function createTestApp(repository: MediaReservationRepository = createFakeMediaReservationRepository()) {
  const auth = createBetterAuthCompatibilitySlice({
    baseURL: origin,
    secret: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    database: { account: [], session: [], user: [], verification: [] },
  });
  const app = createApp({
    auth,
    media: {
      runtime: createFakeMediaRuntime(repository),
      resolveSession: async (request) => {
        const result = await auth.auth.api.getSession({ headers: request.headers });
        return result?.user?.id ? { userId: result.user.id } : null;
      },
    },
  });
  return { app, auth, repository };
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", origin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

async function signUpAndGetToken(app: ReturnType<typeof createTestApp>["app"], email = "compatibility@example.test") {
  const response = await app.fetch(
    request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test User", username: `test_${email.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`.slice(0, 30), email, password: "not-a-real-password" }),
    }),
  );
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

interface ReservationJson {
  id: string;
  status: string;
  upload: { url: string };
}

async function jsonBody(response: Response): Promise<ReservationJson> {
  return (await response.json()) as ReservationJson;
}

function createReservation(app: ReturnType<typeof createTestApp>["app"], token: string, body: Record<string, unknown> = {}) {
  return app.fetch(
    request("/api/v1/media-reservations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ contentType: "image/jpeg", byteSize: 1024, ...body }),
    }),
  );
}

describe("POST /api/v1/media-reservations", () => {
  it("reserves an opaque object path and returns a scoped, expiring presigned PUT URL", async () => {
    const { app } = createTestApp();
    const token = await signUpAndGetToken(app);

    const response = await createReservation(app, token);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await jsonBody(response);
    expect(body).toMatchObject({
      contentType: "image/jpeg",
      byteSize: 1024,
      status: "pending",
      upload: {
        method: "PUT",
        requiredHeaders: { "content-type": "image/jpeg", "content-length": "1024" },
      },
    });
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.upload.url).toContain(testR2Configuration.bucketName);
    expect(body.upload.url).not.toContain(testR2Configuration.secretAccessKey);
  });

  it("rejects requests without a valid session", async () => {
    const { app } = createTestApp();
    const response = await createReservation(app, "not-a-real-token");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("returns a private 503 when shared session resolution is unavailable", async () => {
    const repository = createFakeMediaReservationRepository();
    const app = createApp({
      media: {
        runtime: createFakeMediaRuntime(repository),
        resolveSession: async () => { throw new Error("Better Auth storage unavailable"); },
      },
    });

    const response = await app.request("/api/v1/media-reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", byteSize: 1024 }),
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("SERVICE_UNAVAILABLE");
    expect(body).not.toContain("storage unavailable");
    expect(repository.records).toHaveLength(0);
  });

  it("rejects an oversized declared byte size and a disallowed content type", async () => {
    const { app } = createTestApp();
    const token = await signUpAndGetToken(app);

    const oversized = await createReservation(app, token, { byteSize: MAX_ATTACHMENT_BYTES + 1 });
    expect(oversized.status).toBe(422);

    const disallowed = await createReservation(app, token, { contentType: "application/pdf" });
    expect(disallowed.status).toBe(422);
  });

  it("enforces a per-owner quota on concurrent pending reservations", async () => {
    const { app } = createTestApp();
    const token = await signUpAndGetToken(app);

    for (let index = 0; index < MAX_PENDING_RESERVATIONS_PER_OWNER; index += 1) {
      const response = await createReservation(app, token);
      expect(response.status).toBe(201);
    }

    const overQuota = await createReservation(app, token);
    expect(overQuota.status).toBe(429);
    await expect(overQuota.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("does not count validated or failed reservations toward the pending quota", async () => {
    const repository = createFakeMediaReservationRepository();
    const { app } = createTestApp(repository);
    const token = await signUpAndGetToken(app);

    for (let index = 0; index < MAX_PENDING_RESERVATIONS_PER_OWNER; index += 1) {
      const response = await createReservation(app, token);
      expect(response.status).toBe(201);
    }
    expect((await createReservation(app, token)).status).toBe(429);

    // Settle two of the still-unexpired reservations, as /complete would.
    const [first, second] = [...repository.records.values()];
    repository.records.set(first!.id, { ...first!, status: "validated", validatedAt: new Date() });
    repository.records.set(second!.id, { ...second!, status: "failed", failureReason: "byte_size_mismatch", validatedAt: new Date() });

    const afterSettling = await createReservation(app, token);
    expect(afterSettling.status).toBe(201);
  });

  it("returns 503 when media reservations are not configured", async () => {
    const auth = createBetterAuthCompatibilitySlice({
      baseURL: origin,
      secret: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      database: { account: [], session: [], user: [], verification: [] },
    });
    const app = createApp({ auth });
    const token = await signUpAndGetToken(app);

    const response = await createReservation(app, token);
    expect(response.status).toBe(503);
  });
});

describe("GET /api/v1/media-reservations/{id}", () => {
  it("reads the caller's own pending reservation", async () => {
    const { app, repository } = createTestApp();
    const token = await signUpAndGetToken(app);
    const created = await jsonBody(await createReservation(app, token));

    const response = await app.fetch(
      request(`/api/v1/media-reservations/${created.id}`, { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ id: created.id, status: "pending" });
    void repository;
  });

  it("reports an expired reservation once its TTL has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const { app } = createTestApp();
      const token = await signUpAndGetToken(app);
      const created = await jsonBody(await createReservation(app, token));

      await vi.advanceTimersByTimeAsync((RESERVATION_TTL_SECONDS + 60) * 1000);

      const response = await app.fetch(
        request(`/api/v1/media-reservations/${created.id}`, { headers: { authorization: `Bearer ${token}` } }),
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: "expired" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 404 for another owner's reservation, never 403", async () => {
    const { app } = createTestApp();
    const ownerToken = await signUpAndGetToken(app, "owner@example.test");
    const created = await jsonBody(await createReservation(app, ownerToken));

    const otherToken = await signUpAndGetToken(app, "other@example.test");
    const response = await app.fetch(
      request(`/api/v1/media-reservations/${created.id}`, { headers: { authorization: `Bearer ${otherToken}` } }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("returns 404 for a nonexistent id", async () => {
    const { app } = createTestApp();
    const token = await signUpAndGetToken(app);

    const response = await app.fetch(
      request("/api/v1/media-reservations/media_does_not_exist", { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(response.status).toBe(404);
  });

  it("rejects requests without a valid session", async () => {
    const { app } = createTestApp();
    const response = await app.fetch(request("/api/v1/media-reservations/media_anything"));
    expect(response.status).toBe(401);
  });

  it("returns 503 when media reservations are not configured", async () => {
    const auth = createBetterAuthCompatibilitySlice({
      baseURL: origin,
      secret: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      database: { account: [], session: [], user: [], verification: [] },
    });
    const app = createApp({ auth });
    const token = await signUpAndGetToken(app);

    const response = await app.fetch(
      request("/api/v1/media-reservations/media_anything", { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(response.status).toBe(503);
  });
});
