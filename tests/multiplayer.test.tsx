import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { MultiplayerApp, RoomEntry, RoomLobby } from "@/components/multiplayer-app";
import { roomRequest, useRoomClient } from "@/lib/room-client";
import type { RoomResponse, RoomSnapshot } from "@/lib/room-types";
import type { DebateSnapshot } from "@/lib/debate-types";
import { getTheme, themes, type ThemeId } from "@/themes";

// Keep the real React client and UI. Only the HTTP/WebSocket transports are
// replaced: these tests exercise rendering, request bodies and synchronization,
// while the separate database suite establishes authorization and slot limits.
const socket = vi.hoisted(() => ({
  change: undefined as undefined | (() => void),
  status: undefined as undefined | ((status: string) => void),
  setAuth: vi.fn().mockResolvedValue(undefined),
  removeChannel: vi.fn().mockResolvedValue("ok"),
  removeAllChannels: vi.fn().mockResolvedValue([]),
  unsubscribe: vi.fn().mockResolvedValue("ok"),
  disconnect: vi.fn(),
  filters: [] as unknown[],
  changesByTable: {} as Record<string, () => void>,
  channels: [] as { topic: string; options: unknown }[],
  autoSubscribe: true,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const channel = {
      on: vi.fn((_event: string, filter: unknown, callback: () => void) => {
        socket.change = callback;
        if (filter && typeof filter === "object" && "table" in filter) socket.changesByTable[String(filter.table)] = callback;
        socket.filters.push(filter);
        return channel;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        socket.status = callback;
        if (socket.autoSubscribe) queueMicrotask(() => callback("SUBSCRIBED"));
        return channel;
      }),
      unsubscribe: socket.unsubscribe,
    };
    return {
      realtime: { setAuth: socket.setAuth, disconnect: socket.disconnect },
      channel: vi.fn((topic: string, options: unknown) => {
        socket.channels.push({ topic, options });
        return channel;
      }),
      removeChannel: socket.removeChannel,
      removeAllChannels: socket.removeAllChannels,
    };
  }),
}));

function room(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    id: "920e0108-fbaa-4317-91fd-048f53678d45",
    code: "ABC234",
    expiresAt: "2030-01-01T00:00:00.000Z",
    you: "A",
    players: [{ slot: "A", name: "Avery", ready: false, connected: true }],
    bothReady: false,
    ...overrides,
  };
}

