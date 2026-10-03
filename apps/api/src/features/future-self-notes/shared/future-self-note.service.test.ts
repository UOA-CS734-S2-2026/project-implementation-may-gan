import { createAucklandDayService } from "@dayli/domain";
import { describe, expect, it } from "vitest";
import { createMemoryFutureSelfNoteStore } from "./future-self-note.memory-store";
import { createFutureSelfNoteService, FutureSelfNoteError, type FutureSelfNoteErrorReason } from "./future-self-note.service";

// Auckland is UTC+13 in October 2026, so this instant is 00:30 on 11 October in Auckland
// while the UTC calendar date is still 10 October.
const boundaryNow = new Date("2026-10-10T11:30:00.000Z");

function setup(start = boundaryNow, options: Parameters<typeof createMemoryFutureSelfNoteStore>[0] = {}) {
  const clock = { current: start, now() { return this.current; } };
  const memory = createMemoryFutureSelfNoteStore(options);
  let ids = 0;
  const service = createFutureSelfNoteService({
    store: memory.store,
    clock,
    dayService: createAucklandDayService(clock),
    generateId: () => `note-${++ids}`,
  });
  return { service, memory, clock };
}

async function reason(promise: Promise<unknown>): Promise<FutureSelfNoteErrorReason | "no error"> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    if (error instanceof FutureSelfNoteError) return error.reason;
    throw error;
  }
}

