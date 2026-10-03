import { sql, type DayliDatabase } from "@dayli/db";

/** Uses only the app-granted function, never direct access to export requests. */
export async function authorizeExportDownload(database: DayliDatabase, input: {
  userId: string; sessionId: string; requestId: string;
}): Promise<string | null> {
  const [row] = await database.select({ key: sql<string>`authorized.archive_object_key` })
    .from(sql`public.authorize_account_export_download(
      ${input.userId}, ${input.sessionId}, ${input.requestId}) as authorized`);
  return row?.key ?? null;
}
