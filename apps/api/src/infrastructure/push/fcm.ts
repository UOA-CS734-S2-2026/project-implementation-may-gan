import { importPKCS8, SignJWT } from "jose";
import { diagnosticElapsed, safeException, type SafeException } from "./diagnostic-error";

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

export interface GenericFcmNotificationInput {
  token: string;
  eventId: string;
  type: "direct_message" | "friend_request" | "final_hour_reminder" | "friends_post_release";
  targetType: "conversation" | "friend_request" | "posting_day" | "friends_feed";
  targetId: string;
  title: string;
  body: string;
}

export type FcmResult =
  | { ok: true }
  | { ok: false; retryable: boolean; category: "transient" | "rate_limited" | "provider_rejected" | "unauthorized" };

export type FcmTransportReason = "connection_lost" | "connection_refused" | "dns_failure" | "tls_failure" | "timeout" | "subrequest_limit" | "cross_request_io" | "invalid_invocation" | "redirect_failed" | "unknown";

/** Classify locally, but never return error text, URLs, codes or nested objects. */
export function classifyFcmTransportFailure(error: unknown): FcmTransportReason {
  try {
    const entries = [error, typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined];
    for (const entry of entries) {
      if ((typeof entry !== "object" || entry === null) && typeof entry !== "string") continue;
      const { message, code, name } = typeof entry === "string" ? { message: entry, code: undefined, name: undefined } : entry as { message?: unknown; code?: unknown; name?: unknown };
      const text = typeof message === "string" ? message.slice(0, 4_096) : "";
      if (/cannot perform i\/o on behalf of a different request/i.test(text)) return "cross_request_io";
      if (/too many subrequests|subrequest limit/i.test(text)) return "subrequest_limit";
      if (/illegal invocation|invalid invocation/i.test(text)) return "invalid_invocation";
      if (code === "ENOTFOUND" || code === "EAI_AGAIN" || /dns lookup failed|dns resolution failed|failed to resolve/i.test(text)) return "dns_failure";
      if (code === "ECONNREFUSED") return "connection_refused";
      if (code === "ECONNRESET" || code === "EPIPE" || /network connection lost|connection reset|socket hang up/i.test(text)) return "connection_lost";
      if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || name === "TimeoutError" || /connection timed out|connect timeout/i.test(text)) return "timeout";
      if (code === "CERT_HAS_EXPIRED" || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || /tls handshake|ssl handshake|certificate verify failed/i.test(text)) return "tls_failure";
      if (/redirect mode.*error|redirect.*not allowed/i.test(text)) return "redirect_failed";
    }
  } catch { /* Treat unreadable exception properties as unknown. */ }
  return "unknown";
}

export type FcmDiagnostic = {
  stage: "oauth" | "fcm";
  outcome: "accepted" | "signing_invalid" | "response_rejected" | "response_invalid" | "transport_failed" | "aborted";
  httpStatus?: number;
  transportReason?: FcmTransportReason;
};

function responseStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

export type FcmTrace = FcmDiagnostic & { elapsedMs: number; exception?: SafeException };

export class FcmOAuthError extends Error {
  constructor(public readonly category: "signing_invalid" | "response_rejected" | "response_invalid" | "transport_failed", public readonly httpStatus?: number, public readonly transportReason?: FcmTransportReason, public readonly exception?: SafeException) {
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
  } catch (error) {
    throw new FcmOAuthError("signing_invalid", undefined, undefined, safeException(error));
  }

  let response: Response;
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      redirect: "error",
      signal: input.signal,
    });
  } catch (error) {
    throw new FcmOAuthError("transport_failed", undefined, classifyFcmTransportFailure(error), safeException(error));
  }
  if (!response || typeof response !== "object" || typeof response.ok !== "boolean") {
    throw new FcmOAuthError("response_invalid");
  }
  if (!response.ok) throw new FcmOAuthError("response_rejected", responseStatus(response.status));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FcmOAuthError("response_invalid");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FcmOAuthError("response_invalid");
  const tokenResponse = body as { access_token?: unknown; expires_in?: unknown };
  if (typeof tokenResponse.access_token !== "string" || tokenResponse.access_token.length === 0 || typeof tokenResponse.expires_in !== "number" || !Number.isFinite(tokenResponse.expires_in) || tokenResponse.expires_in <= 0) {
    throw new FcmOAuthError("response_invalid");
  }
  return { token: tokenResponse.access_token, expiresAt: now().getTime() + tokenResponse.expires_in * 1_000 };
}

