export const exportArchiveVersion = 2;

/** One reviewed list drives database paging and the archive manifest. */
export const exportSourceKinds = ["profile", "terms", "age", "posts", "revisions", "notes", "messages"] as const;
export type ExportSourceKind = (typeof exportSourceKinds)[number];
