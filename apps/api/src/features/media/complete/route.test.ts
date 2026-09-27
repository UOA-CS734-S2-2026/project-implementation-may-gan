import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import { createBetterAuthCompatibilitySlice, type BetterAuthCompatibilitySlice } from "../../auth/better-auth";
import { createFakeR2Reader } from "../../../lib/r2.fake";
import {
  buildFtypBox,
  buildMinimalMp4,
  buildMoovBox,
  buildMvhdBoxV0,
  concatBoxes,
  validJpegBytes,
} from "../../../lib/media-format.fixtures";
import { MAX_VIDEO_DURATION_SECONDS, RESERVATION_TTL_SECONDS } from "../policy";
import { createFakeMediaReservationRepository } from "../reserve/repository.fake";
import type { MediaReservationRepository } from "../reserve/repository";
import type { MediaReservationRuntime } from "../reserve/runtime";

const origin = "https://worker.test";

const testR2Configuration = {
  accountId: "test-account",
  bucketName: "dayli-media-test",
  accessKeyId: "test-access-key-id",
  secretAccessKey: "test-secret-access-key",
};

interface ReservationJson {
  id: string;
  status: string;
  failureReason?: string;
  upload: { url: string };
}

function createFakeMediaRuntime(
  auth: BetterAuthCompatibilitySlice,
  repository: MediaReservationRepository,
  objects: Map<string, Uint8Array>,
): MediaReservationRuntime {
  return {
    r2: testR2Configuration,
    r2Reader: createFakeR2Reader(objects),
    async withRequestContext(request, operation) {
      const result = await auth.auth.api.getSession({ headers: request.headers });
      const user = result?.user?.id ? { userId: result.user.id } : undefined;
      return operation({ user, repository });
    },
  };
}

function createTestApp() {
  const auth = createBetterAuthCompatibilitySlice({
    baseURL: origin,
    secret: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    database: { account: [], session: [], user: [], verification: [] },
  });
  const repository = createFakeMediaReservationRepository();
  const objects = new Map<string, Uint8Array>();
  const app = createApp({ auth, media: createFakeMediaRuntime(auth, repository, objects) });
  return { app, repository, objects };
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
      body: JSON.stringify({ name: "Test User", email, password: "not-a-real-password" }),
    }),
  );
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

async function jsonBody(response: Response): Promise<ReservationJson> {
  return (await response.json()) as ReservationJson;
}

