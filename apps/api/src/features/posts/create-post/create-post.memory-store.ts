// Test support only: an in-memory DailyPostStore for service and route tests.
import {
  CreateDailyPostError,
  type DailyPostStore,
  type NewDailyPost,
  type StoredDailyPost,
} from "./create-post.service";

/** An in-memory store that serialises each author's transactions like the advisory lock. */
export function createMemoryDailyPostStore(prompts: Record<string, string> = {}) {
  const posts: NewDailyPost[] = [];
  const locks = new Map<string, Promise<unknown>>();
  const promptText = (id: string) => prompts[id] ?? "What made you smile today?";

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
  });

  const store: DailyPostStore = {
    withAuthorTransaction(authorId, operation) {
      const previous = locks.get(authorId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => operation({
        async findIdempotentOutcome(author, key) {
          const post = posts.find((candidate) => candidate.authorId === author && candidate.idempotencyKey === key);
          return post ? { requestFingerprint: post.requestFingerprint, post: toStored(post) } : null;
        },
        async hasPostForDay(author, localDate) {
          return posts.some((candidate) => candidate.authorId === author && candidate.localDate === localDate);
        },
        async findActivePrompt(localDate) {
          const id = `prompt-${localDate.slice(5)}`;
          return { id, text: promptText(id) };
        },
        async insertPost(post) {
          if (posts.some((candidate) => candidate.authorId === post.authorId && candidate.localDate === post.localDate)) {
            throw new CreateDailyPostError("ALREADY_POSTED");
          }
          posts.push(post);
          return toStored(post);
        },
      }));
      locks.set(authorId, next);
      return next;
    },
  };
  return { store, posts };
}
