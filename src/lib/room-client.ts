"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { RoomResponse } from "./room-types";

const messages: Record<string, string> = {
  ROOM_NOT_FOUND: "That room does not exist. Check the six-character code and try again.",
  ROOM_FULL: "That room already has two players. Ask for a new room code.",
  ROOM_EXPIRED: "This room has expired. Create a new room to meet again.",
  ALREADY_IN_ROOM: "This browser already belongs to a room. Refresh to recover your seat.",
  INVALID_NAME: "Enter a display name between 1 and 32 characters.",
  INVALID_CODE: "Enter the six-character room code from your invitation.",
  UNAUTHORIZED: "Your player session is unavailable. Refresh and try again.",
  NOT_CONFIGURED: "Rooms are not configured yet. The project owner needs to connect Supabase.",
};

export async function roomRequest(path: string, body?: object, signal?: AbortSignal): Promise<RoomResponse> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload.error === "string" ? messages[payload.error] ?? payload.error : "We could not reach the room. Please try again.";
    throw new RoomRequestError(message, response.status);
  }
  return payload;
}

class RoomRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function useRoomClient() {
  const [data, setData] = useState<RoomResponse>({ room: null });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const active = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const actionPending = useRef(false);

  // Serialize API calls so a stale refresh cannot overwrite a readiness change
  // or race a refresh-token rotation in the server's HttpOnly session cookie.
  const request = useCallback((path: string, body?: object) => {
    if (active.current) return active.current;
    const abort = new AbortController();
    controller.current = abort;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; abort.abort(); }, 15_000);
    const operation = (async () => {
      try {
        const next = await roomRequest(path, body, abort.signal);
        if (!mounted.current || abort.signal.aborted) return;
        setData(next); setError(""); setOffline(false);
      } catch (reason) {
        if (!mounted.current || (abort.signal.aborted && !timedOut)) return;
        setError(reason instanceof Error ? reason.message : "We could not reach the room. Please try again.");
        if (timedOut) setError("The room took too long to respond. Please try reconnecting.");
        if (reason instanceof RoomRequestError && (reason.status === 401 || reason.status === 410)) setData({ room: null });
        if (reason instanceof RoomRequestError && reason.status === 401) setError("Your player session was lost. Your previous seat cannot be recovered here; create a new room or use another invitation.");
        if (timedOut || !body || path.endsWith("heartbeat")) setOffline(true);
      } finally {
        window.clearTimeout(timeout);
        if (controller.current === abort) {
          if (mounted.current) setLoading(false);
          active.current = null;
        }
      }
    })();
    active.current = operation;
    return operation;
  }, []);

  const refresh = useCallback(() => request("/api/rooms/session"), [request]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; controller.current?.abort(); active.current = null; };
  }, [refresh]);

  const roomId = data.room?.id;
  useEffect(() => {
    if (!roomId) return;
    const heartbeat = () => { void request("/api/rooms/heartbeat", {}); };
    const disconnected = () => { setOffline(true); setLive(false); };
    heartbeat();
    const timer = window.setInterval(heartbeat, 10_000);
    window.addEventListener("online", heartbeat);
    window.addEventListener("offline", disconnected);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", heartbeat);
      window.removeEventListener("offline", disconnected);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [roomId, request]);

  const realtime = data.realtime;
  useEffect(() => {
    if (!roomId || !realtime) return;
    let disposed = false;
    const client = createClient(realtime.url, realtime.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    void client.realtime.setAuth(realtime.accessToken).then(() => {
      if (disposed) return;
      client.channel(`room:${roomId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "quarrel_players", filter: `room_id=eq.${roomId}` }, () => {
          // Read after an in-flight heartbeat as that response may predate this event.
          if (active.current) void active.current.then(() => { if (!disposed) void refresh(); });
          else void refresh();
        })
        .subscribe((status) => { if (!disposed) setLive(status === "SUBSCRIBED"); });
    }).catch(() => { if (!disposed) setLive(false); });
    return () => { disposed = true; setLive(false); void client.removeAllChannels(); };
  }, [roomId, realtime?.url, realtime?.key, realtime?.accessToken, refresh]);

  const act = useCallback(async (path: string, body: object) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setPending(true);
    // Finish any heartbeat/read before issuing this deliberate player action.
    // Recheck after each await: a queued Realtime read may start first.
    while (active.current) await active.current;
    if (mounted.current) await request(path, body);
    actionPending.current = false;
    if (mounted.current) setPending(false);
  }, [request]);

  return {
    room: data.room, loading, pending, offline, live, error, refresh,
    create: (name: string) => act("/api/rooms", { name }),
    join: (code: string, name: string) => act("/api/rooms/join", { code, name }),
    setReady: (ready: boolean) => act("/api/rooms/ready", { ready }),
  };
}
