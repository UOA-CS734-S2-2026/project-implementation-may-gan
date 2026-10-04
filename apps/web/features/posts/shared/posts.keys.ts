export const postKeys = {
  all: (userId: string) => ["posts", userId] as const,
  detail: (userId: string, postId: string) => ["posts", userId, "detail", postId] as const,
  revisions: (userId: string, postId: string) => ["posts", userId, "revisions", postId] as const,
  // Handles resolve case-insensitively, so /u/Ben and /u/ben share one cache entry.
  profile: (userId: string, username: string) => ["posts", userId, "profile", username.toLowerCase()] as const,
} as const;
