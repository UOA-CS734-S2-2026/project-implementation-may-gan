import { createHyperdriveDatabase, sql, type HyperdriveBinding } from "@dayli/db";
import { realtimeEventSchema, type ConversationChangedEvent } from "@dayli/contracts";

interface SocketAttachment {
  userId: string;
  sessionId: string;
  expiresAt: string;
  version: 1;
}

interface UserRealtimeEnv {
  HYPERDRIVE: HyperdriveBinding;
}

const maxSocketsPerUser = 5;
const maxInboundBytes = 4 * 1024;

/** One hibernating object per user. Attachments contain only verified session metadata. */
export class UserRealtime {
  constructor(private readonly ctx: DurableObjectState, private readonly env: UserRealtimeEnv) {}

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/connect" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Not found.", { status: 404 });
    const attachment = parseAttachment(request.headers.get("x-dayli-realtime-session"));
    if (!attachment) return new Response("Unauthorized.", { status: 401 });
    if (this.ctx.getWebSockets().length >= maxSocketsPerUser) return new Response("Too many connections.", { status: 429 });
    if (!(await this.sessionIsActive(attachment))) return new Response("Unauthorized.", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    server.send(JSON.stringify({ version: 1, type: "ready", expiresAt: attachment.expiresAt }));
    await this.scheduleNextExpiry();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Private RPC via the Worker binding, never an HTTP endpoint controlled by a client. */
  async publish(event: ConversationChangedEvent): Promise<void> {
    const safeEvent = realtimeEventSchema.safeParse(event);
    if (!safeEvent.success || safeEvent.data.type !== "conversation.changed") return;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || !(await this.sessionIsActive(attachment))) {
        socket.close(4401, "Session expired or revoked.");
        continue;
      }
      socket.send(JSON.stringify(safeEvent.data));
    }
    await this.scheduleNextExpiry();
  }

  async revokeSession(sessionId: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.sessionId === sessionId) socket.close(4401, "Session revoked.");
    }
    await this.scheduleNextExpiry();
  }

  async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const bytes = typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
    // This protocol has no application data frames. Closing prevents the DO from becoming a message relay.
    if (bytes > maxInboundBytes || bytes >= 0) socket.close(1008, "Client data frames are not supported.");
  }

  async webSocketClose(): Promise<void> { await this.scheduleNextExpiry(); }
  async webSocketError(): Promise<void> { await this.scheduleNextExpiry(); }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || new Date(attachment.expiresAt).getTime() <= now || !(await this.sessionIsActive(attachment))) socket.close(4401, "Session expired or revoked.");
    }
    await this.scheduleNextExpiry();
  }

  private async sessionIsActive(attachment: SocketAttachment): Promise<boolean> {
    if (new Date(attachment.expiresAt).getTime() <= Date.now()) return false;
    const database = createHyperdriveDatabase(this.env.HYPERDRIVE);
    try {
      const result = await database.db.execute(sql`
        select 1 from public.session
        where id = ${attachment.sessionId} and user_id = ${attachment.userId}
          and expires_at > now()
        limit 1
      `);
      return [...result].length === 1;
    } finally { await database.close(); }
  }

  private async scheduleNextExpiry(): Promise<void> {
    const deadlines = this.ctx.getWebSockets().map((socket) => {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      return attachment ? new Date(attachment.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    }).filter(Number.isFinite);
    if (deadlines.length === 0) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }
}

function parseAttachment(value: string | null): SocketAttachment | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SocketAttachment>;
    if (typeof parsed.userId !== "string" || typeof parsed.sessionId !== "string" || typeof parsed.expiresAt !== "string" || parsed.version !== 1 || Number.isNaN(new Date(parsed.expiresAt).getTime())) return null;
    return { userId: parsed.userId, sessionId: parsed.sessionId, expiresAt: parsed.expiresAt, version: 1 };
  } catch { return null; }
}
