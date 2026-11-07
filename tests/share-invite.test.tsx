import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SharePage from "@/app/share/page";
import { ShareInvite } from "@/components/share-invite";
import { useRoomClient } from "@/lib/room-client";
import type { RoomSnapshot } from "@/lib/room-types";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/room-client", () => ({ useRoomClient: vi.fn() }));
const mockedClient = vi.mocked(useRoomClient);
const invitation = "DU4M9S";
function room(code = invitation, overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { id: `room-${code}`, code, expiresAt: "2030-01-02T00:00:00Z", you: "B", players: [{ name: "Host", slot: "A", ready: false, connected: true }, { name: "Saved guest", slot: "B", ready: false, connected: true }], bothReady: false, themeId: "courtroom", ...overrides };
}
function client(current: RoomSnapshot | null = null, overrides = {}) {
  return { room: current, loading: false, pending: false, offline: false, live: false, error: "", refresh: vi.fn().mockResolvedValue(true), join: vi.fn().mockResolvedValue(true), leaveRoom: vi.fn().mockResolvedValue(true), create: vi.fn(), ...overrides } as unknown as ReturnType<typeof useRoomClient>;
}
function show() { return render(<ShareInvite code={invitation} issue={null}/>); }
async function showRoute(query: { [key: string]: string | string[] | undefined }) {
  return render(await SharePage({ searchParams: Promise.resolve(query) }));
}
beforeEach(() => { mockedClient.mockReturnValue(client()); });