describe("future-self note service", () => {
  describe("create", () => {
    it("uses the Auckland date, not the UTC date, for the earliest delivery", async () => {
      const { service } = setup();
      // 11 October is today in Auckland; 12 October is the first allowed day.
      expect(await reason(service.create("u1", "key-1", { body: "Hi", deliverOn: "2026-10-11" }))).toBe("DELIVER_ON_OUT_OF_RANGE");
      const created = await service.create("u1", "key-2", { body: "Hi", deliverOn: "2026-10-12" });
      expect(created.note).toMatchObject({ id: "note-1", deliverOn: "2026-10-12", status: "scheduled", deliveredAt: null });
    });

    it.each([
      ["a past date", "2026-10-01"],
      ["today", "2026-10-11"],
      ["more than ten years ahead", "2036-10-12"],
    ])("rejects %s", async (_name, deliverOn) => {
      const { service, memory } = setup();
      expect(await reason(service.create("u1", "k", { body: "Hi", deliverOn }))).toBe("DELIVER_ON_OUT_OF_RANGE");
      expect(memory.notes.size).toBe(0);
    });

    it("accepts exactly ten years ahead", async () => {
      const { service } = setup();
      const created = await service.create("u1", "k", { body: "Hi", deliverOn: "2036-10-11" });
      expect(created.note.deliverOn).toBe("2036-10-11");
    });

    it("never returns the text", async () => {
      const { service } = setup();
      const { note } = await service.create("u1", "k", { body: "private words", deliverOn: "2026-10-12" });
      expect(JSON.stringify(note)).not.toContain("private words");
      expect(Object.keys(note).sort()).toEqual(["createdAt", "deliverOn", "deliveredAt", "id", "status", "updatedAt"]);
    });

    it("replays an identical retry, even after the window has moved on", async () => {
      const { service, memory, clock } = setup();
      const first = await service.create("u1", "key", { body: "Hi", deliverOn: "2026-10-12" });
      clock.current = new Date("2026-10-12T05:00:00.000Z");
      const replay = await service.create("u1", "key", { body: "Hi", deliverOn: "2026-10-12" });
      expect(replay.replayed).toBe(true);
      expect(replay.note.id).toBe(first.note.id);
      expect(memory.notes.size).toBe(1);
    });

    it("conflicts when a key is reused with a different request", async () => {
      const { service } = setup();
      await service.create("u1", "key", { body: "Hi", deliverOn: "2026-10-12" });
      expect(await reason(service.create("u1", "key", { body: "Changed", deliverOn: "2026-10-12" }))).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(await reason(service.create("u1", "key", { body: "Hi", deliverOn: "2026-10-13" }))).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("scopes idempotency keys to the owner", async () => {
      const { service, memory } = setup();
      await service.create("u1", "key", { body: "Hi", deliverOn: "2026-10-12" });
      const other = await service.create("u2", "key", { body: "Different", deliverOn: "2026-10-13" });
      expect(other.replayed).toBe(false);
      expect(memory.notes.size).toBe(2);
    });

    it("refuses a restricted account", async () => {
      const { service } = setup(boundaryNow, { restrictedOwners: new Set(["u1"]) });
      expect(await reason(service.create("u1", "k", { body: "Hi", deliverOn: "2026-10-12" }))).toBe("ACCOUNT_RESTRICTED");
    });
  });

  describe("read", () => {
    async function scheduledFor(deliverOn: string, start = new Date("2026-10-03T01:00:00.000Z")) {
      const context = setup(start);
      const { note } = await context.service.create("u1", "k", { body: "Dear me", deliverOn });
      return { ...context, id: note.id };
    }

    it("hides the text before the date and shows it from the date, across the UTC boundary", async () => {
      // Auckland midnight at the start of 11 October 2026 is 11:00 UTC on 10 October.
      const { service, clock, id } = await scheduledFor("2026-10-11");
      clock.current = new Date("2026-10-10T10:59:59.000Z");
      expect(await reason(service.get("u1", id))).toBe("NOTE_NOT_YET_AVAILABLE");
      clock.current = new Date("2026-10-10T11:00:00.000Z");
      expect(await service.get("u1", id)).toMatchObject({ id, body: "Dear me", status: "scheduled" });
    });

    it("answers 404 for another user's note and for an unknown note", async () => {
      const { service, id } = await scheduledFor("2026-10-11");
      expect(await reason(service.get("someone-else", id))).toBe("NOTE_NOT_FOUND");
      expect(await reason(service.get("u1", "missing"))).toBe("NOTE_NOT_FOUND");
    });

    it("keeps a delivered note readable", async () => {
      const { service, memory, id } = await scheduledFor("2026-10-11");
      memory.deliver(id, new Date());
      expect((await service.get("u1", id)).body).toBe("Dear me");
    });

    it("refuses a restricted account", async () => {
      const { service, memory, id } = await scheduledFor("2026-10-11");
      memory.restrictedOwners.add("u1");
      expect(await reason(service.get("u1", id))).toBe("ACCOUNT_RESTRICTED");
    });
  });

  describe("list", () => {
    it("pages the owner's notes by date without any text", async () => {
      const { service } = setup(new Date("2026-10-03T01:00:00.000Z"));
      for (const [index, day] of ["2026-12-01", "2026-11-01", "2027-01-01"].entries()) {
        await service.create("u1", `key-${index}`, { body: `secret ${index}`, deliverOn: day });
      }
      await service.create("u2", "other", { body: "not yours", deliverOn: "2026-10-20" });

      const first = await service.list("u1", { limit: 2 });
      expect(first.items.map((note) => note.deliverOn)).toEqual(["2026-11-01", "2026-12-01"]);
      expect(first.hasMore).toBe(true);
      const second = await service.list("u1", { limit: 2, cursor: first.nextCursor! });
      expect(second.items.map((note) => note.deliverOn)).toEqual(["2027-01-01"]);
      expect(second).toMatchObject({ hasMore: false, nextCursor: null });
      expect(JSON.stringify([first, second])).not.toContain("secret");
    });

    it("rejects a forged cursor", async () => {
      const { service } = setup();
      expect(await reason(service.list("u1", { limit: 5, cursor: "not-a-cursor" }))).toBe("INVALID_CURSOR");
    });
  });

  describe("update and delete", () => {
    async function scheduled() {
      const context = setup(new Date("2026-10-03T01:00:00.000Z"));
      const { note } = await context.service.create("u1", "k", { body: "Dear me", deliverOn: "2026-11-01" });
      return { ...context, id: note.id };
    }

    it("edits the text and reschedules, bumping the schedule version only for a new date", async () => {
      const { service, memory, id } = await scheduled();
      await service.update("u1", id, { body: "New text" });
      expect(memory.notes.get(id)).toMatchObject({ body: "New text", deliverOn: "2026-11-01", scheduleVersion: 1 });
      const moved = await service.update("u1", id, { deliverOn: "2026-12-25" });
      expect(moved.deliverOn).toBe("2026-12-25");
      expect(memory.notes.get(id)?.scheduleVersion).toBe(2);
      await service.update("u1", id, { deliverOn: "2026-12-25", body: "New text" });
      expect(memory.notes.get(id)?.scheduleVersion).toBe(2);
    });

    it("applies the create date rules to a new date but not to an unchanged one", async () => {
      const { service, memory, clock, id } = await scheduled();
      expect(await reason(service.update("u1", id, { deliverOn: "2026-10-03" }))).toBe("DELIVER_ON_OUT_OF_RANGE");
      expect(await reason(service.update("u1", id, { deliverOn: "2036-10-04" }))).toBe("DELIVER_ON_OUT_OF_RANGE");
      // Due but not yet delivered: the same date can be sent again with a body edit.
      clock.current = new Date("2026-11-02T01:00:00.000Z");
      await service.update("u1", id, { deliverOn: "2026-11-01", body: "Late edit" });
      expect(memory.notes.get(id)?.body).toBe("Late edit");
    });

    it("rejects editing after delivery but still deletes", async () => {
      const { service, memory, id } = await scheduled();
      memory.deliver(id, new Date());
      expect(await reason(service.update("u1", id, { body: "Too late" }))).toBe("NOTE_ALREADY_DELIVERED");
      expect(await reason(service.update("u1", id, { deliverOn: "2026-12-25" }))).toBe("NOTE_ALREADY_DELIVERED");
      await service.remove("u1", id);
      expect(memory.notes.has(id)).toBe(false);
    });

    it("answers 404 for another user's note", async () => {
      const { service, memory, id } = await scheduled();
      expect(await reason(service.update("u2", id, { body: "mine now" }))).toBe("NOTE_NOT_FOUND");
      expect(await reason(service.remove("u2", id))).toBe("NOTE_NOT_FOUND");
      expect(memory.notes.get(id)?.body).toBe("Dear me");
    });
  });
});
