import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostForm from "@/app/(main)/post/_components/PostForm";
import type { ApiResult, DailyPost } from "@/lib/api/daily-posts";

const { submit, push, replace } = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/lib/api/daily-posts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/daily-posts")>()),
  createDailyPostSubmitter: () => submit,
}));
// Keep file selection and form state real, bypass only the canvas crop UI.
vi.mock("@/components/ui/ImageCropper", () => ({
  ImageCropper: ({ file, onConfirm }: { file: File; onConfirm: (file: File) => void }) =>
    <button type="button" onClick={() => onConfirm(file)}>Crop &amp; save</button>,
}));

const postingDay = {
  localDate: "2026-10-14", serverNow: new Date(), deadlineAt: new Date(), releaseAt: new Date(),
  prompt: { id: "prompt-1", text: "What made you smile today?" }, hasPosted: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <PostForm postingDay={postingDay} onPostingDayChanged={vi.fn()} />
  </QueryClientProvider>);
}

async function fillRequiredFields() {
  const actor = userEvent.setup();
  await actor.type(screen.getByLabelText(postingDay.prompt.text), "Seeing friends.");
  fireEvent.change(screen.getByLabelText("Day rating"), { target: { value: "7" } });
  await actor.click(screen.getByRole("radio", { name: /Friends/ }));
  return actor;
}

async function selectPhoto(actor: ReturnType<typeof userEvent.setup>) {
  const file = new File(["photo"], "photo.png", { type: "image/png" });
  await actor.upload(document.querySelector<HTMLInputElement>("#media-0")!, file);
  await actor.click(screen.getByRole("button", { name: "Crop & save" }));
  return file;
}

describe("PostForm photo posting", () => {
  it("passes the selected photo to the submitter and locks the form while posting", async () => {
    let finish!: (result: ApiResult<DailyPost>) => void;
    submit.mockReturnValue(new Promise<ApiResult<DailyPost>>((resolve) => { finish = resolve; }));
    mount();
    const actor = await fillRequiredFields();
    const file = await selectPhoto(actor);
    await actor.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      localDate: postingDay.localDate, promptId: postingDay.prompt.id,
      reflectiveAnswer: "Seeing friends.", rating: 7, audience: "friends",
    }, [file], expect.any(String)));
    expect(screen.getByLabelText(postingDay.prompt.text)).toBeDisabled();
    expect(document.querySelector("[inert]")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    finish({ ok: true, value: {} as DailyPost });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("keeps photos and the submission key after failure, and navigates only on success", async () => {
    submit.mockResolvedValueOnce({ ok: false, failure: { kind: "network" } })
      .mockResolvedValueOnce({ ok: true, value: {} });
    mount();
    const actor = await fillRequiredFields();
    const file = await selectPhoto(actor);
    await actor.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText(/You seem to be offline/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(postingDay.prompt.text)).not.toBeDisabled();
    await actor.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(submit.mock.calls[0]![1]).toEqual([file]);
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]);
  });
});
