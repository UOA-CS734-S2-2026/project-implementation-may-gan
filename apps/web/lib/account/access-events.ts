export type AccessEvent =
  | { type: "unauthenticated" }
  | { type: "restricted"; restriction: string; allowed: string[] }
  | { type: "invalidate" };

type Observer = (event: AccessEvent) => void;
let observer: Observer | undefined;

/** One mounted authentication generation owns response notifications. */
export function observeAccountAccess(next: Observer): () => void {
  observer = next;
  return () => { if (observer === next) observer = undefined; };
}

const restrictions = new Set([
  "banned", "pending_deletion", "purging", "purge_failed", "underage_restricted",
  "terms_blocked", "age_declaration_blocked",
]);
const mutations = new Set([
  "/api/v1/legal/acceptance", "/api/v1/profile/username",
  "/api/v1/account/deletion/request", "/api/v1/account/deletion/cancel",
]);

/** Observe a clone so feature adapters retain the original body and error handling. */
export async function accountApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const owner = observer;
  const response = await fetch(input, init);
  if (!owner || owner !== observer) return response;
  let event: AccessEvent | undefined;
  if (response.status === 401) event = { type: "unauthenticated" };
  else if (response.status === 403) {
    const body = await response.clone().json().catch(() => undefined) as {
      error?: { code?: unknown; details?: { restriction?: unknown; allowed?: unknown } };
    } | undefined;
    const details = body?.error?.details;
    if (body?.error?.code === "FORBIDDEN" && typeof details?.restriction === "string"
      && restrictions.has(details.restriction) && Array.isArray(details.allowed)
      && details.allowed.every((value) => typeof value === "string")) {
      event = { type: "restricted", restriction: details.restriction, allowed: details.allowed };
    }
  } else if (response.ok) {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "POST" && mutations.has(new URL(url, "https://local.invalid").pathname)) event = { type: "invalidate" };
  }
  // Parsing the body may have overlapped an account switch.
  if (event && owner === observer) owner(event);
  return response;
}
