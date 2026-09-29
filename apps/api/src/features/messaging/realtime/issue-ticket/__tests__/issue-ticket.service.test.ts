import { describe, expect, it } from "vitest";
import { createRealtimeTicketService, hashTicket, type RealtimeTicketStore } from "../issue-ticket.service";

function store(): RealtimeTicketStore & { values: Map<string, { userId: string; sessionId: string; expiresAt: Date; sessionExpiresAt: Date }> } {
  const values = new Map<string, { userId: string; sessionId: string; expiresAt: Date; sessionExpiresAt: Date }>();
  return {
    values,
    async insert(ticket) { values.set(ticket.tokenHash, ticket); },
    async consume(tokenHash, now) { const ticket = values.get(tokenHash); if (!ticket || ticket.expiresAt <= now || ticket.sessionExpiresAt <= now) return null; values.delete(tokenHash); return { tokenHash, ...ticket }; },
  };
}

describe("realtime tickets", () => {
  it("stores only a hash, binds issuance to the session, and consumes once", async () => {
    const tickets = store();
    const service = createRealtimeTicketService({ store: tickets, now: () => new Date("2026-09-28T00:00:00.000Z"), randomBytes: (size) => new Uint8Array(size).fill(7) });
    const issued = await service.issue({ userId: "user", sessionId: "session", expiresAt: new Date("2026-09-28T00:02:00.000Z") });
    expect(issued.ticket).toHaveLength(43);
    expect(tickets.values.has(issued.ticket)).toBe(false);
    expect(await hashTicket(issued.ticket)).not.toBe(issued.ticket);
    await expect(service.consume(issued.ticket)).resolves.toMatchObject({ userId: "user", sessionId: "session" });
    await expect(service.consume(issued.ticket)).resolves.toBeNull();
  });

  it("caps a ticket at the remaining session lifetime", async () => {
    const service = createRealtimeTicketService({ store: store(), now: () => new Date("2026-09-28T00:00:00.000Z"), randomBytes: (size) => new Uint8Array(size), ticketTtlMs: 60_000 });
    const ticket = await service.issue({ userId: "user", sessionId: "session", expiresAt: new Date("2026-09-28T00:00:10.000Z") });
    expect(ticket.expiresAt.toISOString()).toBe("2026-09-28T00:00:10.000Z");
  });
});
