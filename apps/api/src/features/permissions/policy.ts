export type PostAudience = "solo" | "friends";
export type ProfileVisibility = "public" | "private";
export type PermissionAction =
  | "list"
  | "detail"
  | "revision"
  | "preview"
  | "export"
  | "media";

export interface Viewer {
  /** Anonymous viewers have no user id. */
  userId?: string | null;
}

export interface ValidatedPublicLinkGrant {
  /** #41 owns token hashing, lookup, and revocation. */
  postId: string;
  active: boolean;
}

export interface PostPermissionState {
  postId: string;
  authorId: string;
  audience: PostAudience;
  authorProfileVisibility: ProfileVisibility;
  releaseAt: Date;
  localDate: string;
  deleted?: boolean;
  friendshipActive: boolean;
  blocked: boolean;
  /** False for media referenced only by an old revision. */
  mediaAttached?: boolean;
  publicLinkGrant?: ValidatedPublicLinkGrant;
}

export type PermissionRequest =
  | {
      action: "media";
      viewer: Viewer;
      post: PostPermissionState;
      mediaId: string;
      now?: Date;
    }
  | {
      action: Exclude<PermissionAction, "media">;
      viewer: Viewer;
      post: PostPermissionState;
      now?: Date;
    };

export type DenialReason =
  | "anonymous"
  | "blocked"
  | "deleted"
  | "not_released"
  | "not_owner"
  | "not_friend"
  | "not_public_link"
  | "solo_post"
  | "detached_media";

export interface PermissionDecision {
  allowed: boolean;
  /** Internal reason for metrics/tests; callers should conceal all denials. */
  reason?: DenialReason;
  /** Private responses must never be shared by an intermediary cache. */
  cacheControl: "no-store";
}

const denied = (reason: DenialReason): PermissionDecision => ({
  allowed: false,
  reason,
  cacheControl: "no-store",
});

const allowed = (): PermissionDecision => ({ allowed: true, cacheControl: "no-store" });

/**
 * Authorise a post or one of its alternate representations.
 *
 * This deliberately evaluates the current post state for revisions and media:
 * an old revision never preserves access after the post is hidden, and a
 * detached media row never grants access to its bytes.
 */
export function decidePostPermission(request: PermissionRequest): PermissionDecision {
  const { post, viewer } = request;
  const now = request.now ?? new Date();
  const isOwner = viewer.userId != null && viewer.userId === post.authorId;

  if (post.deleted) return denied("deleted");
  if (request.action === "media" && post.mediaAttached !== true) return denied("detached_media");
  if (request.action === "export" && !isOwner) return denied("not_owner");
  if (post.blocked && viewer.userId != null) return denied("blocked");

  // Export remains owner-only, including before release. All other owner reads
  // are also available before release.
  if (isOwner) return allowed();
  if (request.action === "media" && post.audience === "solo") return denied("solo_post");
  if (post.releaseAt.getTime() > now.getTime()) return denied("not_released");
  if (post.audience === "solo") return denied("solo_post");

  if (post.publicLinkGrant?.postId === post.postId && post.publicLinkGrant.active) {
    // A public link is valid only for released friends posts on public profiles.
    // A known signed-in block was handled above; anonymous bearer links cannot
    // be matched to an individual block.
    if (post.authorProfileVisibility === "public") return allowed();
    if (viewer.userId == null) return denied("not_public_link");
  }

  if (viewer.userId == null) return denied("anonymous");
  if (!post.friendshipActive) return denied("not_friend");
  return allowed();
}

export function canReadPost(
  post: PostPermissionState,
  viewer: Viewer,
  now?: Date,
): boolean {
  return decidePostPermission({ action: "detail", post, viewer, now }).allowed;
}

export interface TomorrowNoteState {
  authorId: string;
  postLocalDate: string;
  submitted: boolean;
}

/** Tomorrow notes are separate author-only content and use Auckland dates. */
export function canReadTomorrowNote(
  note: TomorrowNoteState,
  viewer: Viewer,
  currentAucklandDate: string,
): boolean {
  return note.submitted
    && viewer.userId === note.authorId
    && currentAucklandDate > note.postLocalDate;
}

export function concealDeniedResource(decision: PermissionDecision): PermissionDecision {
  return decision.allowed ? decision : { ...decision, reason: undefined };
}

/** SQL fragments are intentionally supplied by the caller's schema layer. */
export interface SqlFragment {
  text: string;
  params: readonly unknown[];
}

export interface PostVisibilityColumns {
  postId: SqlFragment;
  authorId: SqlFragment;
  audience: SqlFragment;
  releaseAt: SqlFragment;
  deleted?: SqlFragment;
  authorProfileVisibility?: SqlFragment;
  friendshipActive?: SqlFragment;
  blocked?: SqlFragment;
  publicLinkActive?: SqlFragment;
  publicLinkPostId?: SqlFragment;
  mediaAttached?: SqlFragment;
}

interface PostVisibilityFilterInputBase {
  viewer: Viewer;
  now: Date;
  /** Supplied only by #41 after validating an active grant for this post. */
  validatedPublicLinkGrant?: ValidatedPublicLinkGrant;
}

export type PostVisibilityFilterInput = PostVisibilityFilterInputBase & (
  | {
      action: "media";
      columns: PostVisibilityColumns & { mediaAttached: SqlFragment };
    }
  | {
      action?: Exclude<PermissionAction, "media">;
      columns: PostVisibilityColumns;
    }
);

export interface PostVisibilityFilterResult {
  /** Apply this in WHERE before LIMIT/OFFSET/cursor pagination. */
  where: SqlFragment;
  cacheControl: "no-store";
}
