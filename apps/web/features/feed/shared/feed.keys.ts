export const feedKeys = {
  list: (userId: string) => ["feed", userId] as const,
} as const;
