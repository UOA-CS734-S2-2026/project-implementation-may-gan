import { sql, type DayliDatabase } from "@dayli/db";
import type { AccountManagementAction } from "../password/password.repository";
import { googleManagementAuthorizationUrl } from "./google-proof-oauth";

const encoder = new TextEncoder();
const statePattern = /^dayli-management-[0-9a-f]{64}\.[A-Za-z0-9_-]{1,512}\.[0-9a-f]{64}$/;

function randomHex(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | undefined {
  try {
    return atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch { return undefined; }
}

function sameText(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function createGoogleManagementState(completionOrigin: string, stateSecret: string): Promise<string> {
  const unsigned = `dayli-management-${randomHex()}.${base64Url(completionOrigin)}`;
  return `${unsigned}.${await hmac(unsigned, stateSecret)}`;
}

export async function googleManagementCompletionOrigin(state: string, stateSecret: string): Promise<string | undefined> {
  if (!statePattern.test(state)) return undefined;
  const [unsigned, signature] = state.split(/\.(?=[^.]+$)/);
  if (!unsigned || !signature || !sameText(signature, await hmac(unsigned, stateSecret))) return undefined;
  const origin = fromBase64Url(unsigned.split(".")[1] ?? "");
  try {
    return origin && new URL(origin).origin === origin && new URL(origin).protocol === "https:" ? origin : undefined;
  } catch { return undefined; }
}

function date(value: Date | string | null | undefined): Date | null {
  const parsed = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

export interface GoogleProofConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  completionOrigin: string;
  stateSecret: string;
}

/** A fresh intent does not itself give permission to delete an account. */
export async function beginGoogleManagementIntent(database: DayliDatabase, input: {
  userId: string;
  sessionId: string;
  action: AccountManagementAction;
  configuration: GoogleProofConfiguration;
}): Promise<{ url: string; expiresAt: Date } | null> {
  const state = await createGoogleManagementState(input.configuration.completionOrigin, input.configuration.stateSecret);
  const nonce = randomHex();
  const url = await googleManagementAuthorizationUrl({ state, nonce, ...input.configuration });
  const rows = await database.select({ expiresAt: sql<Date | string | null>`public.begin_google_account_management_intent(
    ${input.userId}, ${input.sessionId}, ${input.action}::public.account_management_grant_action,
    ${await digest(state)}, ${await digest(nonce)}
  )` }).from(sql`(values (1)) as intent_request`);
  const expiresAt = date(rows[0]?.expiresAt);
  return expiresAt ? { url, expiresAt } : null;
}

export async function claimGoogleManagementIntent(database: DayliDatabase, input: {
  state: string;
  userId: string;
  sessionId: string;
}): Promise<{ stateDigest: string; action: AccountManagementAction; nonceDigest: string; createdAt: Date; linkedSubject: string } | null> {
  if (!statePattern.test(input.state)) return null;
  const stateDigest = await digest(input.state);
  const rows = await database.select({
    action: sql<AccountManagementAction>`proof_action`,
    nonceDigest: sql<string>`proof_nonce_digest`,
    createdAt: sql<Date | string>`proof_created_at`,
    linkedSubject: sql<string>`proof_linked_subject`,
  }).from(sql`public.claim_google_account_management_intent(${stateDigest}, ${input.userId}, ${input.sessionId})`);
  const proof = rows[0];
  const createdAt = date(proof?.createdAt);
  return proof && createdAt && (proof.action === "request_deletion" || proof.action === "cancel_deletion")
    ? { stateDigest, action: proof.action, nonceDigest: proof.nonceDigest, createdAt, linkedSubject: proof.linkedSubject }
    : null;
}

export async function completeGoogleManagementIntent(database: DayliDatabase, input: {
  userId: string;
  sessionId: string;
  action: AccountManagementAction;
  stateDigest: string;
  verifiedSubject: string;
}): Promise<{ token: string; expiresAt: Date } | null> {
  const token = randomHex();
  const rows = await database.select({ expiresAt: sql<Date | string | null>`public.complete_google_account_management_intent(
    ${input.stateDigest}, ${input.userId}, ${input.sessionId},
    ${input.action}::public.account_management_grant_action, ${input.verifiedSubject}, ${await digest(token)}
  )` }).from(sql`(values (1)) as intent_completion`);
  const expiresAt = date(rows[0]?.expiresAt);
  return expiresAt ? { token, expiresAt } : null;
}

/** Counts only. Expired state and nonce digests must not accumulate indefinitely. */
export async function pruneExpiredGoogleManagementIntents(database: DayliDatabase): Promise<number> {
  const rows = await database.select({ removed: sql<number>`public.prune_expired_google_management_intents(1000)` })
    .from(sql`(values (1)) as expiry_cleanup`);
  return rows[0]?.removed ?? 0;
}
