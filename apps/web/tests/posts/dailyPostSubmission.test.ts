import { Configuration } from "@dayli/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDailyPostSubmitter, validatePostMedia } from "@/lib/api/daily-posts";

vi.mock("@/lib/api/config", () => ({
  apiConfiguration: () => new Configuration({ basePath: "https://api.example.test", credentials: "include" }),
}));

const draft = {
  localDate: "2026-10-14", promptId: "prompt-1", reflectiveAnswer: "A walk by the sea.",
  rating: 7, audience: "friends" as const,
};
const photo = (name = "photo.png") => new File(["photo"], name, { type: "image/png" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();
let nextId: number;
let completionStatus: string;
let postStatus: number;

function requests(path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));
}
function postedBody() {
  return JSON.parse(requests("/api/v1/posts").at(-1)![1]!.body as string);
}

beforeEach(() => {
  nextId = 0;
  completionStatus = "validated";
  postStatus = 201;
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/v1/media-reservations")) {
      const id = `media-${++nextId}`;
      return json({
        id, ...JSON.parse(init!.body as string), status: "pending",
        createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
        upload: { url: `https://storage.example.test/${id}`, method: "PUT",
          requiredHeaders: { "content-type": "image/png", "Content-Length": "5", "if-none-match": "*" } },
      }, 201);
    }
    if (init?.method === "PUT") return new Response(null, { status: 200 });
    if (url.endsWith("/complete")) return json({
      id: url.split("/").at(-2), status: completionStatus, contentType: "image/png", byteSize: 5,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    if (postStatus !== 201) return json({ error: {
      message: "An attachment can't be used.", details: { reason: "MEDIA_UNAVAILABLE" },
    } }, postStatus);
    return json({
      ...postedBody(), id: "post-1", authorId: "me", prompt: { id: "prompt-1", text: "Your day?" },
      acceptedAt: new Date().toISOString(), releasedAt: new Date().toISOString(),
      media: [], voiceMemo: null, weather: null, tomorrowNote: null,
    }, 201);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("web daily post submission", () => {
  it("uploads and validates photos before sending their IDs in display order", async () => {
    const files = [photo("first.png"), photo("second.png")];
    expect((await createDailyPostSubmitter()(draft, files, "key-1")).ok).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.example.test/api/v1/media-reservations", "https://storage.example.test/media-1",
      "https://api.example.test/api/v1/media-reservations/media-1/complete",
      "https://api.example.test/api/v1/media-reservations", "https://storage.example.test/media-2",
      "https://api.example.test/api/v1/media-reservations/media-2/complete",
      "https://api.example.test/api/v1/posts",
    ]);
    const put = fetchMock.mock.calls[1]![1]!;
    expect(put.body).toBe(files[0]);
    expect(put.headers).toEqual({ "content-type": "image/png", "if-none-match": "*" });
    expect(postedBody().attachments).toEqual(["media-1", "media-2"]);
    expect(new Headers(requests("/api/v1/posts")[0]![1]!.headers).get("idempotency-key")).toBe("key-1");
  });

  it("keeps text-only posts working without media requests", async () => {
    expect((await createDailyPostSubmitter()(draft, [], "key-1")).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postedBody()).not.toHaveProperty("attachments");
  });

  it("reuses validated uploads and the post key after a lost post response", async () => {
    const submit = createDailyPostSubmitter();
    const files = [photo()];
    const normalFetch = fetchMock.getMockImplementation()!;
    let lost = true;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/api/v1/posts") && lost) {
        lost = false;
        throw new TypeError("Lost response");
      }
      return normalFetch(url, init);
    });
    expect(await submit(draft, files, "key-1")).toMatchObject({ ok: false, failure: { kind: "network" } });
    expect((await submit(draft, files, "key-1")).ok).toBe(true);
    expect(requests("/api/v1/media-reservations")).toHaveLength(1);
    expect(requests("/complete")).toHaveLength(1);
    expect(requests("/api/v1/posts")).toHaveLength(2);
    expect(postedBody().attachments).toEqual(["media-1"]);
  });

  it("recovers a lost PUT response through the storage precondition response", async () => {
    const submit = createDailyPostSubmitter();
    const files = [photo()];
    const normalFetch = fetchMock.getMockImplementation()!;
    let putAttempts = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "PUT") {
        if (++putAttempts === 1) throw new TypeError("Lost PUT response");
        return new Response(null, { status: 412 });
      }
      return normalFetch(url, init);
    });
    expect((await submit(draft, files, "key-1")).ok).toBe(false);
    expect(requests("/api/v1/posts")).toHaveLength(0);
    expect((await submit(draft, files, "key-1")).ok).toBe(true);
    expect(requests("/api/v1/media-reservations")).toHaveLength(1);
  });

  it("does not post when storage rejects the upload", async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) => init?.method === "PUT"
      ? Promise.resolve(new Response(null, { status: 500 })) : normalFetch(url, init));
    expect(await createDailyPostSubmitter()(draft, [photo()], "key-1"))
      .toMatchObject({ ok: false, failure: { kind: "unavailable" } });
    expect(requests("/api/v1/posts")).toHaveLength(0);
  });

  it("retries completion without uploading again while validation is pending", async () => {
    const submit = createDailyPostSubmitter();
    const files = [photo()];
    completionStatus = "pending";
    expect(await submit(draft, files, "key-1"))
      .toMatchObject({ ok: false, failure: { reason: "MEDIA_NOT_READY" } });
    expect(requests("/api/v1/posts")).toHaveLength(0);
    completionStatus = "validated";
    expect((await submit(draft, files, "key-1")).ok).toBe(true);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });

  it("does not post failed validation and reserves again on retry", async () => {
    const submit = createDailyPostSubmitter();
    const files = [photo()];
    completionStatus = "failed";
    expect(await submit(draft, files, "key-1")).toMatchObject({ ok: false, failure: { kind: "invalid" } });
    expect(requests("/api/v1/posts")).toHaveLength(0);
    completionStatus = "validated";
    expect((await submit(draft, files, "key-1")).ok).toBe(true);
    expect(postedBody().attachments).toEqual(["media-2"]);
  });

  it("reuploads attachments after an explicit MEDIA_UNAVAILABLE post rejection", async () => {
    const submit = createDailyPostSubmitter();
    const files = [photo()];
    postStatus = 409;
    expect(await submit(draft, files, "key-1"))
      .toMatchObject({ ok: false, failure: { reason: "MEDIA_UNAVAILABLE" } });
    postStatus = 201;
    expect((await submit(draft, files, "key-1")).ok).toBe(true);
    expect(postedBody().attachments).toEqual(["media-2"]);
  });

  it("reuses retained files after reordering and uploads only new files", async () => {
    const submit = createDailyPostSubmitter();
    const first = photo("first.png");
    const second = photo("second.png");
    await submit(draft, [first, second], "key-1");
    await submit(draft, [second, first, photo("third.png")], "key-2");
    expect(requests("/api/v1/media-reservations")).toHaveLength(3);
    expect(postedBody().attachments).toEqual(["media-2", "media-1", "media-3"]);
  });

  it("rejects unsupported files before any network request", async () => {
    expect(await createDailyPostSubmitter()(draft, [new File(["gif"], "a.gif", { type: "image/gif" })], "key-1"))
      .toMatchObject({ ok: false, failure: { kind: "invalid" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("post media limits", () => {
  it("rejects mixed media, too many photos, empty files, and byte limits", () => {
    const sizedPhoto = (size: number) => new File([new Uint8Array(size)], "large.png", { type: "image/png" });
    expect(validatePostMedia([photo(), new File(["video"], "a.mp4", { type: "video/mp4" })])).toMatch(/never both/);
    expect(validatePostMedia([photo(), photo(), photo(), photo()])).toMatch(/up to 3/);
    expect(validatePostMedia([sizedPhoto(0)])).toMatch(/non-empty/);
    expect(validatePostMedia([sizedPhoto(10 * 1024 * 1024 + 1)])).toMatch(/10 MB/);
    expect(validatePostMedia(Array.from({ length: 3 }, () => sizedPhoto(9 * 1024 * 1024)))).toMatch(/25 MB/);
    expect(validatePostMedia([photo()])).toBeUndefined();
  });
});
