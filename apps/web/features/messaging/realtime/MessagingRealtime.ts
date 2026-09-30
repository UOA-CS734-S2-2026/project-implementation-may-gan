import type { RealtimeTicket } from "@/features/messaging/shared/messaging.api";

export interface ConversationChangedEvent {
  version: 1;
  eventId: string;
  type: "conversation.changed";
  conversationId: string;
  changeSequence: string;
}

type ReadyEvent = { version: 1; type: "ready"; expiresAt: string };
type Event = ReadyEvent | ConversationChangedEvent;

export interface RealtimeSocket {
  close(): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onclose: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

/** One session-scoped browser socket. It has no REST polling fallback. */
export class MessagingRealtime {
  private socket: RealtimeSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private attempt = 0;
  private ready = false;
  private buffered: ConversationChangedEvent[] = [];
  private seen = new Set<string>();
  private processing = new Set<string>();

  constructor(private readonly input: {
    issueTicket(): Promise<{ ok: true; value: RealtimeTicket } | { ok: false }>;
    onReady(): Promise<void>;
    onChange(event: ConversationChangedEvent): Promise<void>;
    createSocket?(url: string): RealtimeSocket;
    random?(): number;
  }) {}

  async start(): Promise<void> { this.stopped = false; await this.connect(); }
  async resume(): Promise<void> { if (!this.stopped && !this.socket) await this.connect(); }
  stop(): void {
    this.stopped = true; this.ready = false; this.buffered = []; this.seen.clear(); this.processing.clear();
    if (this.retry) clearTimeout(this.retry); this.retry = null;
    this.socket?.close(); this.socket = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.socket) return;
    const result = await this.input.issueTicket();
    if (this.stopped) return;
    if (!result.ok) return this.scheduleReconnect();
    const url = new URL(result.value.webSocketUrl);
    url.searchParams.set("ticket", result.value.ticket);
    const createSocket = this.input.createSocket ?? ((value: string) => new WebSocket(value) as unknown as RealtimeSocket);
    const socket = createSocket(url.toString());
    this.socket = socket;
    socket.onmessage = (frame: MessageEvent<string>) => this.receive(frame.data);
    socket.onclose = () => this.disconnected(socket);
    socket.onerror = () => this.disconnected(socket);
  }

  private receive(frame: string): void {
    let event: Event;
    try { event = JSON.parse(frame) as Event; } catch { return this.disconnected(this.socket); }
    if (event.version !== 1) return this.disconnected(this.socket);
    if (event.type === "ready") {
      this.ready = true; this.attempt = 0;
      void this.drain();
    } else if (event.type === "conversation.changed" && typeof event.eventId === "string" && typeof event.conversationId === "string" && /^\d+$/.test(event.changeSequence)) {
      if (this.ready) void this.handle(event).catch(() => this.disconnected(this.socket)); else this.buffered.push(event);
    } else this.disconnected(this.socket);
  }

  private async drain(): Promise<void> {
    try {
      await this.input.onReady();
      const buffered = this.buffered; this.buffered = [];
      for (const event of buffered) await this.handle(event);
    } catch {
      this.disconnected(this.socket);
    }
  }
  private async handle(event: ConversationChangedEvent): Promise<void> {
    if (this.seen.has(event.eventId) || this.processing.has(event.eventId)) return;
    this.processing.add(event.eventId);
    try {
      await this.input.onChange(event);
      this.seen.add(event.eventId);
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value as string);
    } finally {
      this.processing.delete(event.eventId);
    }
  }
  private disconnected(socket: RealtimeSocket | null): void {
    if (socket && this.socket !== socket) return;
    this.socket = null; this.ready = false;
    if (!this.stopped) this.scheduleReconnect();
  }
  private scheduleReconnect(): void {
    if (this.stopped || this.retry) return;
    const seconds = Math.min(30, 2 ** Math.min(this.attempt++, 5));
    const random = this.input.random?.() ?? Math.random();
    this.retry = setTimeout(() => { this.retry = null; void this.connect(); }, Math.round(seconds * 1_000 * (0.75 + random * 0.5)));
  }
}
