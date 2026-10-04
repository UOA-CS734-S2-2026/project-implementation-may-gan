import { schema } from "@dayli/db";
import { and, eq } from "drizzle-orm";

/**
 * The revisions of a post the viewer may read. The author reads every earlier
 * version. Anyone else reads only versions that were already shared with
 * friends, so text written while the post was solo stays with its author.
 */
export function visibleRevisions(postId: string, viewerIsAuthor: boolean) {
  const { postRevisions } = schema;
  return viewerIsAuthor
    ? eq(postRevisions.postId, postId)
    : and(eq(postRevisions.postId, postId), eq(postRevisions.previousAudience, "friends"));
}
