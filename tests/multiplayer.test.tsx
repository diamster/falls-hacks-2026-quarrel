import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { MultiplayerApp, RoomEntry, RoomLobby } from "@/components/multiplayer-app";
import { roomRequest, useRoomClient } from "@/lib/room-client";
import type { RoomResponse, RoomSnapshot } from "@/lib/room-types";

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
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const channel = {
      on: vi.fn((_event: string, filter: unknown, callback: () => void) => {
        socket.change = callback;
        socket.filters.push(filter);
        return channel;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        socket.status = callback;
        queueMicrotask(() => callback("SUBSCRIBED"));
        return channel;
      }),
      unsubscribe: socket.unsubscribe,
    };
    return {
      realtime: { setAuth: socket.setAuth, disconnect: socket.disconnect },
      channel: vi.fn(() => channel),
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
    expect(screen.getByText(/Stage 2 ends here; no debate has started/)).toBeInTheDocument();
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
    let first!: Promise<void>;
    let duplicate!: Promise<void>;
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
