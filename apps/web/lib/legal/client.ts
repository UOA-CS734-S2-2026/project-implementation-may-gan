import { apiBaseUrl } from "@/lib/api/config";

export type CanonicalTerms = {
  id: string;
  version: number;
  contentDigest: string;
  effectiveAt: string;
  canonicalContent: string;
};

export type TermsNotice = {
  id: string;
  version: number;
  contentDigest: string;
  materialChange: boolean;
  noticeStartsAt: string;
  effectiveAt: string;
  urgentChangeReason: string | null;
  canonicalContent: string;
};

export type AccountPolicy = {
  restriction: "active" | "pending_deletion" | "purging" | "purge_failed" | "underage_restricted" | "terms_blocked" | "age_declaration_blocked";
  allowed: string[];
};

type RawTerms = {
  id?: unknown;
  version?: unknown;
  contentDigest?: unknown;
  effectiveAt?: unknown;
  status?: unknown;
};

type VerifiedTermsMetadata = {
  id: string;
  version: number;
  contentDigest: string;
  effectiveAt: string;
  status: "effective";
};

function endpoint(path: string): string {
  if (!apiBaseUrl) throw new Error("The legal service is unavailable.");
  return `${apiBaseUrl}${path}`;
}

function isTerms(value: unknown): value is VerifiedTermsMetadata {
  if (!value || typeof value !== "object") return false;
  const terms = value as RawTerms;
  return typeof terms.id === "string" && typeof terms.version === "number" && Number.isInteger(terms.version)
    && typeof terms.contentDigest === "string" && /^[0-9a-f]{64}$/.test(terms.contentDigest)
    && typeof terms.effectiveAt === "string" && terms.status === "effective";
}

async function digest(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(response.status === 409 ? "Terms changed. Review the current version before continuing." : "Legal information is unavailable. Try again.");
  return response.json();
}

export async function loadCurrentTerms(): Promise<CanonicalTerms | null> {
  const result = await json(await fetch(endpoint("/api/v1/legal/terms/current/content"), { cache: "no-store" }));
  if (!result || typeof result !== "object") throw new Error("Legal information is unavailable. Try again.");
  const { terms, canonicalContent } = result as { terms?: unknown; canonicalContent?: unknown };
  if (terms === null && canonicalContent === null) return null;
  if (!isTerms(terms) || typeof canonicalContent !== "string" || await digest(canonicalContent) !== terms.contentDigest) {
    throw new Error("The current Terms could not be verified. Try again.");
  }
  return { id: terms.id, version: terms.version, contentDigest: terms.contentDigest, effectiveAt: terms.effectiveAt, canonicalContent };
}

export async function loadNotice(): Promise<TermsNotice | null> {
  const result = await json(await fetch(endpoint("/api/v1/legal/terms/notice"), { cache: "no-store", credentials: "include" }));
  if (!result || typeof result !== "object") throw new Error("Legal information is unavailable. Try again.");
  const notice = (result as { notice?: unknown }).notice;
  if (notice === null) return null;
  if (!notice || typeof notice !== "object") throw new Error("Legal information is unavailable. Try again.");
  const item = notice as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.version !== "number" || typeof item.contentDigest !== "string"
    || typeof item.materialChange !== "boolean" || typeof item.noticeStartsAt !== "string" || typeof item.effectiveAt !== "string"
    || (item.urgentChangeReason !== null && typeof item.urgentChangeReason !== "string")) throw new Error("Legal information is unavailable. Try again.");
  const contentResult = await json(await fetch(endpoint(`/api/v1/legal/terms/versions/${item.version}/content`), { cache: "no-store" }));
  const content = contentResult as { terms?: unknown; canonicalContent?: unknown };
  const published = content.terms as RawTerms | undefined;
  if (!published || typeof published.id !== "string" || typeof published.version !== "number" || typeof published.contentDigest !== "string"
    || published.status !== "notice" || typeof content.canonicalContent !== "string" || published.id !== item.id
    || published.version !== item.version || published.contentDigest !== item.contentDigest || await digest(content.canonicalContent) !== item.contentDigest) {
    throw new Error("The Terms notice could not be verified. Try again.");
  }
  return { id: item.id, version: item.version, contentDigest: item.contentDigest, materialChange: item.materialChange, noticeStartsAt: item.noticeStartsAt, effectiveAt: item.effectiveAt, urgentChangeReason: item.urgentChangeReason, canonicalContent: content.canonicalContent };
}

export async function issueRegistrationIntent(flow: "email" | "google_browser") {
  const result = await json(await fetch(endpoint("/api/v1/legal/registration-intents"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ flow, acceptTerms: true, declareAge16OrOlder: true }),
  }));
  if (!result || typeof result !== "object") throw new Error("Legal registration is unavailable. Try again.");
  const value = result as Record<string, unknown>;
  if (typeof value.intent !== "string" || !/^[0-9a-f]{64}$/.test(value.intent) || typeof value.flowBinding !== "string" || !/^[0-9a-f]{64}$/.test(value.flowBinding) || !isTerms(value.terms)) {
    throw new Error("Legal registration is unavailable. Try again.");
  }
  return { intent: value.intent, flowBinding: value.flowBinding, terms: value.terms };
}

export async function readAccountPolicy(): Promise<AccountPolicy> {
  const result = await json(await fetch(endpoint("/api/v1/account/policy"), { credentials: "include", cache: "no-store" }));
  if (!result || typeof result !== "object") throw new Error("Account status is unavailable. Try again.");
  const policy = result as Partial<AccountPolicy>;
  if (typeof policy.restriction !== "string" || !Array.isArray(policy.allowed) || !policy.allowed.every((item) => typeof item === "string")) {
    throw new Error("Account status is unavailable. Try again.");
  }
  return policy as AccountPolicy;
}

export async function acceptTerms(terms: CanonicalTerms): Promise<void> {
  await json(await fetch(endpoint("/api/v1/account/legal/acceptance"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ acceptTerms: true, declareAge16OrOlder: true, termsVersionId: terms.id, contentDigest: terms.contentDigest }),
  }));
}

export function registrationHeaders(intent: { intent: string; flowBinding: string }) {
  return {
    "x-dayli-registration-intent": intent.intent,
    "x-dayli-registration-binding": intent.flowBinding,
  };
}
