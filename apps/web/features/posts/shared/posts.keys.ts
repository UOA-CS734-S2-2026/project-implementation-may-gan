export const postKeys = {
  detail: (userId: string, postId: string) => ["posts", userId, "detail", postId] as const,
} as const;
