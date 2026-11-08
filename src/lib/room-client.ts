"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { RoomResponse } from "./room-types";
import type { ThemeId } from "@/themes";
import { remainingTurnSeconds, type ServerClock } from "./debate-types";
import { lawyerClockSeconds, type LawyerResultDetail, type LawyerResultRecord } from "./lawyer-types";

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

export async function roomRequest<T = RoomResponse>(path: string, body?: object, signal?: AbortSignal, expectedRoomId?: string | null): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json", ...(expectedRoomId ? { "x-quarrel-room-id": expectedRoomId } : {}) } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload.error === "string" ? messages[payload.error] ?? payload.error : "We could not reach the room. Please try again.";
    throw new RoomRequestError(message, response.status, payload.code === "STALE_ROOM" || payload.code === "STALE_DEBATE" ? payload.code : undefined);
  }
  return payload;
}

class RoomRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: "STALE_ROOM" | "STALE_DEBATE") { super(message); }
}

export function useRoomClient() {
  const [data, setData] = useState<RoomResponse>({ room: null });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState<ServerClock | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [lawyerClocks, setLawyerClocks] = useState({ A: 0, B: 0 });
  const [askingJudge, setAskingJudge] = useState(false);
  const mounted = useRef(false);
  const active = useRef<Promise<boolean> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const actionPending = useRef(false);
  const currentRoomId = useRef<string | null>(null);

  // Serialize API calls so a stale refresh cannot overwrite a readiness change
  // or race a refresh-token rotation in the server's HttpOnly session cookie.
  const request = useCallback(function makeRequest(path: string, body?: object, expectedRoomId: string | null = currentRoomId.current): Promise<boolean> {
    if (active.current) return active.current;
    const abort = new AbortController();
    controller.current = abort;
    let timedOut = false;
    let staleRoom = false;
    const timeout = window.setTimeout(() => { timedOut = true; abort.abort(); }, 15_000);
    const operation = (async () => {
      const sentAt = performance.now();
      try {
        const next = await roomRequest(path, body, abort.signal, expectedRoomId);
        if (!mounted.current || abort.signal.aborted) return false;
        const receivedAt = performance.now();
        const serverTime = Date.parse(next.room?.lawyer?.serverNow ?? next.room?.debate?.serverNow ?? "");
        setClock(Number.isFinite(serverTime) ? {
          // The display estimates transit time; only Postgres decides expiry.
          serverTimeMs: serverTime + (receivedAt - sentAt) / 2,
          receivedAt,
        } : null);
        currentRoomId.current = next.room?.id ?? null;
        setData(next); setError(""); setOffline(false);
        return true;
      } catch (reason) {
        if (!mounted.current || (abort.signal.aborted && !timedOut)) return false;
        setError(reason instanceof Error ? reason.message : "We could not reach the room. Please try again.");
        if (timedOut) setError("The room took too long to respond. Please try reconnecting.");
        if (reason instanceof RoomRequestError && (reason.status === 401 || reason.status === 410)) { currentRoomId.current = null; setData({ room: null }); }
        staleRoom = reason instanceof RoomRequestError && (reason.code === "STALE_ROOM" || reason.code === "STALE_DEBATE");
        if (reason instanceof RoomRequestError && reason.status === 401) setError("Your player session was lost. Your previous seat cannot be recovered here; create a new room or use another invitation.");
        if (timedOut || !body || path.endsWith("heartbeat")) setOffline(true);
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (controller.current === abort) {
          if (mounted.current) setLoading(false);
          active.current = null;
        }
        if (staleRoom) {
          // A different tab moved this browser to another room. Recover its
          // authoritative snapshot after queued work; never retry the mutation.
          void Promise.resolve().then(async () => {
            while (active.current) await active.current;
            if (mounted.current) await makeRequest("/api/rooms/session");
          });
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
    const heartbeat = () => { void request("/api/rooms/heartbeat", {}, roomId); };
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
    const resync = () => {
      // A just-completed response may predate the event; read after it settles.
      if (active.current) void active.current.then(() => { if (!disposed) void refresh(); });
      else void refresh();
    };
    void client.realtime.setAuth(realtime.accessToken).then(() => {
      if (disposed) return;
      // A socket join can precede Postgres registration. Report live only after
      // the database subscription is active, then close the snapshot/listen gap.
      client.channel(`room:${roomId}`, { config: { postgres_changes_options: { wait: true, timeout: 10_000 } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "quarrel_players", filter: `room_id=eq.${roomId}` }, resync)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quarrel_rooms", filter: `id=eq.${roomId}` }, resync)
        .subscribe((status) => {
          if (disposed) return;
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") resync();
        });
    }).catch(() => { if (!disposed) setLive(false); });
    return () => { disposed = true; setLive(false); void client.removeAllChannels(); };
  }, [roomId, realtime?.url, realtime?.key, realtime?.accessToken, refresh]);

  const act = useCallback(async (path: string, body: object) => {
    if (actionPending.current) return false;
    // Keep the room the player saw when clicking, even if an earlier queued
    // read discovers that another tab has since joined a different room.
    const expectedRoomId = data.room?.id ?? null;
    actionPending.current = true;
    setPending(true);
    // Finish any heartbeat/read before issuing this deliberate player action.
    // Recheck after each await: a queued Realtime read may start first.
    while (active.current) await active.current;
    const success = mounted.current ? await request(path, body, expectedRoomId) : false;
    actionPending.current = false;
    if (mounted.current) setPending(false);
    return success;
  }, [request, data.room?.id]);

  // Archive responses are not room envelopes. Serialize them with session reads
  // without replacing the live room or resetting its authoritative clock anchor.
  const resultRequest = useCallback(async function readResult<T>(path: string, body?: object): Promise<T | null> {
    while (active.current) await active.current;
    if (!mounted.current) return null;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 15_000);
    let result: T | null = null;
    const operation = (async () => {
      try {
        const payload = await roomRequest<T>(path, body, abort.signal);
        if (!mounted.current || abort.signal.aborted) return false;
        result = payload;
        setError("");
        return true;
      } catch (reason) {
        if (mounted.current) setError(reason instanceof Error ? reason.message : "The saved result is unavailable. Please try again.");
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (controller.current === abort) active.current = null;
      }
    })();
    active.current = operation;
    await operation;
    return result;
  }, []);
  const listResults = useCallback(async (resultRoomId?: string) => {
    const payload = await resultRequest<{ history: LawyerResultRecord[] }>(`/api/rooms/lawyer/history${resultRoomId ? `?roomId=${encodeURIComponent(resultRoomId)}` : ""}`);
    return payload?.history ?? null;
  }, [resultRequest]);
  const getResult = useCallback(async (debateId: string) => {
    const payload = await resultRequest<{ history: LawyerResultDetail }>(`/api/rooms/lawyer/history?debateId=${encodeURIComponent(debateId)}`);
    return payload?.history ?? null;
  }, [resultRequest]);
  const acknowledgeResults = useCallback(async (debateId: string) => {
    const payload = await resultRequest<{ results: LawyerResultDetail }>("/api/rooms/lawyer/acknowledge", { debateId });
    if (payload && mounted.current) await refresh();
    return payload?.results ?? null;
  }, [resultRequest, refresh]);

  const debate = data.room?.debate;
  const lawyer = data.room?.lawyer;
  useEffect(() => {
    if (!lawyer || !clock) return;
    const tick = () => {
      const now = clock.serverTimeMs + Math.max(0, performance.now() - clock.receivedAt);
      setLawyerClocks({ A: lawyerClockSeconds(lawyer, "A", now), B: lawyerClockSeconds(lawyer, "B", now) });
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [lawyer, clock]);
  useEffect(() => {
    if (!lawyer || offline || lawyer.phase === "setup" || lawyer.phase === "complete" || (lawyer.phase === "planning" && lawyer.planReady)) return;
    let stopped = false;
    let timer: number;
    const reconcile = async () => {
      while (active.current) await active.current;
      if (stopped || !mounted.current) return;
      await request("/api/rooms/lawyer/advance", { revision: lawyer.revision }, roomId ?? null);
      if (!stopped) timer = window.setTimeout(() => { void reconcile(); }, 1500);
    };
    const untilDeadline = lawyer.turnDeadline && clock
      ? Date.parse(lawyer.turnDeadline) - clock.serverTimeMs - Math.max(0, performance.now() - clock.receivedAt) : 1000;
    timer = window.setTimeout(() => { void reconcile(); }, Math.max(500, untilDeadline));
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [lawyer?.phase, lawyer?.planReady, lawyer?.state, lawyer?.turnDeadline, lawyer?.revision, clock, offline, request, roomId]);
  const deadline = debate?.turnDeadline;
  const revision = debate?.revision;
  const turnIndex = debate?.turnIndex;
  useEffect(() => {
    const tick = () => setRemainingSeconds(remainingTurnSeconds(deadline, clock, performance.now()));
    tick();
    if (!deadline || !clock) return;
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline, clock]);

  useEffect(() => {
    if (lawyer || !deadline || !clock || revision === undefined || turnIndex == null || offline) return;
    let disposed = false;
    let timer: number;
    const reconcile = async () => {
      // Both players may wake at the same deadline. The database's room lock
      // reconciles once; stale advance requests only retrieve the current state.
      while (active.current) await active.current;
      if (disposed || !mounted.current) return;
      await request("/api/rooms/debate/advance", { revision, turnIndex }, roomId ?? null);
      // A display estimate may be a little early, or a request may fail. Retry
      // with a bounded delay; no client timestamp can force a transition.
      if (!disposed) timer = window.setTimeout(() => { void reconcile(); }, 1500);
    };
    const remainingMs = Date.parse(deadline) - clock.serverTimeMs - Math.max(0, performance.now() - clock.receivedAt);
    timer = window.setTimeout(() => { void reconcile(); }, Math.max(500, remainingMs));
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [deadline, clock, revision, turnIndex, offline, request, roomId, lawyer]);

  return {
    room: data.room, loading, pending, offline, live, error, refresh, remainingSeconds, lawyerClocks,
    listResults, getResult, acknowledgeResults,
    requestRematch: (debateId: string) => act("/api/rooms/lawyer/rematch", { debateId }),
    retryJury: (debateId: string) => act("/api/rooms/lawyer/retry", { debateId }),
    proposeLawyerTopic: (topic: string, totalSeconds: number, revision: number) => act("/api/rooms/lawyer/topic", { topic, totalSeconds, revision }),
    setOwnPosition: (position: string, revision: number) => act("/api/rooms/lawyer/position", { position, revision }),
    planDebate: (revision: number, regenerate: boolean) => act("/api/rooms/lawyer/plan", { revision, regenerate }),
    startLawyerDebate: (revision: number, planGeneration: number) => act("/api/rooms/lawyer/start", { revision, planGeneration }),
    sendToLawyer: (text: string, revision: number, subtopic: number, requestKey: string) => act("/api/rooms/lawyer/argument", { text, revision, subtopic, requestKey }),
    consultLawyer: (text: string, revision: number, subtopic: number, requestKey: string) => act("/api/rooms/lawyer/consult", { text, revision, subtopic, requestKey }),
    judgePending: askingJudge || Boolean(data.room?.judge?.pendingRequestId),
    askJudge: async (text: string, revision: number, turnIndex: number, requestKey: string) => {
      setAskingJudge(true);
      try { return await act("/api/rooms/judge", { text, revision, turnIndex, requestKey }); }
      finally { if (mounted.current) setAskingJudge(false); }
    },
    create: (name: string) => act("/api/rooms", { name }),
    join: (code: string, name: string) => act("/api/rooms/join", { code, name }),
    leaveRoom: (roomId: string) => act("/api/rooms/leave", { roomId }),
    setTheme: (themeId: ThemeId) => act("/api/rooms/theme", { themeId }),
    setReady: (ready: boolean) => act("/api/rooms/ready", { ready }),
    proposeTopic: (topic: string, positionA: string, positionB: string, revision: number) => act("/api/rooms/debate/propose", { topic, positionA, positionB, revision }),
    approveTopic: (revision: number) => act("/api/rooms/debate/approve", { revision }),
    requestChanges: (message: string, revision: number) => act("/api/rooms/debate/changes", { message, revision }),
    startDebate: (revision: number) => act("/api/rooms/debate/start", { revision }),
    submitArgument: (text: string, revision: number, turnIndex: number) => act("/api/rooms/debate/argument", { text, revision, turnIndex }),
  };
}
