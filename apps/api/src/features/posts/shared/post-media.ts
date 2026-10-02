import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { audioContentTypes, type AudioContentType, type VisualContentType } from "@dayli/contracts";
import { createPresignedDownloadUrl, type R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import type { PostVoiceMemo, PostMedia } from "./post-media.contract";

/** How long a download URL works. Short, because it is a bearer credential. */
export const MEDIA_DOWNLOAD_TTL_SECONDS = 5 * 60;

/** An attached upload before signing. The object key never leaves the API. */
export interface PostMediaRef {
  id: string;
  postId: string;
  contentType: VisualContentType;
  order: number;
  objectKey: string;
}

/** A post's attached voice memo before signing. The object key never leaves the API. */
export interface PostVoiceMemoRef {
  id: string;
  postId: string;
  contentType: AudioContentType;
  objectKey: string;
}

/** Signs one object for download. Routes hold none when storage isn't configured. */
export type SignMediaDownload = (objectKey: string, now: Date) => Promise<{ url: string; expiresAt: Date }>;

export function createR2MediaDownloadSigner(configuration: R2RuntimeConfiguration): SignMediaDownload {
  return (objectKey, now) => createPresignedDownloadUrl(configuration, {
    objectKey,
    expiresInSeconds: MEDIA_DOWNLOAD_TTL_SECONDS,
    now,
  });
}

/**
 * Attached photos and videos for posts the caller has already been allowed to
 * read, in display order, in one query. Voice memos, detached rows and
 * legacy imports without an upload are left out, so they are never signed here.
 */
export async function readAttachedMedia(
  database: DayliDatabase,
  postIds: readonly string[],
): Promise<Map<string, PostMediaRef[]>> {
  const byPost = new Map<string, PostMediaRef[]>();
  if (postIds.length === 0) return byPost;
  const rows = await database
    .select({
      id: schema.postMedia.id,
      postId: schema.postMedia.postId,
      order: schema.postMedia.attachmentOrder,
      contentType: schema.mediaReservation.contentType,
      objectKey: schema.mediaReservation.objectKey,
    })
    .from(schema.postMedia)
    .innerJoin(schema.mediaReservation, eq(schema.mediaReservation.id, schema.postMedia.reservationId))
    .where(and(
      inArray(schema.postMedia.postId, [...postIds]),
      isNull(schema.postMedia.detachedAt),
      notInArray(schema.mediaReservation.contentType, [...audioContentTypes]),
    ))
    .orderBy(asc(schema.postMedia.postId), asc(schema.postMedia.attachmentOrder));
  for (const row of rows) {
    // A reservation only ever stores an allowed type.
    const ref = { ...row, contentType: row.contentType as VisualContentType };
    byPost.set(row.postId, [...(byPost.get(row.postId) ?? []), ref]);
  }
  return byPost;
}

/**
 * Sign each ref for this response. Callers must not build a media response
 * without storage: they return 503 instead, so url is never null.
 */
export async function signPostMedia(
  refs: readonly PostMediaRef[],
  sign: SignMediaDownload,
  now: Date,
): Promise<PostMedia[]> {
  return Promise.all(refs.map(async (ref) => {
    const download = await sign(ref.objectKey, now);
    return {
      id: ref.id,
      contentType: ref.contentType,
      order: ref.order,
      url: download.url,
      expiresAt: download.expiresAt.toISOString(),
    };
  }));
}

/**
 * The voice memo attached to a post the caller has already been allowed
 * to read, or null. A post has at most one; detached rows are left out.
 */
export async function readAttachedVoiceMemo(
  database: DayliDatabase,
  postId: string,
): Promise<PostVoiceMemoRef | null> {
  const [row] = await database
    .select({
      id: schema.postMedia.id,
      postId: schema.postMedia.postId,
      contentType: schema.mediaReservation.contentType,
      objectKey: schema.mediaReservation.objectKey,
    })
    .from(schema.postMedia)
    .innerJoin(schema.mediaReservation, eq(schema.mediaReservation.id, schema.postMedia.reservationId))
    .where(and(
      eq(schema.postMedia.postId, postId),
      isNull(schema.postMedia.detachedAt),
      inArray(schema.mediaReservation.contentType, [...audioContentTypes]),
    ))
    .limit(1);
  // The filter above leaves only audio types.
  return row ? { ...row, contentType: row.contentType as AudioContentType } : null;
}

/** Sign one voice memo for this response; callers return 503 first when storage isn't configured. */
export async function signPostVoiceMemo(
  ref: PostVoiceMemoRef,
  sign: SignMediaDownload,
  now: Date,
): Promise<PostVoiceMemo> {
  const download = await sign(ref.objectKey, now);
  return {
    id: ref.id,
    contentType: ref.contentType,
    url: download.url,
    expiresAt: download.expiresAt.toISOString(),
  };
}
