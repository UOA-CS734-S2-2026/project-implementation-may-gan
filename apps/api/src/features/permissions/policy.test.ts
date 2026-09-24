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
  decidePostPermission(action === "media"
    ? { action, mediaId: "media-1", post: { ...base, ...overrides }, viewer: { userId: viewer }, now }
    : { action, post: { ...base, ...overrides }, viewer: { userId: viewer }, now });

describe("post permission policy", () => {
  it.each([
    ["owner before release", { releaseAt: new Date("2026-09-23"), friendshipActive: false }, "alice", true],
    ["stranger", {}, "bob", false],
    ["pending friend", { friendshipActive: false }, "bob", false],
    ["active friend", { friendshipActive: true }, "bob", true],
    ["later friend", { friendshipActive: true }, "carol", true],
    ["ended friend", { friendshipActive: false }, "bob", false],
    ["solo", { audience: "solo" }, "bob", false],
    ["unreleased", { releaseAt: new Date("2026-09-23"), friendshipActive: true }, "bob", false],
    ["either-direction block", { friendshipActive: true, blocked: true }, "bob", false],
    ["public link", { publicLinkGrant: { postId: "post-1", active: true } }, "bob", true],
    ["grant for another post", { publicLinkGrant: { postId: "post-2", active: true } }, "bob", false],
    ["inactive public link", { publicLinkGrant: { postId: "post-1", active: false } }, "bob", false],
    ["private account link", { authorProfileVisibility: "private", publicLinkGrant: { postId: "post-1", active: true } }, "bob", false],
    ["private account link still permits friend", { authorProfileVisibility: "private", friendshipActive: true, publicLinkGrant: { postId: "post-1", active: true } }, "bob", true],
    ["changed audience", { audience: "solo", publicLinkGrant: { postId: "post-1", active: true } }, "bob", false],
  ] as const)("%s", (_name, post, viewer, expected) => {
    expect(decide(post, viewer).allowed).toBe(expected);
  });

  it("uses current post access for revisions and keeps export author-only", () => {
    expect(decide({ friendshipActive: true }, "bob", "revision").allowed).toBe(true);
    expect(decide({ friendshipActive: true }, "bob", "export").allowed).toBe(false);
    expect(decide({}, "alice", "export").allowed).toBe(true);
  });

  it("denies known blocked signed-in viewers even with a public link", () => {
    expect(decide({ blocked: true, publicLinkGrant: { postId: "post-1", active: true } }).allowed).toBe(false);
    expect(decide({ publicLinkGrant: { postId: "post-1", active: true } }, null).allowed).toBe(true);
  });

  it("denies deleted posts and detached media", () => {
    expect(decide({ deleted: true }, "alice").allowed).toBe(false);
    expect(decide({ mediaAttached: false }, "alice", "media").allowed).toBe(false);
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
