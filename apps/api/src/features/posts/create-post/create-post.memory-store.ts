// Test support only: an in-memory DailyPostStore for service and route tests.
import {
  CreateDailyPostError,
  type DailyPostStore,
  type NewDailyPost,
  type StoredDailyPost,
} from "./create-post.service";

/** A media reservation as the store sees it. Tests push these to set up uploads. */
export interface MemoryReservation {
  id: string;
  ownerId: string;
  status: "pending" | "validated" | "failed";
  contentType: string;
  byteSize: number;
  expiresAt: Date;
}

/** An in-memory store that serialises each author's transactions like the advisory lock. */
export function createMemoryDailyPostStore(prompts: Record<string, string> = {}) {
  /** `trashed` marks a post its author moved to Trash. */
  const posts: Array<NewDailyPost & { trashed?: boolean }> = [];
  const reservations: MemoryReservation[] = [];
  const locks = new Map<string, Promise<unknown>>();
  const promptText = (id: string) => prompts[id] ?? "What made you smile today?";
  const linkedReservationIds = () => new Set(posts.flatMap((post) => post.media.map((media) => media.reservationId)));

  const toStored = (post: NewDailyPost): StoredDailyPost => ({
    id: post.id,
    authorId: post.authorId,
    localDate: post.localDate,
    prompt: { id: post.promptId, text: promptText(post.promptId) },
    reflectiveAnswer: post.reflectiveAnswer,
    caption: post.caption,
    rating: post.rating,
    audience: post.audience,
    acceptedAt: post.acceptedAt,
    releasedAt: post.releasedAt,
    tomorrowNoteAvailableOn: post.tomorrowNote?.availableOn ?? null,
    weather: post.weather,
    media: post.media.map((media) => ({
      id: media.id,
      contentType: reservations.find((reservation) => reservation.id === media.reservationId)?.contentType ?? "",
      order: media.order,
    })),
  });

  const store: DailyPostStore = {
    withAuthorTransaction(authorId, operation) {
      const previous = locks.get(authorId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => operation({
        async findIdempotentOutcome(author, key) {
          const post = posts.find((candidate) => candidate.authorId === author && candidate.idempotencyKey === key);
          if (!post) return null;
          return { requestFingerprint: post.requestFingerprint, post: post.trashed ? null : toStored(post) };
        },
        async hasPostForDay(author, localDate) {
          return posts.some((candidate) => candidate.authorId === author && candidate.localDate === localDate && !candidate.trashed);
        },
        async findActivePrompt(localDate) {
          const id = `prompt-${localDate.slice(5)}`;
          return { id, text: promptText(id) };
        },
        async lockAttachableMedia(author, reservationIds) {
          const linked = linkedReservationIds();
          return reservations
            .filter((reservation) => reservation.ownerId === author && reservationIds.includes(reservation.id))
            .map((reservation) => ({
              reservationId: reservation.id,
              status: reservation.status,
              contentType: reservation.contentType,
              byteSize: reservation.byteSize,
              expiresAt: reservation.expiresAt,
              linked: linked.has(reservation.id),
            }));
        },
        async insertPost(post) {
          if (posts.some((candidate) => candidate.authorId === post.authorId && candidate.localDate === post.localDate && !candidate.trashed)) {
            throw new CreateDailyPostError("ALREADY_POSTED");
          }
          const linked = linkedReservationIds();
          if (post.media.some((media) => linked.has(media.reservationId))) {
            throw new CreateDailyPostError("MEDIA_UNAVAILABLE");
          }
          posts.push(post);
          return toStored(post);
        },
      }));
      locks.set(authorId, next);
      return next;
    },
  };
  return { store, posts, reservations };
}
