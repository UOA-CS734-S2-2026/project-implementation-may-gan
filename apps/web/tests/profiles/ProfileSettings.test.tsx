import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeUsernameForm } from "@/features/profiles/change-username/ChangeUsernameForm";
import { profilesApi, type ProfileDetails } from "@/features/profiles/shared/profiles.api";
import { EditProfileForm } from "@/features/profiles/update-profile/EditProfileForm";
import { ProfileVisibilityToggle } from "@/app/(main)/settings/_components/ProfileVisibilityToggle";
import { AvatarForm } from "@/features/profiles/update-profile/AvatarForm";

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "me" }, session: { id: "me" }, isPending: false }) }));
vi.mock("@/features/profiles/shared/profiles.api", () => ({ profilesApi: { details: vi.fn(), update: vi.fn(), changeUsername: vi.fn(), uploadAvatar: vi.fn(), removeAvatar: vi.fn() } }));

const update = profilesApi.update as unknown as ReturnType<typeof vi.fn>;
const changeUsername = profilesApi.changeUsername as unknown as ReturnType<typeof vi.fn>;
const uploadAvatar = profilesApi.uploadAvatar as unknown as ReturnType<typeof vi.fn>;
const removeAvatar = profilesApi.removeAvatar as unknown as ReturnType<typeof vi.fn>;

function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function me(overrides: Partial<ProfileDetails> = {}): ProfileDetails {
  return {
    id: "me",
    username: "jos",
    displayName: "Jos",
    detailsVisible: true,
    bio: "Walks a lot.",
    // The generated type drops nullability; the API sends null when hidden.
    streak: null as unknown as ProfileDetails["streak"],
    stats: null as unknown as ProfileDetails["stats"],
    avatarUrl: null as unknown as string,
    owner: { profileVisibility: "public", usernameChangeAvailableAt: null as unknown as Date },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditProfileForm", () => {
  it("saves the trimmed public name and bio, sending blanks to clear them", async () => {
    const actor = userEvent.setup();
    update.mockResolvedValue({ ok: true, value: me({ displayName: "jos", bio: undefined }) });
    render(<EditProfileForm profile={me()} />);

    await actor.clear(screen.getByLabelText("Public name"));
    await actor.clear(screen.getByLabelText(/Bio/));
    await actor.type(screen.getByLabelText(/Bio/), "  Bakes too.  ");
    await actor.click(screen.getByRole("button", { name: "save profile" }));

    expect(update).toHaveBeenCalledWith({ publicName: "", bio: "Bakes too." });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("leaves the name blank when it is only the username", () => {
    render(<EditProfileForm profile={me({ displayName: "jos" })} />);

    expect((screen.getByLabelText("Public name") as HTMLInputElement).value).toBe("");
  });
});

describe("ChangeUsernameForm", () => {
  it("changes the username in lower case", async () => {
    const actor = userEvent.setup();
    changeUsername.mockResolvedValue({ ok: true, value: { username: "jos_walks", usernameChangeAvailableAt: new Date() } });
    render(<ChangeUsernameForm profile={me()} />);

    const input = screen.getByLabelText("Username");
    await actor.clear(input);
    await actor.type(input, "Jos_Walks");
    await actor.click(screen.getByRole("button", { name: "change username" }));

    expect(changeUsername).toHaveBeenCalledWith("jos_walks");
    expect(await screen.findByRole("status")).toHaveTextContent("Username changed.");
  });

  it("says when a taken username is rejected", async () => {
    const actor = userEvent.setup();
    changeUsername.mockResolvedValue({ ok: false, failure: { kind: "taken" } });
    render(<ChangeUsernameForm profile={me()} />);

    await actor.type(screen.getByLabelText("Username"), "x");
    await actor.click(screen.getByRole("button", { name: "change username" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That username is already taken.");
  });

  it("is locked until the next change is allowed", () => {
    render(<ChangeUsernameForm profile={me({ owner: { profileVisibility: "public", usernameChangeAvailableAt: new Date("2026-10-30T03:00:00Z") } })} />);

    expect(screen.getByLabelText("Username")).toBeDisabled();
    expect(screen.getByRole("button", { name: "change username" })).toBeDisabled();
    expect(screen.getByText("You can change your username again on 30 October 2026.")).toBeTruthy();
  });

  it("will not send an invalid handle", async () => {
    const actor = userEvent.setup();
    render(<ChangeUsernameForm profile={me()} />);

    await actor.clear(screen.getByLabelText("Username"));
    await actor.type(screen.getByLabelText("Username"), "no spaces");

    expect(screen.getByText("Use 3-30 lowercase letters, numbers, or underscores.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "change username" })).toBeDisabled();
  });
});

describe("ProfileVisibilityToggle", () => {
  it("saves the other visibility", async () => {
    const actor = userEvent.setup();
    update.mockResolvedValue({ ok: true, value: me({ owner: { profileVisibility: "private", usernameChangeAvailableAt: null as unknown as Date } }) });
    render(<ProfileVisibilityToggle visibility="public" />);

    await actor.click(screen.getByRole("switch", { name: "Private profile" }));

    expect(update).toHaveBeenCalledWith({ profileVisibility: "private" });
  });
});

describe("AvatarForm", () => {
  it("uploads a chosen photo", async () => {
    const actor = userEvent.setup();
    uploadAvatar.mockResolvedValue({ ok: true, value: me({ avatarUrl: "https://r2.example.test/photo" }) });
    render(<AvatarForm profile={me()} />);

    const photo = new File(["jpeg"], "me.jpg", { type: "image/jpeg" });
    await actor.upload(screen.getByLabelText("Choose a profile photo"), photo);

    expect(uploadAvatar).toHaveBeenCalledWith(photo);
  });

  it("refuses a photo the server would reject, without uploading", async () => {
    render(<AvatarForm profile={me()} />);

    const input = screen.getByLabelText("Choose a profile photo");
    const heic = new File(["heic"], "me.heic", { type: "image/heic" });
    // userEvent honours `accept`, so fire the change directly as a file picker could.
    Object.defineProperty(input, "files", { value: [heic] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Try a JPEG, PNG, or WebP image under 10 MB.");
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("shows the photo and removes it", async () => {
    const actor = userEvent.setup();
    removeAvatar.mockResolvedValue({ ok: true, value: me() });
    render(<AvatarForm profile={me({ avatarUrl: "https://r2.example.test/photo" })} />);

    expect(screen.getByAltText("Jos's profile photo").getAttribute("src")).toBe("https://r2.example.test/photo");
    await actor.click(screen.getByRole("button", { name: "remove" }));

    expect(removeAvatar).toHaveBeenCalled();
  });
});
