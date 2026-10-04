import { describe, expect, it } from "vitest";
import {
  canReadTomorrowNote,
  decidePostPermission,
  type PermissionAction,
  type PostPermissionState,
} from "./policy";

const now = new Date("2026-09-22T00:00:00.000Z");
const base: PostPermissionState = {
  postId: "post-1",
  authorId: "alice",
  audience: "friends",
  authorProfileVisibility: "public",
  releaseAt: new Date("2026-09-21T00:00:00.000Z"),
  localDate: "2026-09-21",
  friendshipActive: false,
  blocked: false,
};

const decide = (overrides: Partial<PostPermissionState>, viewer: string | null = "bob", action: PermissionAction = "detail") =>
  decidePostPermission(action === "media" || action === "private-media"
    ? { action, mediaId: "media-1", post: { ...base, ...overrides }, viewer: { userId: viewer }, now }
    : { action, post: { ...base, ...overrides }, viewer: { userId: viewer }, now });

describe("post permission policy", () => {
  it.each([
    ["owner before release", { releaseAt: new Date("2026-09-23"), friendshipActive: false }, "alice", true],
    ["signed-in public-profile stranger", {}, "bob", true],
    ["anonymous public-profile reader", {}, null, true],
    ["private-profile stranger", { authorProfileVisibility: "private" }, "bob", false],
    ["anonymous private-profile reader", { authorProfileVisibility: "private" }, null, false],
    ["private-profile active friend", { authorProfileVisibility: "private", friendshipActive: true }, "bob", true],
    ["private-profile ended friend", { authorProfileVisibility: "private", friendshipActive: false }, "bob", false],
    ["solo", { audience: "solo" }, "bob", false],
    ["unreleased", { releaseAt: new Date("2026-09-23"), friendshipActive: true }, "bob", false],
    ["either-direction block", { friendshipActive: true, blocked: true }, "bob", false],
  ] as const)("%s", (_name, post, viewer, expected) => {
    expect(decide(post, viewer).allowed).toBe(expected);
  });

  it("opens profile archives without widening generic lists, revisions, or exports", () => {
    expect(decide({ friendshipActive: true }, "bob", "revision").allowed).toBe(true);
    expect(decide({}, "bob", "revision").allowed).toBe(false);
    expect(decide({}, null, "profile").allowed).toBe(true);
    expect(decide({ authorProfileVisibility: "private" }, null, "profile").allowed).toBe(false);
    expect(decide({}, null, "list").allowed).toBe(false);
    expect(decide({ friendshipActive: true }, "bob", "export").allowed).toBe(false);
    expect(decide({}, "alice", "export").allowed).toBe(true);
  });

  it("denies known blocked signed-in viewers before public-profile access", () => {
    expect(decide({ blocked: true }).allowed).toBe(false);
    expect(decide({}, null).allowed).toBe(true);
  });

  it("denies deleted posts and detached media", () => {
    expect(decide({ deleted: true }, "alice").allowed).toBe(false);
    expect(decide({ mediaAttached: false }, "alice", "media").allowed).toBe(false);
  });

  it("allows public media through the parent-authorized action only", () => {
    expect(decide({ mediaAttached: true }, null, "media").allowed).toBe(true);
    expect(decide({ mediaAttached: true }, "bob", "media").allowed).toBe(true);
    expect(decide({ mediaAttached: true }, "bob", "private-media").allowed).toBe(false);
    expect(decide({ mediaAttached: true, authorProfileVisibility: "private" }, null, "media").allowed).toBe(false);
    expect(decide({ mediaAttached: true, audience: "solo" }, null, "media").allowed).toBe(false);
    expect(decide({ mediaAttached: true, releaseAt: new Date("2026-09-23") }, null, "media").allowed).toBe(false);
    expect(decide({ mediaAttached: true, blocked: true }, "bob", "media").allowed).toBe(false);
  });

  it("denies media when attachment state is omitted", () => {
    expect(decide({}, "alice", "media").allowed).toBe(false);
  });
});

describe("tomorrow note policy", () => {
  const note = { authorId: "alice", postLocalDate: "2026-09-22", submitted: true };

  it("is author-only and delayed until the next Auckland day", () => {
    expect(canReadTomorrowNote(note, { userId: "alice" }, "2026-09-22")).toBe(false);
    expect(canReadTomorrowNote(note, { userId: "alice" }, "2026-09-23")).toBe(true);
    expect(canReadTomorrowNote(note, { userId: "bob" }, "2026-09-23")).toBe(false);
  });
});
