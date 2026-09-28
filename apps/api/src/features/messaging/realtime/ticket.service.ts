export interface VerifiedRealtimeSession {
  userId: string;
  sessionId: string;
  expiresAt: Date;
}

export interface StoredRealtimeTicket {
  tokenHash: string;
  userId: string;
  sessionId: string;
  expiresAt: Date;
  sessionExpiresAt: Date;
}

export interface RealtimeTicketStore {
  insert(ticket: StoredRealtimeTicket): Promise<void>;
  /** Atomically marks a live, unused ticket consumed and returns its verified binding. */
  consume(tokenHash: string, now: Date): Promise<StoredRealtimeTicket | null>;
}

export interface RealtimeTicket {
  ticket: string;
  expiresAt: Date;
}

const encoder = new TextEncoder();

export function createRealtimeTicketService(input: {
  store: RealtimeTicketStore;
  now?: () => Date;
  randomBytes?: (size: number) => Uint8Array;
  ticketTtlMs?: number;
}) {
  const now = input.now ?? (() => new Date());
  const randomBytes = input.randomBytes ?? ((size) => crypto.getRandomValues(new Uint8Array(size)));
  const ticketTtlMs = input.ticketTtlMs ?? 60_000;

  return {
    async issue(session: VerifiedRealtimeSession): Promise<RealtimeTicket> {
      const issuedAt = now();
      const expiresAt = new Date(Math.min(issuedAt.getTime() + ticketTtlMs, session.expiresAt.getTime()));
      if (expiresAt.getTime() <= issuedAt.getTime()) throw new Error("The authenticated session has expired.");
      const ticket = toBase64Url(randomBytes(32));
      await input.store.insert({
        tokenHash: await hashTicket(ticket), userId: session.userId, sessionId: session.sessionId,
        expiresAt, sessionExpiresAt: session.expiresAt,
      });
      return { ticket, expiresAt };
    },
    async consume(ticket: string): Promise<StoredRealtimeTicket | null> {
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;
      return input.store.consume(await hashTicket(ticket), now());
    },
  };
}

export async function hashTicket(ticket: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(ticket));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