describe("Standalone invitation page", () => {
  it("awaits and normalizes the singleton room query without showing the courtroom or room-creation controls", async () => {
    await showRoute({ room: " du4m9s " });
    expect(screen.getByRole("heading", { level: 1, name: invitation })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Your display name" })).toHaveAttribute("autoComplete", "nickname");
    expect(screen.getByRole("button", { name: "Join room" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /create|copy invite|ready/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pixel-art courtroom/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to start" })).toHaveAttribute("href", "/?start=1");
  });

  it("joins with only the invited code and trimmed display name, then opens the existing room page", async () => {
    const user = userEvent.setup(); const session = client(); mockedClient.mockReturnValue(session);
    await showRoute({ room: invitation, returnTo: "https://attacker.invalid" });
    await user.type(screen.getByRole("textbox", { name: "Your display name" }), "  Robin  ");
    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(session.join).toHaveBeenCalledExactlyOnceWith(invitation, "Robin");
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(`/?room=${invitation}`);
    expect(session.create).not.toHaveBeenCalled(); expect(session.leaveRoom).not.toHaveBeenCalled();
  });

  it("does not submit whitespace-only names", () => {
    const session = client(); mockedClient.mockReturnValue(session); show();
    fireEvent.change(screen.getByRole("textbox", { name: "Your display name" }), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("form", { name: "Join invited room" }));
    expect(session.join).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("blocks duplicate submits while waiting for membership, then redirects only on success", async () => {
    let finish!: (value: boolean) => void;
    const joining = new Promise<boolean>(resolve => { finish = resolve; });
    const session = client(null, { join: vi.fn(() => joining) }); mockedClient.mockReturnValue(session); show();
    const input = screen.getByRole("textbox", { name: "Your display name" });
    fireEvent.change(input, { target: { value: "Robin" } });
    const form = screen.getByRole("form", { name: "Join invited room" });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(session.join).toHaveBeenCalledExactlyOnceWith(invitation, "Robin");
    expect(input).toBeDisabled(); expect(form).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Joining…" })).toBeDisabled();
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => { finish(true); await joining; });
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(`/?room=${invitation}`);
  });

  it.each([
    "That room already has two players.",
    "That room does not exist. Check the six-character code.",
    "A player has left that room. Ask for a new invitation.",
    "This room has expired. Create a new room.",
  ])("keeps the invitation and entered name after a rejected join: %s", async error => {
    const user = userEvent.setup(); const session = client(null, { join: vi.fn().mockResolvedValue(false) }); mockedClient.mockReturnValue(session); const view = show();
    await user.type(screen.getByRole("textbox", { name: "Your display name" }), "Robin");
    await user.click(screen.getByRole("button", { name: "Join room" }));
    mockedClient.mockReturnValue({ ...session, error }); view.rerender(<ShareInvite code={invitation} issue={null}/>);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(screen.getByRole("textbox", { name: "Your display name" })).toHaveValue("Robin");
    expect(screen.getByRole("heading", { name: invitation })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join room" })).toBeEnabled();
    expect(navigation.replace).not.toHaveBeenCalled(); expect(session.leaveRoom).not.toHaveBeenCalled();
  });

  it("handles an unexpected rejected request without an unhandled error or losing the name", async () => {
    const user = userEvent.setup(); const session = client(null, { join: vi.fn().mockRejectedValue(new Error("network")) }); mockedClient.mockReturnValue(session); show();
    await user.type(screen.getByRole("textbox", { name: "Your display name" }), "Robin");
    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t join this room. Please try again.");
    expect(screen.getByRole("textbox", { name: "Your display name" })).toHaveValue("Robin");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each([undefined, "", " ", "DU4M9", "DU4M9S2", "DU4M9!", "DU4M0S", "DU4M1S", "javascript:alert(1)", ["DU4M9S", "ABC234"], ["DU4M9S"]])("rejects a missing, malformed or repeated code without guessing a different code: %j", async value => {
    const session = client(); mockedClient.mockReturnValue(session); await showRoute({ room: value });
    expect(screen.getByRole("heading", { name: "Check your invitation" })).toBeInTheDocument();
    expect(screen.getByText(/Ask your friend/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join room" })).not.toBeInTheDocument();
    expect(session.join).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("waits for the saved-session check before showing the name form", () => {
    const session = client(null, { loading: true }); mockedClient.mockReturnValue(session); const view = show();
    expect(screen.getByRole("status")).toHaveTextContent("Checking for your saved seat…");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    mockedClient.mockReturnValue({ ...session, loading: false }); view.rerender(<ShareInvite code={invitation} issue={null}/>);
    expect(screen.getByRole("textbox", { name: "Your display name" })).toBeEnabled();
    expect(session.join).not.toHaveBeenCalled();
  });

  it("respects pending room actions and allows reconnecting after a session failure", async () => {
    const user = userEvent.setup(); const session = client(); mockedClient.mockReturnValue(session); const view = show();
    await user.type(screen.getByRole("textbox", { name: "Your display name" }), "Robin");
    mockedClient.mockReturnValue({ ...session, pending: true }); view.rerender(<ShareInvite code={invitation} issue={null}/>);
    expect(screen.getByRole("textbox", { name: "Your display name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Joining…" })).toBeDisabled();
    mockedClient.mockReturnValue({ ...session, offline: true, error: "Session service is unavailable." }); view.rerender(<ShareInvite code={invitation} issue={null}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Session service is unavailable.");
    expect(screen.getByRole("button", { name: "Join room" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Try reconnecting" }));
    expect(session.refresh).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByRole("textbox", { name: "Your display name" })).toHaveValue("Robin");
    expect(session.join).not.toHaveBeenCalled();
  });

  it("offers the existing same-room seat without resubmitting or renaming the player", () => {
    const session = client(room(invitation, { themeId: "detective" })); mockedClient.mockReturnValue(session); const view = show();
    expect(screen.getByText("Saved guest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open room" })).toHaveAttribute("href", `/?room=${invitation}`);
    expect(view.container.firstChild).toHaveAttribute("data-theme", "detective");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave current room" })).not.toBeInTheDocument();
    expect(session.join).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("keeps another saved room until the player explicitly confirms leaving", async () => {
    const user = userEvent.setup(); const session = client(room("ABC234")); mockedClient.mockReturnValue(session); show();
    expect(screen.getByRole("heading", { name: "You have another room saved" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: invitation })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume your room" })).toHaveAttribute("href", "/?room=ABC234");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leave current room" }));
    expect(screen.getByRole("group", { name: "Leave room confirmation" })).toBeInTheDocument();
    expect(session.leaveRoom).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Leave current room" })).toHaveFocus();
    expect(session.leaveRoom).not.toHaveBeenCalled(); expect(session.join).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("preserves a failed leave, then restores the original invitation and draft name after a successful leave", async () => {
    const user = userEvent.setup(); const empty = client(); mockedClient.mockReturnValue(empty); const view = show();
    await user.type(screen.getByRole("textbox", { name: "Your display name" }), "Robin");
    const saved = client(room("ABC234"), { leaveRoom: vi.fn().mockResolvedValue(false) }); mockedClient.mockReturnValue(saved); view.rerender(<ShareInvite code={invitation} issue={null}/>);
    await user.click(screen.getByRole("button", { name: "Leave current room" }));
    await user.click(screen.getByRole("button", { name: "Leave room" }));
    expect(saved.leaveRoom).toHaveBeenCalledExactlyOnceWith("room-ABC234");
    mockedClient.mockReturnValue({ ...saved, error: "Leaving failed. Your seat is saved." }); view.rerender(<ShareInvite code={invitation} issue={null}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Your seat is saved.");
    expect(screen.getByRole("link", { name: "Resume your room" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    vi.mocked(saved.leaveRoom).mockResolvedValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Leave room" }));
    await waitFor(() => expect(saved.leaveRoom).toHaveBeenCalledTimes(2));
    mockedClient.mockReturnValue(empty); view.rerender(<ShareInvite code={invitation} issue={null}/>);
    expect(screen.getByRole("heading", { level: 1, name: invitation })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your display name" })).toHaveValue("Robin");
    expect(empty.join).not.toHaveBeenCalled(); expect(saved.join).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(empty.join).toHaveBeenCalledExactlyOnceWith(invitation, "Robin");
  });
});
