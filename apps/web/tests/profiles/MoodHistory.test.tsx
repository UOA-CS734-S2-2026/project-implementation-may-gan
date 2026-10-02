import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoodHistory } from "@/features/profiles/get-mood-history/MoodHistory";
import { profilesApi, type MoodHistory as MoodHistoryData } from "@/features/profiles/shared/profiles.api";

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "me" }, session: { id: "me" }, isPending: false }) }));
vi.mock("@/features/profiles/shared/profiles.api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/profiles/shared/profiles.api")>(),
  profilesApi: { moodHistory: vi.fn() },
}));

const moodHistory = profilesApi.moodHistory as unknown as ReturnType<typeof vi.fn>;

function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function summary(overrides: Partial<MoodHistoryData["current"]> = {}): MoodHistoryData["current"] {
  return { from: "2026-09-01", to: "2026-09-30", trackedDays: 30, postedDays: 0, missingDays: 29, average: null, lowest: null, highest: null, ...overrides };
}

function history(overrides: Partial<MoodHistoryData> = {}): MoodHistoryData {
  return {
    range: "30d",
    trackedFrom: "2026-01-01",
    hiddenDays: [],
    days: [
      { localDate: "2026-09-27", rating: 6 },
      { localDate: "2026-09-28", rating: 8 },
      { localDate: "2026-09-30", rating: 7 },
    ],
    current: summary({ postedDays: 3, missingDays: 27, average: 7, lowest: 6, highest: 8 }),
    previous: summary({ from: "2026-08-02", to: "2026-08-31", postedDays: 18, missingDays: 12, average: 6.6 }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MoodHistory", () => {
  it("shows the chart alone, without a summary strip", async () => {
    moodHistory.mockResolvedValue({ ok: true, value: history() });
    render(<MoodHistory username="jos" displayName="Jos" isMe />);

    expect(await screen.findByRole("img")).toBeTruthy();
    expect(screen.queryByText("Average rating")).toBeNull();
    expect(screen.queryByText("Days without a post")).toBeNull();
    expect(moodHistory).toHaveBeenCalledWith("jos", "30d");
  });

  it("breaks the line across a day without a post", async () => {
    moodHistory.mockResolvedValue({ ok: true, value: history() });
    const { container } = render(<MoodHistory username="jos" displayName="Jos" isMe />);
    await screen.findByRole("img");

    // 27th–28th are joined; the 30th stands alone after the missing 29th.
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(container.querySelectorAll("[data-mood-dot]")).toHaveLength(3);
    // Every tracked day before today without a post gets an empty baseline marker.
    expect(container.querySelectorAll("[data-mood-missing]")).toHaveLength(27);
  });

  it("reads each day from the keyboard", async () => {
    const actor = userEvent.setup();
    moodHistory.mockResolvedValue({ ok: true, value: history() });
    render(<MoodHistory username="jos" displayName="Jos" isMe />);
    await screen.findByRole("img");

    screen.getByRole("img").focus();
    await actor.keyboard("{ArrowLeft}");
    expect(screen.getByRole("status")).toHaveTextContent(/^30 Sept? 2026: Rating of 7$/);

    expect(screen.queryByRole("table")).toBeNull();
  });

  it("switches range", async () => {
    const actor = userEvent.setup();
    moodHistory.mockResolvedValue({ ok: true, value: history() });
    render(<MoodHistory username="jos" displayName="Jos" isMe />);
    await screen.findByRole("img");

    moodHistory.mockResolvedValue({ ok: true, value: history({ range: "1y" }) });
    await actor.click(screen.getByRole("radio", { name: "Year" }));

    expect(moodHistory).toHaveBeenLastCalledWith("jos", "1y");
    expect(screen.getByRole("radio", { name: "Year" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "30 days" }).getAttribute("aria-checked")).toBe("false");
  });

  it("shows a friend's history without marking their hidden posts as missing", async () => {
    moodHistory.mockResolvedValue({
      ok: true,
      value: history({ hiddenDays: ["2026-09-10", "2026-09-29"], current: summary({ postedDays: 3, missingDays: 25, average: 7 }) }),
    });
    const { container } = render(<MoodHistory username="ada" displayName="Ada" isMe={false} />);

    expect(await screen.findByRole("img")).toBeTruthy();
    expect(screen.getByText(/Only Ada's friends can see this\./)).toBeTruthy();
    expect(moodHistory).toHaveBeenCalledWith("ada", "30d");
    expect(container.querySelectorAll("[data-mood-missing]")).toHaveLength(25);
  });

  it("does not count days before joining", async () => {
    moodHistory.mockResolvedValue({
      ok: true,
      value: history({
        trackedFrom: "2026-09-21",
        days: [{ localDate: "2026-09-21", rating: 5 }],
        current: summary({ trackedDays: 10, postedDays: 1, missingDays: 8, average: 5, lowest: 5, highest: 5 }),
        previous: summary({ from: "2026-08-02", to: "2026-08-31", trackedDays: 0, missingDays: 0 }),
      }),
    });
    render(<MoodHistory username="jos" displayName="Jos" isMe />);

    expect(await screen.findByText(/You joined on/)).toBeTruthy();
  });

  it("says when nothing has been posted or the read fails", async () => {
    moodHistory.mockResolvedValueOnce({ ok: true, value: history({ days: [], current: summary(), previous: summary() }) });
    const { unmount } = render(<MoodHistory username="jos" displayName="Jos" isMe />);
    expect(await screen.findByText("Post a dayli and your rating will show up here.")).toBeTruthy();
    unmount();

    moodHistory.mockResolvedValueOnce({ ok: false, failure: { kind: "unavailable" } });
    render(<MoodHistory username="jos" displayName="Jos" isMe />);
    expect(await screen.findByText(/couldn't be loaded/)).toBeTruthy();
  });
});
