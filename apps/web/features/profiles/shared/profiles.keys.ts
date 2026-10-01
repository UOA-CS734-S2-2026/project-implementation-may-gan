export const profileKeys = {
  // Handles resolve case-insensitively, so /u/Ben and /u/ben share one cache entry.
  details: (userId: string, username: string) => ["profiles", userId, "details", username.toLowerCase()] as const,
  all: (userId: string) => ["profiles", userId] as const,
} as const;
