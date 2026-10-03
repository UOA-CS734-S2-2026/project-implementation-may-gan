import { safeReturnPath } from "./safe-return-path";

export const PUBLIC_ACTIONS = ["friend-request", "message-request", "like", "comment"] as const;
export type PublicAction = (typeof PUBLIC_ACTIONS)[number];

/** Return intent survives OAuth, but expires quickly and remains bound to the first signed-in account. */
export const PUBLIC_INTENT_MAX_AGE_MS = 10 * 60 * 1000;
type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StoredIntent = { issuedAt: number; actorId: string | null };

function intentStorageKey(target: string): string {
  return `dayli:public-intent:${target}`;
}

const USERNAME = /^[a-z0-9][a-z0-9_]{2,29}$/;
const POST_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isPublicAction(value: string | null | undefined): value is PublicAction {
  return PUBLIC_ACTIONS.some((action) => action === value);
}

/** Only profile and post routes can cross authentication as public action targets. */
export function publicActionTarget(value: string | null | undefined): string | null {
  if (!value || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://dayli.invalid");
    if (url.origin !== "https://dayli.invalid" || url.hash) return null;
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== "u" || !USERNAME.test(parts[1] ?? "")) return null;
    if (parts.length === 3 && !POST_ID.test(parts[2] ?? "")) return null;
    if (parts.length !== 2 && parts.length !== 3) return null;
    const action = url.searchParams.get("intent");
    if (!isPublicAction(action) || [...url.searchParams.keys()].some((key) => key !== "intent")) return null;
    return `${url.pathname}?intent=${action}`;
  } catch {
    return null;
  }
}

export function safeAuthenticationReturnPath(value: string | null | undefined, fallback = "/home"): string {
  if (!value) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://dayli.invalid");
  } catch {
    return fallback;
  }
  if (parsed.searchParams.has("intent")) return publicActionTarget(value) ?? fallback;
  if (parsed.origin !== "https://dayli.invalid") return fallback;
  return safeReturnPath(value, fallback);
}

export function withPublicAction(pathname: string, action: PublicAction): string {
  const target = publicActionTarget(`${pathname}?intent=${action}`);
  if (!target) throw new Error("Invalid public action target");
  return target;
}

export function signInForPublicAction(pathname: string, action: PublicAction): string {
  return `/sign-in?next=${encodeURIComponent(withPublicAction(pathname, action))}`;
}

export function rememberPublicIntent(
  target: string,
  storage: IntentStorage = window.sessionStorage,
  now = Date.now(),
): boolean {
  const safeTarget = publicActionTarget(target);
  if (!safeTarget) return false;
  storage.setItem(intentStorageKey(safeTarget), JSON.stringify({ issuedAt: now, actorId: null } satisfies StoredIntent));
  return true;
}

export function resumePublicIntent(
  target: string,
  actorId: string,
  storage: IntentStorage = window.sessionStorage,
  now = Date.now(),
): boolean {
  const safeTarget = publicActionTarget(target);
  if (!safeTarget) return false;
  const key = intentStorageKey(safeTarget);
  try {
    const state = JSON.parse(storage.getItem(key) ?? "null") as Partial<StoredIntent> | null;
    const issuedAt = state?.issuedAt;
    const age = typeof issuedAt === "number" ? now - issuedAt : Number.POSITIVE_INFINITY;
    if (!state || typeof issuedAt !== "number" || age < 0 || age > PUBLIC_INTENT_MAX_AGE_MS || (state.actorId !== null && state.actorId !== actorId)) {
      storage.removeItem(key);
      return false;
    }
    storage.setItem(key, JSON.stringify({ issuedAt, actorId } satisfies StoredIntent));
    return true;
  } catch {
    storage.removeItem(key);
    return false;
  }
}
