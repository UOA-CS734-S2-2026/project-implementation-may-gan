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
