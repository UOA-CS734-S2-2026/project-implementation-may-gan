import { importPKCS8, SignJWT } from "jose";

export interface FcmServiceAccount {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

export interface FcmNotificationInput {
  token: string;
  eventId: string;
  conversationId: string;
}

export type FcmResult =
  | { ok: true }
  | { ok: false; retryable: boolean; category: "transient" | "rate_limited" | "provider_rejected" | "unauthorized" };

/** Worker-compatible FCM HTTP v1 sender. It never includes sender or message text. */
export function createFcmHttpV1Sender(input: { serviceAccount: FcmServiceAccount; fetch?: typeof globalThis.fetch; now?: () => Date }) {
  const fetcher = input.fetch ?? globalThis.fetch;
  const now = input.now ?? (() => new Date());
  let accessToken: { value: string; expiresAt: number } | undefined;

  async function oauthToken(): Promise<string> {
    if (accessToken && accessToken.expiresAt > now().getTime() + 30_000) return accessToken.value;
    const key = await importPKCS8(input.serviceAccount.privateKey, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(input.serviceAccount.clientEmail)
      .setSubject(input.serviceAccount.clientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(Math.floor(now().getTime() / 1_000))
      .setExpirationTime("5m")
      .sign(key);
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!response.ok) throw new Error("FCM OAuth token request failed.");
    const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") throw new Error("FCM OAuth response was invalid.");
    accessToken = { value: body.access_token, expiresAt: now().getTime() + Number(body.expires_in ?? 300) * 1_000 };
    return accessToken.value;
  }

  return {
    async send(notification: FcmNotificationInput): Promise<FcmResult> {
      try {
        const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(input.serviceAccount.projectId)}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${await oauthToken()}`, "content-type": "application/json" },
          body: JSON.stringify(buildFcmPayload(notification)),
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