function createReservation(
  app: ReturnType<typeof createTestApp>["app"],
  token: string,
  body: Record<string, unknown>,
) {
  return app.fetch(
    request("/api/v1/media-reservations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );
}

function completeReservation(app: ReturnType<typeof createTestApp>["app"], token: string, id: string) {
  return app.fetch(
    request(`/api/v1/media-reservations/${id}/complete`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

async function reserveAndUpload(
  env: ReturnType<typeof createTestApp>,
  token: string,
  body: Record<string, unknown>,
  bytes: Uint8Array | undefined,
) {
  const created = await jsonBody(await createReservation(env.app, token, body));
  const objectKey = env.repository.records.get(created.id)!.objectKey;
  if (bytes) env.objects.set(objectKey, bytes);
  return created;
}

describe("POST /api/v1/media-reservations/{id}/complete", () => {
  it("validates a real JPEG whose bytes match what was declared", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength },
      validJpegBytes,
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: "validated" });
  });

  it("validates a real MP4 under the duration limit", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const mp4 = buildMinimalMp4(5);
    const created = await reserveAndUpload(env, token, { contentType: "video/mp4", byteSize: mp4.byteLength }, mp4);

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "validated" });
  });

  it("fails when the real uploaded byte count does not match what was declared", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    // Declare a byte size that doesn't match the real object we place in the fake bucket.
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength + 5 },
      validJpegBytes,
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "failed", failureReason: "byte_size_mismatch" });
  });

  it("fails when the real bytes don't match the declared content type", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const randomBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "image/jpeg", byteSize: randomBytes.byteLength },
      randomBytes,
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "failed", failureReason: "format_mismatch" });
  });

  it("fails a video that exceeds the maximum duration", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const longMp4 = buildMinimalMp4(MAX_VIDEO_DURATION_SECONDS + 1);
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "video/mp4", byteSize: longMp4.byteLength },
      longMp4,
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "failed", failureReason: "duration_exceeded" });
  });

  it("fails a malformed/truncated container", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const brokenMp4 = buildFtypBox("isom", ["isom"]); // ftyp only, no moov at all
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "video/mp4", byteSize: brokenMp4.byteLength },
      brokenMp4,
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "failed", failureReason: "malformed_container" });
  });

  it("fails a JPEG that only starts with the SOI marker and has no real EOI", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const soiOnly = validJpegBytes.slice(0, validJpegBytes.byteLength - 2); // strip the real EOI
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "image/jpeg", byteSize: soiOnly.byteLength },
      soiOnly,
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "failed", failureReason: "malformed_container" });
  });

  it("fails an MP4 with a real ftyp/moov/mvhd but no actual track or media data", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const ftyp = buildFtypBox("isom", ["isom"]);
    const mvhd = buildMvhdBoxV0({ timescale: 1000, duration: 1000 });
    const fabricated = concatBoxes(ftyp, buildMoovBox([mvhd])); // no trak, no mdat
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "video/mp4", byteSize: fabricated.byteLength },
      fabricated,
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "failed", failureReason: "malformed_container" });
  });

  it("leaves a reservation pending, retryable, and unwritten when the object hasn't landed yet", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength },
      undefined, // never actually uploaded
    );

    const response = await completeReservation(env.app, token, created.id);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "pending" });
    expect(env.repository.records.get(created.id)!.status).toBe("pending");
    expect(env.repository.records.get(created.id)!.validatedAt).toBeNull();
  });

  it("is idempotent: a repeat call on a settled reservation returns the stored result without reading R2 again", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);
    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength },
      validJpegBytes,
    );

    const first = await jsonBody(await completeReservation(env.app, token, created.id));
    expect(first.status).toBe("validated");

    // Mutate the underlying bytes after settling — if the repeat call reads R2 again,
    // this would change the outcome. It must not: the stored result must be returned unchanged.
    env.objects.set(env.repository.records.get(created.id)!.objectKey, new Uint8Array([9, 9, 9]));

    const second = await jsonBody(await completeReservation(env.app, token, created.id));
    expect(second.status).toBe("validated");
  });

  it("rejects requests without a valid session", async () => {
    const env = createTestApp();
    const response = await completeReservation(env.app, "not-a-real-token", "media_anything");
    expect(response.status).toBe(401);
  });

  it("returns 404 for a nonexistent id and for another owner's reservation", async () => {
    const env = createTestApp();
    const token = await signUpAndGetToken(env.app);

    const missing = await completeReservation(env.app, token, "media_does_not_exist");
    expect(missing.status).toBe(404);

    const created = await reserveAndUpload(
      env,
      token,
      { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength },
      validJpegBytes,
    );
    const otherToken = await signUpAndGetToken(env.app, "other@example.test");
    const crossOwner = await completeReservation(env.app, otherToken, created.id);
    expect(crossOwner.status).toBe(404);
  });

  it("returns 409 once the reservation's TTL has expired without ever completing", async () => {
    vi.useFakeTimers();
    try {
      const env = createTestApp();
      const token = await signUpAndGetToken(env.app);
      const created = await reserveAndUpload(
        env,
        token,
        { contentType: "image/jpeg", byteSize: validJpegBytes.byteLength },
        undefined,
      );

      await vi.advanceTimersByTimeAsync((RESERVATION_TTL_SECONDS + 60) * 1000);

      const response = await completeReservation(env.app, token, created.id);
      expect(response.status).toBe(409);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 503 when media reservations are not configured", async () => {
    const auth = createBetterAuthCompatibilitySlice({
      baseURL: origin,
      secret: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      database: { account: [], session: [], user: [], verification: [] },
    });
    const app = createApp({ auth });
    const token = await signUpAndGetToken(app);

    const response = await completeReservation(app, token, "media_anything");
    expect(response.status).toBe(503);
  });
});
