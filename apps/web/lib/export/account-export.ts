import { z } from "zod";
import { apiBaseUrl } from "@/lib/api/config";

const exportStatus = z.object({
  requestId: z.string().nullable(),
  status: z.enum(["none", "requested", "building", "ready", "failed", "cancelled", "expired"]),
  requestedAt: z.string().nullable(),
  readyAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
}).strict();
export type AccountExportStatus = z.infer<typeof exportStatus>;

export async function getAccountExportStatus(): Promise<AccountExportStatus> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/export`, {
    credentials: "include", cache: "no-store",
  });
  if (!response.ok) throw new Error("Account export status is unavailable.");
  return exportStatus.parse(await response.json());
}

export async function requestAccountExport(): Promise<Pick<AccountExportStatus, "requestId" | "status" | "requestedAt">> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/export/request`, {
    method: "POST", credentials: "include", cache: "no-store",
  });
  if (!response.ok) throw new Error("Account export could not be requested.");
  return z.object({ requestId: z.string(),
    status: z.enum(["requested", "building", "ready", "expired"]), requestedAt: z.string() }).strict().parse(await response.json());
}

/** Navigate to an authenticated API response so the browser saves a streamed ZIP to disk. */
export function accountExportDownloadUrl(requestId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error("Invalid account export request ID.");
  }
  return `${apiBaseUrl}/api/v1/account/export/${encodeURIComponent(requestId)}/download`;
}
