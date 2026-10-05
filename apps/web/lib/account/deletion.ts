import { z } from "zod";
import { apiBaseUrl } from "@/lib/api/config";

const timestamp = z.string().datetime({ offset: true });
const statusSchema = z.object({
  state: z.enum(["active", "pending_deletion", "purging", "purge_failed"]),
  generation: z.number().int().nonnegative(),
  requestId: z.string().nullable(),
  requestedAt: timestamp.nullable(),
  cancelUntil: timestamp.nullable(),
  purgeDueAt: timestamp.nullable(),
}).strict();
const grantSchema = z.object({ action: z.enum(["request_deletion", "cancel_deletion"]), token: z.string().regex(/^[0-9a-f]{64}$/), expiresAt: timestamp }).strict();
export type AccountDeletionStatus = z.infer<typeof statusSchema>;
export type DeletionAction = "request_deletion" | "cancel_deletion";

async function json(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const proof = body && typeof body === "object" && "error" in body
      ? (body as { error?: { details?: { proof?: unknown } } }).error?.details?.proof
      : undefined;
    if (proof === "google_required") throw new Error("google-required");
    if (response.status === 503) throw new Error("unavailable");
    throw new Error("rejected");
  }
  return body;
}

export async function getDeletionStatus(): Promise<AccountDeletionStatus> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/deletion`, { credentials: "include", cache: "no-store" });
  return statusSchema.parse(await json(response));
}

export async function proveDeletionWithPassword(action: DeletionAction, password: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/reauthenticate/password`, {
    method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, password }),
  });
  return grantSchema.parse(await json(response)).token;
}

export async function beginGoogleDeletionProof(action: DeletionAction): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/reauthenticate/google`, {
    method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
  });
  return z.object({ authorizationUrl: z.url(), expiresAt: timestamp }).strict().parse(await json(response)).authorizationUrl;
}

export async function requestDeletion(grantToken: string, idempotencyKey: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/deletion/request`, {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ grantToken }),
  });
  await json(response);
}

export async function cancelDeletion(grantToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/account/deletion/cancel`, {
    method: "POST", credentials: "include", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ grantToken }),
  });
  await json(response);
}

export function deletionIdempotencyKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
