import { createDayliDatabase, schema } from "@dayli/db";
import { expect } from "vitest";
import { createAppForEnv } from "../../src/app";

const databaseUrl = process.env.LIFECYCLE_AUTH_TEST_DATABASE_URL;
const appUrl = process.env.LIFECYCLE_AUTH_TEST_APP_DATABASE_URL;
const required = process.env.REQUIRE_LIFECYCLE_AUTH_TEST === "1";
const enabled = Boolean(databaseUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
export const origin = "https://api.example.test";

function local(value: string | undefined, name: string, user: string) {
  if (!value) throw new Error(`${name} is required when REQUIRE_LIFECYCLE_AUTH_TEST=1.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${port}/dayli_lifecycle_test.`);
  }
  return value;
}

if (required && !enabled) throw new Error("Lifecycle Better Auth integration requires isolated PostgreSQL URLs.");

export const lifecycleContentionEnabled = enabled;

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export function taggedUrl(value: string, applicationName: string) {
  const url = new URL(value);
  url.searchParams.set("application_name", applicationName);
  return url.toString();
}

export function createLifecycleContentionFixture(label: string) {
  const nonce = `${label.slice(0, 8)}-${crypto.randomUUID().replaceAll("-", "")}`;
  const migrator = createDayliDatabase(taggedUrl(local(databaseUrl, "LIFECYCLE_AUTH_TEST_DATABASE_URL", "migrator"), `${nonce}-observer`));
  const writerUrl = taggedUrl(local(appUrl, "LIFECYCLE_AUTH_TEST_APP_DATABASE_URL", "app"), `${nonce}-writer`);
  const app = createAppForEnv({
    HYPERDRIVE: { connectionString: taggedUrl(local(appUrl, "LIFECYCLE_AUTH_TEST_APP_DATABASE_URL", "app"), `${nonce}-deleter`) },
    BETTER_AUTH_SECRET: "lifecycle-auth-test-secret-that-is-at-least-32-characters",
    BETTER_AUTH_BASE_URL: origin,
    BETTER_AUTH_TRUSTED_ORIGINS: origin,
    ACCOUNT_DELETION_REQUESTS_ENABLED: "enabled",
  });

  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    return new Request(`${origin}${path}`, { ...init, headers });
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  async function signup(name: string) {
    await migrator.client`delete from public."rateLimit"`;
    const documentId = `contention-terms-${crypto.randomUUID()}`;
    const canonicalContent = "# Contention test Terms\n\nCanonical test content.";
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalContent)))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await migrator.db.insert(schema.legalDocumentVersions).values({
      id: documentId,
      kind: "terms",
      version: Math.floor(Math.random() * 1_000_000_000) + 1,
      contentDigest: digest,
      materialChange: false,
    });
    await migrator.db.insert(schema.legalDocumentContents).values({ termsVersionId: documentId, canonicalContent });
    await migrator.client`update public.legal_document_versions set status = 'effective', effective_at = now() where id = ${documentId}`;
    const admission = await app.fetch(request("/api/v1/legal/registration-intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: "email", acceptTerms: true, declareAge16OrOlder: true }),
    }));
    expect(admission.status).toBe(201);
    const proof = await admission.json() as { intent: string; flowBinding: string };
    const email = `${nonce}-${name}@example.test`;
    const response = await app.fetch(request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dayli-registration-intent": proof.intent,
        "x-dayli-registration-binding": proof.flowBinding,
      },
      body: JSON.stringify({
        name,
        username: `${name.toLowerCase()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
        email,
        password: "not-a-real-password",
      }),
    }));
    expect(response.status).toBe(200);
    const token = response.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    const body = await response.json() as { user?: { id?: string } };
    expect(body.user?.id).toBeTruthy();
    return { id: body.user!.id!, token: token! };
  }

  async function deletionGrant(token: string) {
    const proof = await app.fetch(request("/api/v1/account/reauthenticate/password", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ action: "request_deletion", password: "not-a-real-password" }),
    }));
    expect(proof.status).toBe(200);
    const { grant } = await proof.json() as { grant: string };
    expect(grant).toBeTruthy();
    return grant;
  }

  async function requestDeletion(token: string, grant: string) {
    return app.fetch(request("/api/v1/account/deletion/request", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ grant }),
    }));
  }

  async function seedActiveConversation(aliceId: string, bobId: string) {
    const conversationId = crypto.randomUUID();
    const aliceMessageId = crypto.randomUUID();
    const bobMessageId = crypto.randomUUID();
    await migrator.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${aliceId}, ${bobId}, 'active', now()), (${bobId}, ${aliceId}, 'active', now())`;
    await migrator.client`insert into public.conversations (id, kind, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${conversationId}, 'direct', least(${aliceId}, ${bobId}), greatest(${aliceId}, ${bobId}), ${aliceId}, 'active', 2, 0, now(), now(), now())`;
    await migrator.client`insert into public.conversation_members (conversation_id, participant_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${conversationId}, ${aliceId}, 0, 0, now(), now()), (${conversationId}, ${bobId}, 0, 0, now(), now())`;
    await migrator.client`insert into public.messages (id, conversation_id, sequence, sender_participant_id, client_message_id, request_fingerprint, body, version, created_at) values (${aliceMessageId}, ${conversationId}, 1, ${aliceId}, ${crypto.randomUUID()}, ${crypto.randomUUID()}, 'Alice retained message', 1, now()), (${bobMessageId}, ${conversationId}, 2, ${bobId}, ${crypto.randomUUID()}, ${crypto.randomUUID()}, 'Bob withdrawable message', 1, now())`;
    return { conversationId, aliceMessageId, bobMessageId };
  }

  async function seedReaction(messageId: string, participantId: string, reaction: "like" | "love" | "laugh" | "sad" | "thanks") {
    await migrator.client`insert into public.message_reactions (message_id, participant_id, reaction, created_at) values (${messageId}, ${participantId}, ${reaction}, now())`;
  }

  async function waitForDeletionBlockedBy(writerApplicationName: string) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await migrator.client<{ application_name: string; blockers: number[] }[]>`
        select application_name, pg_blocking_pids(pid) as blockers
        from pg_stat_activity
        where application_name = ${`${nonce}-deleter`}
      `;
      if (rows.some((row) => row.blockers.length > 0)) {
        const writers = await migrator.client<{ pid: number }[]>`select pid from pg_stat_activity where application_name = ${writerApplicationName}`;
        if (rows.some((row) => writers.some((writer) => row.blockers.includes(writer.pid)))) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Deletion request did not wait on the gated writer transaction.");
  }

  async function close(userIds: string[]) {
    try {
      if (userIds.length) {
        await migrator.client`delete from public.relationship_blocks where blocker_id = any(${userIds}::text[]) or blocked_id = any(${userIds}::text[])`;
        await migrator.client`delete from public.friendships where user_id = any(${userIds}::text[]) or friend_id = any(${userIds}::text[])`;
        await migrator.client`delete from public.friend_requests where sender_id = any(${userIds}::text[]) or recipient_id = any(${userIds}::text[])`;
        await migrator.client`delete from public."user" where id = any(${userIds}::text[])`;
      }
    } finally {
      await migrator.close();
    }
  }

  return { app, bearer, close, deletionGrant, nonce, requestDeletion, request, seedActiveConversation, seedReaction, signup, waitForDeletionBlockedBy, writerUrl };
}