/** Worker-compatible FCM HTTP v1 sender. It never includes sender or message text. */
export function createFcmHttpV1Sender(input: { serviceAccount: FcmServiceAccount; fetch?: typeof globalThis.fetch; now?: () => Date; onDiagnostic?: (value: FcmDiagnostic) => void; onTrace?: (value: FcmTrace) => void }) {
  const fetcher = input.fetch ?? globalThis.fetch;
  const now = input.now ?? (() => new Date());
  let accessToken: { value: string; expiresAt: number } | undefined;
  const diagnose = (value: FcmDiagnostic) => {
    // Observability must never change delivery or retry behavior.
    try { input.onDiagnostic?.(value); } catch { /* Ignore diagnostic sink failures. */ }
  };

  const trace = (value: FcmTrace) => {
    try { input.onTrace?.(value); } catch { /* Ignore diagnostic sink failures. */ }
  };

  async function oauthToken(signal?: AbortSignal): Promise<string> {
    const started = Date.now();
    if (accessToken && accessToken.expiresAt > now().getTime() + 30_000) return accessToken.value;
    try {
      const token = await requestFcmOAuthToken({ serviceAccount: input.serviceAccount, fetch: fetcher, now, signal });
      accessToken = { value: token.token, expiresAt: token.expiresAt };
      diagnose({ stage: "oauth", outcome: "accepted" });
      trace({ stage: "oauth", outcome: "accepted", elapsedMs: diagnosticElapsed(started) });
      return accessToken.value;
    } catch (error) {
      const outcome = signal?.aborted ? "aborted" : error instanceof FcmOAuthError ? error.category : "transport_failed";
      const httpStatus = error instanceof FcmOAuthError ? responseStatus(error.httpStatus) : undefined;
      const transportReason = outcome === "transport_failed"
        ? error instanceof FcmOAuthError ? error.transportReason ?? "unknown" : classifyFcmTransportFailure(error)
        : undefined;
      diagnose({ stage: "oauth", outcome, ...(httpStatus === undefined ? {} : { httpStatus }), ...(transportReason === undefined ? {} : { transportReason }) });
      trace({ stage: "oauth", outcome, elapsedMs: diagnosticElapsed(started), ...(httpStatus === undefined ? {} : { httpStatus }), ...(transportReason === undefined ? {} : { transportReason }), exception: error instanceof FcmOAuthError ? error.exception : safeException(error) });
      throw error;
    }
  }

  async function sendPayload(payload: unknown, signal?: AbortSignal): Promise<FcmResult> {
    let stage: FcmDiagnostic["stage"] = "oauth";
    let started = Date.now();
    try {
      if (signal?.aborted) {
        diagnose({ stage, outcome: "aborted" });
        return { ok: false, retryable: true, category: "transient" };
      }
      const token = await oauthToken(signal);
      stage = "fcm";
      started = Date.now();
      const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(input.serviceAccount.projectId)}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload), signal,
      });
      const httpStatus = responseStatus(response.status);
      diagnose({ stage, outcome: response.ok ? "accepted" : "response_rejected", ...(httpStatus === undefined ? {} : { httpStatus }) });
      trace({ stage, outcome: response.ok ? "accepted" : "response_rejected", elapsedMs: diagnosticElapsed(started), ...(httpStatus === undefined ? {} : { httpStatus }) });
      if (response.ok) return { ok: true };
      if (response.status === 401 || response.status === 403) return { ok: false, retryable: true, category: "unauthorized" };
      if (response.status === 429) return { ok: false, retryable: true, category: "rate_limited" };
      if (response.status >= 500) return { ok: false, retryable: true, category: "transient" };
      return { ok: false, retryable: false, category: "provider_rejected" };
    } catch (error) {
      if (stage === "fcm") diagnose({ stage, outcome: signal?.aborted ? "aborted" : "transport_failed", ...(signal?.aborted ? {} : { transportReason: classifyFcmTransportFailure(error) }) });
      if (stage === "fcm") trace({ stage, outcome: signal?.aborted ? "aborted" : "transport_failed", elapsedMs: diagnosticElapsed(started), exception: safeException(error), ...(signal?.aborted ? {} : { transportReason: classifyFcmTransportFailure(error) }) });
      return { ok: false, retryable: true, category: "transient" };
    }
  }

  return {
    send: (notification: FcmNotificationInput, options?: { signal: AbortSignal }) =>
      sendPayload(buildFcmPayload(notification), options?.signal),
    sendGeneric: (notification: GenericFcmNotificationInput, options?: { signal: AbortSignal }) =>
      sendPayload(buildGenericFcmPayload(notification), options?.signal),
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

export function buildGenericFcmPayload(notification: GenericFcmNotificationInput) {
  const collapseId = notification.type === "direct_message" ? notification.targetId : notification.eventId;
  return { message: {
    token: notification.token,
    notification: { title: notification.title, body: notification.body },
    data: {
      version: "1",
      eventId: notification.eventId,
      type: notification.type,
      targetType: notification.targetType,
      targetId: notification.targetId,
    },
    android: { collapse_key: collapseId },
    apns: { headers: { "apns-collapse-id": collapseId } },
  } };
}
