export const messagingKeys = {
  root: (userId: string) => ["messaging", userId] as const,
  inbox: (userId: string, folder: "inbox" | "requests") => ["messaging", userId, "inbox", folder] as const,
  unread: (userId: string) => ["messaging", userId, "unread"] as const,
  conversation: (userId: string, conversationId: string) => ["messaging", userId, "conversation", conversationId] as const,
  messages: (userId: string, conversationId: string) => ["messaging", userId, "messages", conversationId] as const,
} as const;