function response(current: RoomSnapshot | null): RoomResponse {
  return {
    room: current,
    ...(current ? { realtime: { url: "http://localhost:54321", key: "public-test-key", accessToken: "short-lived-test-token" } } : {}),
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

let current: RoomSnapshot | null;
let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  current = null;
  socket.change = undefined;
  socket.status = undefined;
  socket.filters = [];
  socket.changesByTable = {};
  socket.channels = [];
  socket.autoSubscribe = true;
  window.history.replaceState({}, "", "/");
  fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(response(current)));
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("Stage 2 room lobby", () => {
  it("recovers a private room with the assigned animal and no debate controls", async () => {
    current = room({
      you: "B",
      players: [
        { slot: "A", name: "Avery", ready: true, connected: true },
        { slot: "B", name: "Blair", ready: false, connected: true },
      ],
    });
    render(<MultiplayerApp />);
    await waitFor(() => expect(screen.getAllByText("Blair").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Avery").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Objection/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /practice argument/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /preview/i })).toHaveAttribute("href", "/preview");
    await waitFor(() => expect(socket.setAuth).toHaveBeenCalledWith("short-lived-test-token"));
    expect(socket.filters).toContainEqual(expect.objectContaining({ schema: "public", table: "quarrel_players", filter: `room_id=eq.${current.id}` }));
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms/session", expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
  });

  it("creates a room with a trimmed name and exposes a shareable code and URL", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_path, options) => {
      if (_path === "/api/rooms") {
        expect(JSON.parse(options!.body as string)).toEqual({ name: "Avery" });
        current = room();
      }
      return json(response(current));
    });
    render(<MultiplayerApp />);
    const name = await screen.findByRole("textbox", { name: "Your display name" });
    expect(screen.getByRole("button", { name: "Create private room" })).toBeDisabled();
    await user.type(name, "  Avery  ");
    await user.click(screen.getByRole("button", { name: "Create private room" }));
    const invitation = await screen.findByRole("textbox", { name: "Shareable invitation" });
    expect(invitation).toHaveValue(`${window.location.origin}/?room=ABC234`);
    const players = within(screen.getByRole("list", { name: "Room players" }));
    expect(players.getAllByRole("listitem")).toHaveLength(2);
    expect(players.getByText("PLAYER A · LION · YOU")).toBeInTheDocument();
    expect(players.getByText("Waiting for a friend")).toBeInTheDocument();
    expect(players.getByText("Seat available")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /both players confirmed/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause animation" }));
    expect(screen.getByRole("button", { name: "Resume animation" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".courtroom")).toHaveAttribute("data-paused", "true");
    await user.click(screen.getByRole("button", { name: "Resume animation" }));
    expect(document.querySelector(".courtroom")).toHaveAttribute("data-paused", "false");
  });

  it("joins from a shared URL and assigns the arriving player to the zebra", async () => {
    window.history.replaceState({}, "", "/?room=abc234");
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/join") {
        expect(JSON.parse(options!.body as string)).toEqual({ code: "ABC234", name: "Blair" });
        current = room({ you: "B", players: [
          { slot: "A", name: "Avery", ready: false, connected: true },
          { slot: "B", name: "Blair", ready: false, connected: true },
        ] });
      }
      return json(response(current));
    });
    render(<MultiplayerApp />);
    expect(await screen.findByRole("textbox", { name: "Six-character room code" })).toHaveValue("ABC234");
    await user.type(screen.getByRole("textbox", { name: "Your display name" }), "Blair");
    await user.click(screen.getByRole("button", { name: "Join private room" }));
    expect(await screen.findByText("PLAYER B · ZEBRA · YOU")).toBeInTheDocument();
    expect(document.querySelector(".character--zebra .character-nameplate strong")).toHaveTextContent("Blair");
  });

  it("changes only the current player's readiness, then reacts to a peer update", async () => {
    const user = userEvent.setup();
    current = room({ players: [
      { slot: "A", name: "Avery", ready: false, connected: true },
      { slot: "B", name: "Blair", ready: false, connected: true },
    ] });
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/ready") {
        const payload = JSON.parse(options!.body as string);
        expect(Object.keys(payload)).toEqual(["ready"]);
        current = { ...current!, players: current!.players.map(player => player.slot === "A" ? { ...player, ready: payload.ready } : player) };
      }
      return json(response(current));
    });
    render(<MultiplayerApp />);
    await user.click(await screen.findByRole("button", { name: "I’m ready" }));
    expect(await screen.findByRole("button", { name: "I’m not ready" })).toHaveAttribute("aria-pressed", "true");
    const seats = within(screen.getByRole("list", { name: "Room players" })).getAllByRole("listitem");
    expect(within(seats[0]).getByText("Ready")).toBeInTheDocument();
    expect(within(seats[1]).getByText("Not ready")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /I’m.*ready/ })).toHaveLength(1);
    current = { ...current!, bothReady: true, players: current!.players.map(player => ({ ...player, ready: true })) };
    act(() => socket.change!());
    expect(await screen.findByRole("heading", { name: "Ready to start — both players confirmed!" })).toBeInTheDocument();
    expect(screen.getByText(/Approve the same topic and positions. Player A chooses when to start/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I’m not ready" }));
    expect(await screen.findByRole("button", { name: "I’m ready" })).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["ROOM_FULL", /already has two players/],
    ["ROOM_NOT_FOUND", /does not exist/],
  ])("shows %s without accepting a seat", async (code, message) => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async path => path === "/api/rooms/join" ? json({ error: code }, 409) : json(response(null)));
    render(<MultiplayerApp />);
    await user.click(await screen.findByRole("button", { name: "Join a room" }));
    await user.type(screen.getByRole("textbox", { name: "Your display name" }), "Third visitor");
    await user.type(screen.getByRole("textbox", { name: "Six-character room code" }), "abc234");
    await user.click(screen.getByRole("button", { name: "Join private room" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("list", { name: "Room players" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join private room" })).toBeEnabled();
  });

  it("disables readiness after a connection failure and recovers through the retry control", async () => {
    const user = userEvent.setup();
    current = room({ bothReady: true, players: [
      { slot: "A", name: "Avery", ready: true, connected: true },
      { slot: "B", name: "Blair", ready: true, connected: true },
    ] });
    render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m not ready" });
    await waitFor(() => expect(socket.change).toBeDefined());
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));
    act(() => socket.change!());
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("button", { name: "I’m not ready" })).toBeDisabled();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.queryByRole("heading", { name: /both players confirmed/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try reconnecting" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "I’m not ready" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /both players confirmed/i })).toBeInTheDocument();
  });

  it("copies the invite and offers a manual fallback if clipboard access fails", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    current = room();
    render(<MultiplayerApp />);
    const link = await screen.findByRole("textbox", { name: "Shareable invitation" });
    const select = vi.spyOn(link as HTMLInputElement, "select");
    await user.click(link);
    expect(select).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/?room=ABC234`);
    expect(await screen.findByText("Invitation copied.")).toBeInTheDocument();
    write.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(await screen.findByText(/Copy the invitation from the link field above/)).toBeInTheDocument();
  });

  it("cleans up subscriptions and ignores responses after the lobby is unmounted", async () => {
    current = room();
    const view = render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m ready" });
    await waitFor(() => expect(socket.change).toBeDefined());
    let release!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    act(() => socket.change!());
    view.unmount();
    expect(socket.removeAllChannels).toHaveBeenCalled();
    await act(async () => { release(json(response(current))); });
    expect(screen.queryByRole("button", { name: "I’m ready" })).not.toBeInTheDocument();
  });

  it("keeps the form locked while an earlier create request is pending", async () => {
    const user = userEvent.setup();
    let release!: (value: Response) => void;
    fetchMock.mockImplementation(async path => path === "/api/rooms" ? new Promise(resolve => { release = resolve; }) : json(response(current)));
    render(<MultiplayerApp />);
    await user.type(await screen.findByRole("textbox", { name: "Your display name" }), "Avery");
    await user.click(screen.getByRole("button", { name: "Create private room" }));
    expect(screen.getByRole("button", { name: "Finding your seat…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Your display name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Join a room" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Finding your seat…" }));
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms")).toHaveLength(1);
    current = room();
    await act(async () => release(json(response(current))));
    expect(await screen.findByRole("button", { name: "I’m ready" })).toBeEnabled();
  });

  it("shows a disconnected peer without allowing the viewer to change that seat", async () => {
    current = room({ players: [
      { slot: "A", name: "Avery", ready: false, connected: true },
      { slot: "B", name: "Blair", ready: true, connected: false },
    ] });
    render(<MultiplayerApp />);
    expect(await screen.findByText("Disconnected")).toBeInTheDocument();
    const peer = within(screen.getByRole("list", { name: "Room players" })).getAllByRole("listitem")[1];
    expect(within(peer).queryByRole("button")).not.toBeInTheDocument();
    expect(within(peer).getByText("Ready")).toBeInTheDocument();
  });
});

describe("Leaving a room to start again", () => {
  it("keeps Resume available, requires confirmation, and creates a fresh room after leaving", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?start=1&room=ABC234");
    const previous = room({ debate: { ...activeDebate(), phase: "verdict", activeSlot: null, turnDeadline: null } });
    current = previous;
    let release!: (value: Response) => void;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/leave") {
        expect(JSON.parse(options!.body as string)).toEqual({ roomId: previous.id });
        expect(options!.headers).toEqual({ "Content-Type": "application/json", "x-quarrel-room-id": previous.id });
        return new Promise(resolve => { release = resolve; });
      }
      if (path === "/api/rooms") current = room({ id: "a07a0285-5043-4f36-a15c-6c2f9f143574", code: "DEF567" });
      return json(response(current));
    });
    render(<MultiplayerApp/>);
    await user.click(await screen.findByRole("button", { name: "Create or join another room" }));
    expect(screen.getByRole("group", { name: "Leave room confirmation" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Resume room" })).toBeEnabled();
    expect(screen.getByText(/You won’t be able to return to this seat/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Create or join another room" })).toHaveFocus();
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms/leave")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Create or join another room" }));
    await user.click(screen.getByRole("button", { name: "Leave room" }));
    expect(screen.getByRole("button", { name: "Leaving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "Your display name" })).not.toBeInTheDocument();
    current = null;
    await act(async () => { release(json(response(null))); });
    const name = await screen.findByRole("textbox", { name: "Your display name" });
    expect(window.location.search).toBe("?start=1");
    expect(screen.queryByRole("button", { name: "Resume room" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join a room" }));
    expect(screen.getByRole("textbox", { name: "Six-character room code" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Create a room" }));
    await user.type(name, "Avery again");
    await user.click(screen.getByRole("button", { name: "Create private room" }));
    expect(await screen.findByRole("textbox", { name: "Shareable invitation" })).toHaveValue(`${window.location.origin}/?room=DEF567`);
    expect(previous.code).toBe("ABC234");
    expect(previous.debate?.phase).toBe("verdict");
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/leave")).toHaveLength(1);
  });

  it("keeps the active room and its record when leaving fails, and allows cancellation", async () => {
    const user = userEvent.setup();
    current = room({ debate: activeDebate() });
    fetchMock.mockImplementation(async path => path === "/api/rooms/leave" ? json({ error: "The room service is unavailable. Try again." }, 503) : json(response(current)));
    render(<MultiplayerApp/>);
    await user.click(await screen.findByRole("button", { name: "Leave this room" }));
    await user.click(screen.getByRole("button", { name: "Leave room" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The room service is unavailable. Try again.");
    expect(screen.getByRole("list", { name: "Room players" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your opening statement" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Your display name" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?room=ABC234");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Leave room confirmation" })).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("button", { name: "Leave this room" })).toBeDisabled();
  });

  it("stops room heartbeats and subscriptions after a confirmed leave without resetting identity", async () => {
    vi.useFakeTimers();
    current = room();
    fetchMock.mockImplementation(async path => {
      if (path === "/api/rooms/leave") current = null;
      return json(response(current));
    });
    const view = renderHook(() => useRoomClient());
    await act(async () => { await Promise.resolve(); });
    const id = view.result.current.room!.id;
    await act(async () => { expect(await view.result.current.leaveRoom(id)).toBe(true); });
    expect(view.result.current.room).toBeNull();
    expect(view.result.current.live).toBe(false);
    expect(socket.removeAllChannels).toHaveBeenCalled();
    const heartbeatCount = fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/heartbeat").length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/heartbeat")).toHaveLength(heartbeatCount);
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes("auth"))).toBe(false);
    view.unmount();
  });

  it("keeps the clicked room scope across a queued refresh and resyncs a stale mutation without retrying it", async () => {
    const previous = room();
    const next = room({ id: "a07a0285-5043-4f36-a15c-6c2f9f143574", code: "DEF567" });
    current = previous;
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.live).toBe(true));
    let release!: (value: Response) => void;
    let holdRefresh = true;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/session" && holdRefresh) { holdRefresh = false; return new Promise(resolve => { release = resolve; }); }
      if (path === "/api/rooms/ready") {
        expect(options!.headers).toEqual({ "Content-Type": "application/json", "x-quarrel-room-id": previous.id });
        return json({ error: "This browser changed rooms. Refreshing your current room.", code: "STALE_ROOM" }, 409);
      }
      return json(response(current));
    });
    let refresh!: Promise<boolean>;
    let ready!: Promise<boolean>;
    act(() => { refresh = view.result.current.refresh(); ready = view.result.current.setReady(true); });
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/ready")).toHaveLength(0);
    current = next;
    await act(async () => { release(json(response(next))); await refresh; expect(await ready).toBe(false); });
    await waitFor(() => expect(view.result.current.room?.code).toBe("DEF567"));
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/ready")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/session").length).toBeGreaterThanOrEqual(3);
    expect(view.result.current.room?.players[0].ready).toBe(false);
  });
  it("keeps an action tied to the rendered room even after a newer snapshot arrives", async () => {
    const previous = room();
    const next = room({ id: "a07a0285-5043-4f36-a15c-6c2f9f143574", code: "DEF567" });
    current = previous;
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.live).toBe(true));
    const readyFromDisplayedRoom = view.result.current.setReady;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/ready") {
        expect(options!.headers).toEqual({ "Content-Type": "application/json", "x-quarrel-room-id": previous.id });
        return json({ error: "This browser changed rooms. Refreshing your current room.", code: "STALE_ROOM" }, 409);
      }
      return json(response(current));
    });
    current = next;
    await act(async () => {
      await view.result.current.refresh();
      // A browser event can still invoke the old rendered button before React
      // commits the new snapshot. It must never authorize a new-room mutation.
      expect(await readyFromDisplayedRoom(true)).toBe(false);
      await view.result.current.refresh();
    });
    expect(view.result.current.room?.code).toBe("DEF567");
    expect(view.result.current.room?.players[0].ready).toBe(false);
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/ready")).toHaveLength(1);
  });
});

describe("Stage 2 input and transport boundaries", () => {
  it("sanitizes codes, caps names, and guards direct invalid form submissions", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const view = render(<RoomEntry pending={false} initialCode="" onCreate={onCreate} onJoin={onJoin} />);
    const name = screen.getByRole("textbox", { name: "Your display name" });
    fireEvent.submit(name.closest("form")!);
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: "x".repeat(50) } });
    expect(name).toHaveValue("x".repeat(32));
    await user.click(screen.getByRole("button", { name: "Join a room" }));
    const code = screen.getByRole("textbox", { name: "Six-character room code" });
    fireEvent.change(code, { target: { value: "ab- c234xyz" } });
    expect(code).toHaveValue("ABC234");
    fireEvent.change(code, { target: { value: "abc" } });
    fireEvent.submit(name.closest("form")!);
    expect(onJoin).not.toHaveBeenCalled();
    view.rerender(<RoomEntry pending={true} initialCode="ABC234" onCreate={onCreate} onJoin={onJoin} />);
    fireEvent.submit(name.closest("form")!);
    expect(onJoin).not.toHaveBeenCalled();
    view.rerender(<RoomEntry pending={false} initialCode="ABC234" onCreate={onCreate} onJoin={onJoin} />);
    await user.click(screen.getByRole("button", { name: "Create a room" }));
    expect(screen.queryByRole("textbox", { name: "Six-character room code" })).not.toBeInTheDocument();
  });

  it("disables readiness when the recovered snapshot has no current seat", () => {
    render(<RoomLobby room={room({ you: "B" })} pending={false} offline={false} live={false} onReady={vi.fn()} />);
    expect(screen.getByRole("button", { name: "I’m ready" })).toBeDisabled();
  });

  it.each([
    ["ROOM_EXPIRED", /expired/],
    ["ALREADY_IN_ROOM", /already belongs/],
    ["INVALID_NAME", /display name/],
    ["INVALID_CODE", /six-character room code/],
    ["UNAUTHORIZED", /session is unavailable/],
    ["NOT_CONFIGURED", /not configured/],
    ["This room is full. Ask for another invitation.", /This room is full/],
  ])("renders the approved API message for %s", async (code, message) => {
    fetchMock.mockResolvedValueOnce(json({ error: code }, 400));
    await expect(roomRequest("/api/rooms/session")).rejects.toThrow(message);
  });

  it("uses a generic message for malformed server errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { internal: "database detail" } }, 500));
    await expect(roomRequest("/api/rooms/session")).rejects.toThrow(/could not reach the room/);
  });
});

describe("Stage 2 connection recovery", () => {
  it("waits for Postgres registration and refreshes changes made before connection or reconnection", async () => {
    socket.autoSubscribe = false;
    current = room({ themeId: "jungle" });
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(socket.status).toBeDefined());
    expect(socket.channels).toEqual([{
      topic: `room:${current.id}`,
      options: { config: { postgres_changes_options: { wait: true, timeout: 10_000 } } },
    }]);
    expect(view.result.current.live).toBe(false);
    expect(view.result.current.room?.themeId).toBe("jungle");
    const reads = () => fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/session").length;
    const before = reads();
    // This update happens while the subscription is registering: no change event
    // reaches the client, so the confirmation must trigger a fresh snapshot.
    current = { ...current!, themeId: "detective" };
    await act(async () => socket.status!("SUBSCRIBED"));
    await waitFor(() => expect(view.result.current.room?.themeId).toBe("detective"));
    expect(view.result.current.live).toBe(true);
    expect(reads()).toBe(before + 1);
    act(() => socket.status!("CHANNEL_ERROR"));
    expect(view.result.current.live).toBe(false);
    current = { ...current!, themeId: "courtroom" };
    await act(async () => socket.status!("SUBSCRIBED"));
    await waitFor(() => expect(view.result.current.room?.themeId).toBe("courtroom"));
    expect(reads()).toBe(before + 2);
    view.unmount();
    act(() => socket.status!("SUBSCRIBED"));
    expect(reads()).toBe(before + 2);
  });

  it("heartbeats every ten seconds and responds to browser connection and visibility changes", async () => {
    vi.useFakeTimers();
    current = room();
    const view = renderHook(() => useRoomClient());
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.room?.code).toBe("ABC234");
    const heartbeats = () => fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/heartbeat").length;
    const initialCount = heartbeats();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(heartbeats()).toBe(initialCount + 1);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(view.result.current.offline).toBe(true);
    expect(view.result.current.live).toBe(false);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(view.result.current.offline).toBe(false);
    expect(heartbeats()).toBe(initialCount + 2);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(heartbeats()).toBe(initialCount + 3);
    act(() => socket.status!("TIMED_OUT"));
    expect(view.result.current.live).toBe(false);
    act(() => socket.status!("SUBSCRIBED"));
    expect(view.result.current.live).toBe(true);
    view.unmount();
    const stoppedCount = heartbeats();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(heartbeats()).toBe(stoppedCount);
  });

  it("aborts a stalled request after fifteen seconds and allows a later recovery", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const view = renderHook(() => useRoomClient());
    expect(view.result.current.loading).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.offline).toBe(true);
    expect(view.result.current.error).toMatch(/too long to respond/);
    current = room();
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.room?.code).toBe("ABC234");
    expect(view.result.current.offline).toBe(false);
    expect(view.result.current.error).toBe("");
  });

  it("clears an expired seat instead of presenting a permanently stale lobby", async () => {
    current = room();
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.room?.code).toBe("ABC234"));
    fetchMock.mockResolvedValueOnce(json({ error: "ROOM_EXPIRED" }, 410));
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.room).toBeNull();
    expect(view.result.current.error).toMatch(/expired/);
  });

  it("returns a lost session to room entry without silently creating another player", async () => {
    current = room();
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.room?.code).toBe("ABC234"));
    fetchMock.mockResolvedValueOnce(json({ error: "UNAUTHORIZED" }, 401));
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.room).toBeNull();
    expect(view.result.current.error).toMatch(/previous seat cannot be recovered/);
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms" || path === "/api/rooms/join")).toBe(false);
  });

  it("serializes a ready action behind a slow read and drops duplicate deliberate actions", async () => {
    current = room();
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.live).toBe(true));
    let release!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    act(() => { void view.result.current.refresh(); });
    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    act(() => {
      first = view.result.current.setReady(true);
      duplicate = view.result.current.setReady(false);
    });
    expect(view.result.current.pending).toBe(true);
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/ready")).toHaveLength(0);
    act(() => socket.change!());
    await act(async () => {
      release(json(response(current)));
      await Promise.all([first, duplicate]);
    });
    const actions = fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/ready");
    expect(actions).toHaveLength(1);
    expect(JSON.parse(actions[0][1]!.body as string)).toEqual({ ready: true });
    expect(view.result.current.pending).toBe(false);
  });

  it("keeps polling available when Realtime authentication fails", async () => {
    current = room();
    socket.setAuth.mockRejectedValueOnce(new Error("Socket unavailable"));
    const view = renderHook(() => useRoomClient());
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.room?.code).toBe("ABC234");
    expect(view.result.current.live).toBe(false);
    expect(view.result.current.offline).toBe(false);
  });

  it("uses a safe generic message when a transport rejects without an Error", async () => {
    fetchMock.mockRejectedValueOnce("transport detail");
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.error).toBe("We could not reach the room. Please try again.");
  });
});


describe("Stage 2.5 shared theme selection", () => {
  it("subscribes to room theme changes as well as player readiness", async () => {
    current = room({ themeId: "jungle", themeLocked: false });
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.live).toBe(true));
    expect(socket.filters).toContainEqual(expect.objectContaining({ schema: "public", table: "quarrel_rooms", filter: `id=eq.${current!.id}` }));
    expect(socket.filters).toContainEqual(expect.objectContaining({ schema: "public", table: "quarrel_players", filter: `room_id=eq.${current!.id}` }));
    expect(socket.changesByTable.quarrel_rooms).toBeTypeOf("function");
    expect(socket.changesByTable.quarrel_players).toBeTypeOf("function");
  });

  it("sends only a theme ID and preserves both player identities and readiness", async () => {
    current = room({ themeId: "jungle", themeLocked: false, bothReady: true, players: [
      { slot: "A", name: "Avery", ready: true, connected: true },
      { slot: "B", name: "Blair", ready: true, connected: true },
    ] });
    const originalPlayers = structuredClone(current.players);
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/theme") {
        const payload = JSON.parse(options!.body as string);
        expect(payload).toEqual({ themeId: "superhero" });
        current = { ...current!, themeId: payload.themeId };
      }
      return json(response(current));
    });
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.live).toBe(true));
    await act(async () => { await view.result.current.setTheme("superhero"); });
    expect(view.result.current.room?.themeId).toBe("superhero");
    expect(view.result.current.room?.players).toEqual(originalPlayers);
    expect(view.result.current.room?.bothReady).toBe(true);
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/theme")).toHaveLength(1);
  });

  it("lets the host change all four settings without starting a debate", async () => {
    const user = userEvent.setup();
    current = room({ themeId: "jungle", themeLocked: false, bothReady: true, players: [
      { slot: "A", name: "Avery", ready: true, connected: true },
      { slot: "B", name: "Blair", ready: true, connected: true },
    ] });
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/theme") current = { ...current!, themeId: JSON.parse(options!.body as string).themeId };
      return json(response(current));
    });
    render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m not ready" });
    const picker = within(screen.getByRole("radiogroup", { name: "Room theme" }));
    expect(picker.getAllByRole("radio")).toHaveLength(4);
    await user.click(picker.getByRole("radio", { name: "Jungle theme" }));
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms/theme")).toBe(false);
    for (const id of ["superhero", "detective", "courtroom", "jungle"] as const) {
      const theme = getTheme(id);
      await user.click(picker.getByRole("radio", { name: `${theme.displayName} theme` }));
      await waitFor(() => expect(picker.getByRole("radio", { name: `${theme.displayName} theme` })).toHaveAttribute("aria-checked", "true"));
      const arena = within(screen.getByRole("region", { name: theme.environmentLabel }));
      expect(arena.getByRole("img", { name: theme.judge.description })).toBeInTheDocument();
      for (const slot of ["A", "B"] as const) {
        const character = theme.players.characters[theme.players.defaults[slot]];
        expect(arena.getByRole("img", { name: character.description })).toBeInTheDocument();
      }
      expect(arena.getAllByRole("img")).toHaveLength(3);
      expect(document.querySelector<HTMLElement>(".theme-shell")?.style.getPropertyValue("--theme-canvas")).toBe(theme.palette.canvas);
      expect(document.querySelector<HTMLElement>(".theme-shell")?.style.getPropertyValue("--ink")).toBe(theme.palette.ink);
      expect(screen.getByRole("heading", { name: "Ready to start — both players confirmed!" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "I’m not ready" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: /start debate/i })).not.toBeInTheDocument();
    }
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/theme")).toHaveLength(4);
  });

  it("supports radio-group keyboard navigation and preserves focus after synchronized selection", async () => {
    const user = userEvent.setup();
    current = room({ themeId: "jungle", themeLocked: false });
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/theme") current = { ...current!, themeId: JSON.parse(options!.body as string).themeId };
      return json(response(current));
    });
    render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m ready" });
    await user.click(screen.getByRole("radio", { name: "Jungle theme" }));
    for (const [key, id] of [
      ["ArrowRight", "superhero"], ["ArrowDown", "detective"], ["ArrowLeft", "superhero"],
      ["ArrowUp", "jungle"], ["ArrowLeft", "courtroom"], ["Home", "jungle"],
      ["End", "courtroom"], ["ArrowRight", "jungle"],
    ] as const) {
      await user.keyboard(`{${key}}`);
      const radio = screen.getByRole("radio", { name: `${getTheme(id).displayName} theme` });
      await waitFor(() => expect(radio).toHaveAttribute("aria-checked", "true"));
      expect(radio).toHaveFocus();
      expect(radio).toHaveAttribute("tabindex", "0");
      expect(screen.getAllByRole("radio").filter(option => option.getAttribute("tabindex") === "0")).toHaveLength(1);
    }
    const mutationCount = fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/theme").length;
    await user.keyboard("{Home}x");
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/rooms/theme")).toHaveLength(mutationCount);
    expect(screen.getByRole("radio", { name: "Jungle theme" })).toHaveFocus();
  });

  it("does not steal readiness focus after a keyboard command keeps the current theme", async () => {
    const user = userEvent.setup();
    current = room({ themeId: "jungle", themeLocked: false });
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/ready") current = { ...current!, players: current!.players.map(player => ({ ...player, ready: JSON.parse(options!.body as string).ready })) };
      return json(response(current));
    });
    render(<MultiplayerApp />);
    // Wait on the tiny recovery indicator before traversing the full SVG's
    // accessibility tree, which otherwise blocks the recovery promise in jsdom.
    await waitFor(() => expect(document.querySelector(".room-loading")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "I’m ready" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Jungle theme" }));
    await user.keyboard("{Home}");
    await user.click(screen.getByRole("button", { name: "I’m ready" }));
    const ready = await screen.findByRole("button", { name: "I’m not ready" });
    expect(ready).toHaveFocus();
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms/theme")).toBe(false);
  });

  it("shows live host changes to Player B, retains them on remount, and keeps selection read-only", async () => {
    const user = userEvent.setup();
    current = room({ you: "B", themeId: "superhero", themeLocked: false, players: [
      { slot: "A", name: "Avery", ready: false, connected: true },
      { slot: "B", name: "Blair", ready: true, connected: true },
    ] });
    const view = render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m not ready" });
    await waitFor(() => expect(socket.changesByTable.quarrel_rooms).toBeDefined());
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Jungle theme" }));
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms/theme")).toBe(false);
    current = { ...current!, themeId: "detective" };
    act(() => socket.changesByTable.quarrel_rooms());
    expect(await screen.findByRole("region", { name: getTheme("detective").environmentLabel })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Detective theme" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "I’m not ready" })).toHaveAttribute("aria-pressed", "true");
    view.unmount();
    render(<MultiplayerApp />);
    expect(await screen.findByRole("region", { name: getTheme("detective").environmentLabel })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Detective theme" })).toHaveAttribute("aria-checked", "true");
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms/theme")).toBe(false);
  });

  it.each(["__proto__", "future-setting"])("renders Jungle for an invalid saved theme %s without changing it through the API", async invalid => {
    current = room({ themeId: invalid as ThemeId, themeLocked: false });
    render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m ready" });
    expect(screen.getByRole("region", { name: getTheme("jungle").environmentLabel })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Jungle theme" })).toHaveAttribute("aria-checked", "true");
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms/theme")).toBe(false);
  });

  it("shows all previews but disables room selection before joining and after a future lock", async () => {
    const user = userEvent.setup();
    const view = render(<MultiplayerApp />);
    await screen.findByRole("textbox", { name: "Your display name" });
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    view.unmount();
    current = room({ themeId: "courtroom", themeLocked: true });
    render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m ready" });
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Detective theme" }));
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/rooms/theme")).toBe(false);
    expect(screen.getByRole("radio", { name: "Courtroom theme" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps selection pending until confirmed and leaves the existing world intact if the server rejects it", async () => {
    const user = userEvent.setup();
    current = room({ themeId: "jungle", themeLocked: false });
    let release!: (value: Response) => void;
    fetchMock.mockImplementation(async path => path === "/api/rooms/theme" ? new Promise(resolve => { release = resolve; }) : json(response(current)));
    render(<MultiplayerApp />);
    await waitFor(() => expect(document.querySelector(".room-loading")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "I’m ready" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Superhero theme" }));
    expect(screen.getByRole("radiogroup", { name: "Room theme" })).toHaveAttribute("aria-busy", "true");
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Jungle theme" })).toHaveAttribute("aria-checked", "true");
    await act(async () => release(json({ error: "This room’s setting is locked." }, 409)));
    expect(await screen.findByRole("alert")).toHaveTextContent("This room’s setting is locked.");
    expect(screen.getByRole("radio", { name: "Jungle theme" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("region", { name: getTheme("jungle").environmentLabel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I’m ready" })).toBeEnabled();
  });

  it("replaces a local dialogue preview with the newly selected theme’s greeting", async () => {
    const user = userEvent.setup();
    current = room({ themeId: "superhero", themeLocked: false });
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rooms/theme") current = { ...current!, themeId: JSON.parse(options!.body as string).themeId };
      return json(response(current));
    });
    render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m ready" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Judge dialogue preview" }), "evidence");
    expect(within(screen.getByRole("region", { name: getTheme("superhero").environmentLabel })).getByRole("status")).toHaveTextContent(getTheme("superhero").judge.samples[1].text);
    await user.click(screen.getByRole("radio", { name: "Detective theme" }));
    const office = await screen.findByRole("region", { name: getTheme("detective").environmentLabel });
    expect(within(office).getByRole("status")).toHaveTextContent(getTheme("detective").judge.dialogue.lobby);
    expect(screen.getByRole("combobox", { name: "Judge dialogue preview" })).toHaveValue("lobby");
    expect(screen.queryByText(getTheme("superhero").judge.samples[1].text)).not.toBeInTheDocument();
  });

  it.each(themes)("previews $displayName judge samples locally without changing room state", async theme => {
    const user = userEvent.setup();
    current = room({ themeId: theme.id, themeLocked: false });
    render(<MultiplayerApp />);
    await screen.findByRole("button", { name: "I’m ready" });
    const select = screen.getByRole("combobox", { name: "Judge dialogue preview" });
    const mutationCount = () => fetchMock.mock.calls.filter(([, options]) => options?.method === "POST" && !(options.body === "{}")).length;
    const before = mutationCount();
    for (const sample of theme.judge.samples) {
      await user.selectOptions(select, sample.id);
      expect(within(screen.getByRole("region", { name: theme.environmentLabel })).getByRole("status")).toHaveTextContent(sample.text);
    }
    await user.selectOptions(select, "lobby");
    expect(within(screen.getByRole("region", { name: theme.environmentLabel })).getByRole("status")).toHaveTextContent(theme.judge.dialogue.lobby);
    expect(mutationCount()).toBe(before);
    expect(current?.themeId).toBe(theme.id);
    expect(current?.players[0].ready).toBe(false);
  });
});

function activeDebate(): DebateSnapshot {
  return {
    phase: "opening", topic: "Campus transport", positionA: "More buses", positionB: "More cycling",
    revision: 2, approvedA: true, approvedB: true, changeRequest: null,
    activeSlot: "A", turnIndex: 0, turnDeadline: "2026-11-07T18:00:45.000Z",
    serverNow: "2026-11-07T18:00:00.000Z", startedAt: "2026-11-07T18:00:00.000Z",
    history: [], questions: [],
  };
}

describe("Stage 3 synchronized client", () => {
  it("sends revision/turn scoped actions, and returns success only after the server accepts them", async () => {
    current = room({ debate: { ...activeDebate(), phase: "setup", turnDeadline: null, turnIndex: null } });
    const view = renderHook(() => useRoomClient());
    await waitFor(() => expect(view.result.current.live).toBe(true));
    await act(async () => {
      expect(await view.result.current.proposeTopic("Topic", "For", "Against", 2)).toBe(true);
      expect(await view.result.current.approveTopic(3)).toBe(true);
      expect(await view.result.current.requestChanges("Clarify scope", 3)).toBe(true);
      expect(await view.result.current.startDebate(4)).toBe(true);
      expect(await view.result.current.submitArgument("Evidence", 4, 0)).toBe(true);
    });
    const actions = fetchMock.mock.calls.filter(([path]) => String(path).includes("/debate/"));
    expect(actions.map(([path, options]) => [path, JSON.parse(options!.body as string)])).toEqual([
      ["/api/rooms/debate/propose", { topic: "Topic", positionA: "For", positionB: "Against", revision: 2 }],
      ["/api/rooms/debate/approve", { revision: 3 }],
      ["/api/rooms/debate/changes", { message: "Clarify scope", revision: 3 }],
      ["/api/rooms/debate/start", { revision: 4 }],
      ["/api/rooms/debate/argument", { text: "Evidence", revision: 4, turnIndex: 0 }],
    ]);
    fetchMock.mockResolvedValueOnce(json({ error: "That turn has ended." }, 409));
    await act(async () => { expect(await view.result.current.submitArgument("Keep my draft", 4, 0)).toBe(false); });
    expect(view.result.current.error).toBe("That turn has ended.");
    view.unmount();
    expect(await view.result.current.submitArgument("Unmounted", 4, 0)).toBe(false);
  });

  it("counts down from server time and requests reconciliation without inventing a local transition", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
    const started = performance.now();
    const serverEpoch = Date.parse("2026-11-07T18:00:00Z");
    current = room({ debate: activeDebate() });
    fetchMock.mockImplementation(async path => {
      const elapsed = performance.now() - started;
      const debate = current!.debate!;
      current = { ...current!, debate: { ...debate, serverNow: new Date(serverEpoch + elapsed).toISOString() } };
      if (path === "/api/rooms/debate/advance") {
        current = { ...current!, debate: { ...current.debate!, activeSlot: "B", turnIndex: 1, turnDeadline: "2026-11-07T18:01:30.000Z" } };
      }
      return json(response(current));
    });
    const view = renderHook(() => useRoomClient());
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.remainingSeconds).toBe(45);
    await act(async () => { await vi.advanceTimersByTimeAsync(44000); });
    expect(view.result.current.remainingSeconds).toBe(1);
    expect(view.result.current.room?.debate?.activeSlot).toBe("A");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const advance = fetchMock.mock.calls.find(([path]) => path === "/api/rooms/debate/advance");
    expect(JSON.parse(advance![1]!.body as string)).toEqual({ revision: 2, turnIndex: 0 });
    expect(view.result.current.room?.debate?.activeSlot).toBe("B");
    expect(view.result.current.remainingSeconds).toBe(45);
    view.unmount();
    const requests = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(100000); });
    expect(fetchMock.mock.calls).toHaveLength(requests);
  });
});

describe("Stage 4 synchronized judge client", () => {
  it("sends a separate idempotent chat request and restores pending/history through snapshots", async () => {
    current = room({debate:activeDebate(),judge:{enabled:true,mode:"demo",messages:[],pendingRequestId:null,messagesUsed:0,maxMessagesPerTurn:2,needsWork:false,preparingQuestions:false}});
    fetchMock.mockImplementation(async (path,options)=>{
      if(path==="/api/rooms/judge") {
        expect(JSON.parse(options!.body as string)).toEqual({text:"Explain the other view",revision:2,turnIndex:0,requestKey:"24c35381-6e66-4f0f-9185-6b586e417057"});
        current={...current!,judge:{...current!.judge!,pendingRequestId:"server-message-id",messagesUsed:1}};
      }
      return json(response(current));
    });
    const view=renderHook(()=>useRoomClient()); await waitFor(()=>expect(view.result.current.live).toBe(true));
    await act(async()=>{expect(await view.result.current.askJudge("Explain the other view",2,0,"24c35381-6e66-4f0f-9185-6b586e417057")).toBe(true);});
    expect(view.result.current.judgePending).toBe(true);expect(view.result.current.room?.debate?.turnIndex).toBe(0);
    expect(fetchMock.mock.calls.some(([p])=>p==="/api/rooms/debate/argument")).toBe(false);
    current={...current!,judge:{...current!.judge!,pendingRequestId:null,messages:[{id:"server-message-id",kind:"chat",slot:"A",turnIndex:0,playerText:"Explain the other view",text:"Both sides can define the evidence they need.",status:"complete",source:"demo",reaction:"speaking",createdAt:"2030-01-01T00:00:00Z",completedAt:"2030-01-01T00:00:01Z"}]}};
    act(()=>socket.change!());await waitFor(()=>expect(view.result.current.judgePending).toBe(false));expect(view.result.current.room?.judge?.messages[0].text).toContain("Both sides");
    view.unmount();expect(await view.result.current.askJudge("Unmounted",2,0,"24c35381-6e66-4f0f-9185-6b586e417057")).toBe(false);
  });
});
