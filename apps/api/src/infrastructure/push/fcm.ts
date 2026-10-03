import { importPKCS8, SignJWT } from "jose";

export interface FcmServiceAccount {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

interface FirebaseServiceAccountDocument {
  client_email?: unknown;
  private_key?: unknown;
  project_id?: unknown;
  clientEmail?: unknown;
  privateKey?: unknown;
  projectId?: unknown;
}

export interface FcmNotificationInput {
  token: string;
  eventId: string;
  conversationId: string;
}

export type FcmResult =
  | { ok: true }
  | { ok: false; retryable: boolean; category: "transient" | "rate_limited" | "provider_rejected" | "unauthorized" };

export class FcmOAuthError extends Error {
  constructor(public readonly category: "signing_invalid" | "response_rejected" | "response_invalid" | "transport_failed") {
    super(category);
  }
}

/**
 * Normalizes Firebase's standard snake-case document. The camel-case fields
 * remain accepted only for Workers already configured with the earlier shape.
 */
export function normalizeFcmServiceAccount(value: unknown): FcmServiceAccount | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const document = value as FirebaseServiceAccountDocument;
  const clientEmail = document.client_email ?? document.clientEmail;
  const privateKey = document.private_key ?? document.privateKey;
  const projectId = document.project_id ?? document.projectId;
  if (![clientEmail, privateKey, projectId].every((field) => typeof field === "string" && field.length > 0)) return undefined;
  return { clientEmail: clientEmail as string, privateKey: privateKey as string, projectId: projectId as string };
}

/** OAuth-only helper. It never constructs or sends an FCM message request. */
export async function requestFcmOAuthToken(input: {
  serviceAccount: FcmServiceAccount;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  signal?: AbortSignal;
}): Promise<{ token: string; expiresAt: number }> {
  const fetcher = input.fetch ?? globalThis.fetch;
  const now = input.now ?? (() => new Date());
  let assertion: string;
  try {
    const key = await importPKCS8(input.serviceAccount.privateKey, "RS256");
    assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(input.serviceAccount.clientEmail)
      .setSubject(input.serviceAccount.clientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(Math.floor(now().getTime() / 1_000))
      .setExpirationTime("5m")
      .sign(key);
  } catch {
    throw new FcmOAuthError("signing_invalid");
  }

  let response: Response;
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: input.signal,
    });
  } catch {
    throw new FcmOAuthError("transport_failed");
  }
  if (!response.ok) throw new FcmOAuthError("response_rejected");

  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = await response.json() as { access_token?: unknown; expires_in?: unknown };
  } catch {
    throw new FcmOAuthError("response_invalid");
  }
  if (typeof body.access_token !== "string" || body.access_token.length === 0 || !Number.isFinite(Number(body.expires_in ?? 300))) {
    throw new FcmOAuthError("response_invalid");
  }
  return { token: body.access_token, expiresAt: now().getTime() + Number(body.expires_in ?? 300) * 1_000 };
}

/** Worker-compatible FCM HTTP v1 sender. It never includes sender or message text. */
export function createFcmHttpV1Sender(input: { serviceAccount: FcmServiceAccount; fetch?: typeof globalThis.fetch; now?: () => Date }) {
  const fetcher = input.fetch ?? globalThis.fetch;
  const now = input.now ?? (() => new Date());
  let accessToken: { value: string; expiresAt: number } | undefined;

  async function oauthToken(signal?: AbortSignal): Promise<string> {
    if (accessToken && accessToken.expiresAt > now().getTime() + 30_000) return accessToken.value;
    const token = await requestFcmOAuthToken({ serviceAccount: input.serviceAccount, fetch: fetcher, now, signal });
    accessToken = { value: token.token, expiresAt: token.expiresAt };
    return accessToken.value;
  }

  return {
    async send(notification: FcmNotificationInput, options?: { signal: AbortSignal }): Promise<FcmResult> {
      try {
        if (options?.signal.aborted) return { ok: false, retryable: true, category: "transient" };
        const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(input.serviceAccount.projectId)}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${await oauthToken(options?.signal)}`, "content-type": "application/json" },
          body: JSON.stringify(buildFcmPayload(notification)), signal: options?.signal,
        });
        if (response.ok) return { ok: true };
        if (response.status === 401 || response.status === 403) return { ok: false, retryable: true, category: "unauthorized" };
        if (response.status === 429) return { ok: false, retryable: true, category: "rate_limited" };
        if (response.status >= 500) return { ok: false, retryable: true, category: "transient" };
        return { ok: false, retryable: false, category: "provider_rejected" };
      } catch {
        return { ok: false, retryable: true, category: "transient" };
      }
    },
  };
}

export function buildFcmPayload(notification: FcmNotificationInput) {
  return { message: {
    token: notification.token,
    notification: { title: "Dayli", body: "New message on Dayli" },
    data: { eventId: notification.eventId, conversationId: notification.conversationId },
    android: { collapse_key: notification.conversationId },
    apns: { headers: { "apns-collapse-id": notification.conversationId } },
  } };
}
