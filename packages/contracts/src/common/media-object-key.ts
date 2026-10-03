export const OWNED_MEDIA_OBJECT_NAMESPACE = "media/";

/** A path string is not ownership proof. Writers must use this constructor. */
export function buildOwnedMediaObjectKey(ownerId: string, reservationId: string): string {
  const safeSegment = /^[a-zA-Z0-9_-]{1,128}$/;
  if (!safeSegment.test(ownerId) || !safeSegment.test(reservationId)) {
    throw new Error("A media object path needs two opaque, slash-free identifiers.");
  }
  return `${OWNED_MEDIA_OBJECT_NAMESPACE}${ownerId}/${reservationId}`;
}
