import { describe, expect, it } from "vitest";
import { addDays, addYears, deliveryWindow, isDeliverOnAllowed, isNoteReadable } from "./future-self-note.policy";

describe("future-self note date policy", () => {
  it("adds days across month, year, and leap-day boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("adds years, moving a missing 29 February to 28 February", () => {
    expect(addYears("2026-10-03", 10)).toBe("2036-10-03");
    expect(addYears("2028-02-29", 10)).toBe("2038-02-28");
    expect(addYears("2028-02-29", 8)).toBe("2036-02-29");
  });

  it("allows tomorrow up to ten years out, and nothing else", () => {
    const today = "2026-10-03";
    expect(deliveryWindow(today)).toEqual({ earliest: "2026-10-04", latest: "2036-10-03" });
    expect(isDeliverOnAllowed("2026-10-02", today)).toBe(false);
    expect(isDeliverOnAllowed("2026-10-03", today)).toBe(false);
    expect(isDeliverOnAllowed("2026-10-04", today)).toBe(true);
    expect(isDeliverOnAllowed("2036-10-03", today)).toBe(true);
    expect(isDeliverOnAllowed("2036-10-04", today)).toBe(false);
  });

  it("makes a note readable from its date, or once delivered", () => {
    expect(isNoteReadable({ deliverOn: "2026-10-04", status: "scheduled" }, "2026-10-03")).toBe(false);
    expect(isNoteReadable({ deliverOn: "2026-10-04", status: "scheduled" }, "2026-10-04")).toBe(true);
    expect(isNoteReadable({ deliverOn: "2026-10-04", status: "scheduled" }, "2026-10-05")).toBe(true);
    expect(isNoteReadable({ deliverOn: "2030-01-01", status: "delivered" }, "2026-10-03")).toBe(true);
  });
});
