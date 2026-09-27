import { schema, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, isNull } from "drizzle-orm";

const { socialLinkConfirmation } = schema;
const confirmationLifetimeMs = 5 * 60 * 1000;

export interface CurrentSocialLinkSession {
  userId: string;
  sessionId: string;
}

export type SocialLinkConfirmationResult = "absent" | "rejected" | "accepted";

/** Durable authorization issued only after Better Auth verifies the password. */
export interface SocialLinkConfirmationStore {
  issue(state: string, session: CurrentSocialLinkSession): Promise<boolean>;
  consume(state: string, session: CurrentSocialLinkSession | undefined): Promise<SocialLinkConfirmationResult>;
}

async function stateDigest(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPostgresSocialLinkConfirmationStore(database: DayliDatabase): SocialLinkConfirmationStore {
  return {
    async issue(state, session) {
      const [created] = await database.insert(socialLinkConfirmation).values({
        stateDigest: await stateDigest(state),
        userId: session.userId,
        sessionId: session.sessionId,
        expiresAt: new Date(Date.now() + confirmationLifetimeMs),
      }).onConflictDoNothing().returning({ stateDigest: socialLinkConfirmation.stateDigest });
      return Boolean(created);
    },
    async consume(state, session) {
      const digest = await stateDigest(state);
      const [existing] = await database.select({ stateDigest: socialLinkConfirmation.stateDigest })
        .from(socialLinkConfirmation)
        .where(eq(socialLinkConfirmation.stateDigest, digest));
      if (!existing) return "absent";
      if (!session) return "rejected";

      const [consumed] = await database.update(socialLinkConfirmation)
        .set({ consumedAt: new Date() })
        .where(and(
          eq(socialLinkConfirmation.stateDigest, digest),
          eq(socialLinkConfirmation.userId, session.userId),
          eq(socialLinkConfirmation.sessionId, session.sessionId),
          gt(socialLinkConfirmation.expiresAt, new Date()),
          isNull(socialLinkConfirmation.consumedAt),
        ))
        .returning({ stateDigest: socialLinkConfirmation.stateDigest });
      return consumed ? "accepted" : "rejected";
    },
  };
}

/** Test-only store with the same expiry and one-time semantics as PostgreSQL. */
export function createMemorySocialLinkConfirmationStore(): SocialLinkConfirmationStore {
  const confirmations = new Map<string, CurrentSocialLinkSession & { expiresAt: number; consumed: boolean }>();
  return {
    async issue(state, session) {
      const digest = await stateDigest(state);
      if (confirmations.has(digest)) return false;
      confirmations.set(digest, { ...session, expiresAt: Date.now() + confirmationLifetimeMs, consumed: false });
      return true;
    },
    async consume(state, session) {
      const confirmation = confirmations.get(await stateDigest(state));
      if (!confirmation) return "absent";
      if (!session || confirmation.consumed || confirmation.expiresAt <= Date.now()
        || confirmation.userId !== session.userId || confirmation.sessionId !== session.sessionId
      ) return "rejected";
      confirmation.consumed = true;
      return "accepted";
    },
  };
}
