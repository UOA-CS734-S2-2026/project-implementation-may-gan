import type {
  PostVisibilityFilterInput,
  PostVisibilityFilterResult,
  SqlFragment,
} from "./policy";

const raw = (text: string): SqlFragment => ({ text, params: [] });

function value(value: unknown): SqlFragment {
  return { text: "$1", params: [value] };
}

function compose(text: string, parts: readonly SqlFragment[]): SqlFragment {
  let offset = 0;
  const rewritten = parts.map((part) => {
    const next = part.text.replace(/\$(\d+)/g, (_, index: string) => `$${Number(index) + offset}`);
    offset += part.params.length;
    return next;
  });
  return {
    text: text.replace(/\?/g, () => rewritten.shift() ?? "true"),
    params: parts.flatMap((part) => part.params),
  };
}

const and = (...parts: SqlFragment[]) => compose(parts.map(() => "?").join(" and "), parts);
const or = (...parts: SqlFragment[]) => compose(`(${parts.map(() => "?").join(" or ")})`, parts);
const not = (part: SqlFragment) => compose("not (?)", [part]);
const equals = (left: SqlFragment, right: unknown | SqlFragment): SqlFragment =>
  compose("? = ?", [left, typeof right === "object" && right !== null && "text" in right
    ? right as SqlFragment
    : value(right)]);
const lessThanOrEqual = (left: SqlFragment, right: unknown | SqlFragment): SqlFragment =>
  compose("? <= ?", [left, typeof right === "object" && right !== null && "text" in right
    ? right as SqlFragment
    : value(right)]);

/**
 * Build the list/detail predicate from the same rules as decidePostPermission.
 * The returned text/params can be adapted to Drizzle, postgres.js, or another
 * repository without making this feature depend on a particular DB package.
 */
export function buildPostVisibilityFilter(
  input: PostVisibilityFilterInput,
): PostVisibilityFilterResult {
  const { columns: c, viewer, now } = input;
  const notDeleted = c.deleted ? equals(c.deleted, false) : raw("true");
  const owner = viewer.userId == null ? raw("false") : equals(c.authorId, viewer.userId);
  const released = lessThanOrEqual(c.releaseAt, now);
  const friends = c.friendshipActive && c.blocked
    ? and(equals(c.audience, "friends"), equals(c.friendshipActive, true), equals(c.blocked, false))
    : raw("false");
  const publicLink = input.validatedPublicLinkGrant?.active === true
    && input.validatedPublicLinkGrant.postId.length > 0
    ? and(
      equals(c.audience, "friends"),
      equals(c.authorProfileVisibility ?? raw("true"), "public"),
      equals(c.publicLinkActive ?? raw("true"), true),
      // A validated grant is always bound to exactly one post. Never allow a
      // caller to omit this comparison and broaden the public-link branch.
      equals(c.postId, input.validatedPublicLinkGrant.postId),
      ...(c.publicLinkPostId ? [equals(c.publicLinkPostId, c.postId)] : []),
    )
    : raw("false");
  const nonOwner = and(released, or(friends, publicLink));
  const blocked = viewer.userId != null && c.blocked ? equals(c.blocked, true) : raw("false");
  const access = input.action === "export" ? owner : or(owner, nonOwner);
  const media = input.action === "media" && c.mediaAttached
    ? equals(c.mediaAttached, true)
    : raw("true");

  return {
    where: and(notDeleted, not(blocked), media, access),
    cacheControl: "no-store",
  };
}

export const postListVisibilityFilter = buildPostVisibilityFilter;

/** Detached media rows must never be used to authorise a byte download. */
export function detachedMediaFilter(): SqlFragment {
  return raw("false");
}
