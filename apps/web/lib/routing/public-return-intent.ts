import { safeReturnPath } from "./safe-return-path";

export const PUBLIC_ACTIONS = ["friend-request", "message-request", "like", "comment"] as const;
export type PublicAction = (typeof PUBLIC_ACTIONS)[number];

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
