export type PushPlatform = "ios" | "android";

export interface VerifiedPushSession {
  userId: string;
  sessionId: string;
}

export interface PushDeviceStore {
  register(input: {
    id: string;
    userId: string;
    sessionId: string;
    installationId: string;
    platform: PushPlatform;
    token: string;
    tokenHash: string;
    optedIn: boolean;
    now: Date;
  }): Promise<void>;
  unregister(userId: string, installationId: string): Promise<void>;
}

export function createPushDeviceService(input: { store: PushDeviceStore; now?: () => Date; createId?: () => string }) {
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? (() => crypto.randomUUID());
  return {
    async register(session: VerifiedPushSession, device: { installationId: string; platform: PushPlatform; token: string; optedIn: boolean }) {
      if (device.token.length < 16 || device.token.length > 8_192) throw new Error("Invalid push token.");
      await input.store.register({ ...device, id: createId(), userId: session.userId, sessionId: session.sessionId, tokenHash: await hashPushToken(device.token), now: now() });
    },
    unregister(session: VerifiedPushSession, installationId: string) {
      return input.store.unregister(session.userId, installationId);
    },
  };
}

async function hashPushToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
