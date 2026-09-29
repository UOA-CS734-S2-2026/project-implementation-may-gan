import type { PushPlatform, VerifiedPushSession } from "../shared/push-device-types";

/** The request was authenticated before encryption, but its session changed before the DB write. */
export class PushSessionInactiveError extends Error {
  constructor() { super("Push registration session is no longer active."); }
}

export interface RegisterPushDeviceStore {
  register(input: {
    id: string;
    userId: string;
    sessionId: string;
    installationId: string;
    platform: PushPlatform;
    tokenCiphertext: string;
    tokenKeyVersion: string;
    tokenHash: string;
    optedIn: boolean;
    now: Date;
  }): Promise<void>;
}

export interface RegisterDeviceService {
  register(
    session: VerifiedPushSession,
    device: { installationId: string; platform: PushPlatform; token: string; optedIn: boolean },
  ): Promise<void>;
}

export function createRegisterDeviceService(input: {
  store: RegisterPushDeviceStore;
  protector: { encrypt(token: string): Promise<{ ciphertext: string; keyVersion: string }> };
  now?: () => Date;
  createId?: () => string;
}): RegisterDeviceService {
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? (() => crypto.randomUUID());
  return {
    async register(session, device) {
      if (device.token.length < 16 || device.token.length > 8_192) throw new Error("Invalid push token.");
      const encrypted = await input.protector.encrypt(device.token);
      await input.store.register({
        id: createId(),
        userId: session.userId,
        sessionId: session.sessionId,
        installationId: device.installationId,
        platform: device.platform,
        tokenCiphertext: encrypted.ciphertext,
        tokenKeyVersion: encrypted.keyVersion,
        tokenHash: await hashPushToken(device.token),
        optedIn: device.optedIn,
        now: now(),
      });
    },
  };
}

async function hashPushToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
