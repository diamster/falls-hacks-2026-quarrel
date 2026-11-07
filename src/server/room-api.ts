import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isThemeId } from "@/themes";

type Action = "session" | "create" | "join" | "ready" | "heartbeat" | "theme";
const cookieNames = ["quarrel_access", "quarrel_refresh"] as const;
const messages: Record<string, [number, string]> = {
  UNAUTHORIZED: [401, "Your player session has expired. Please reload and join again."],
  ROOM_NOT_FOUND: [404, "That room does not exist. Check the six-character code."],
  ROOM_FULL: [409, "That room already has two players."],
  ALREADY_IN_ROOM: [409, "You already have a seat in another room in this browser."],
  ROOM_EXPIRED: [410, "This room has expired. Create a new room."],
  INVALID_NAME: [400, "Enter a display name between 1 and 32 characters."],
  INVALID_CODE: [400, "Enter a valid six-character room code."],
  INVALID_READY: [400, "Readiness must be true or false."],
  INVALID_THEME: [400, "Choose one of the four available themes."],
  HOST_ONLY: [403, "Only Player A can change the room theme."],
  THEME_LOCKED: [409, "The room theme is locked."],
};

class RoomError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RoomError(503, "Rooms are not configured yet. Start local Supabase and run the local setup command.");
  return { url, key };
}

function client(url: string, key: string, token?: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
}

function failDatabase(message: string): never {
  const known = messages[message];
  if (known) throw new RoomError(...known);
  throw new RoomError(503, "The room service is temporarily unavailable. Please try again.");
}

function checkAuthAvailability(error: { status?: number } | null) {
  // A temporary Auth outage must not delete the only credential for a reserved
  // anonymous seat. Only definitive invalid-session errors permit clearing it.
  if (error && ![400, 401, 403, 422].includes(error.status ?? 0)) {
    throw new RoomError(503, "The session service is temporarily unavailable. Your seat is saved; please try again.");
  }
}

async function identity(request: NextRequest, url: string, key: string, allowNew: boolean) {
  const access = request.cookies.get(cookieNames[0])?.value;
  const refresh = request.cookies.get(cookieNames[1])?.value;
  const auth = client(url, key);
  if (access) {
    // Verify with Auth; never authorize by decoding a browser-supplied identifier.
    const { data, error } = await auth.auth.getUser(access);
    checkAuthAvailability(error);
    if (!error && data.user) return { db: client(url, key, access), access, session: null };
  }
  if (refresh) {
    const { data, error } = await auth.auth.refreshSession({ refresh_token: refresh });
    checkAuthAvailability(error);
    if (!error && data.session) return { db: client(url, key, data.session.access_token), access: data.session.access_token, session: data.session };
    throw new RoomError(401, messages.UNAUTHORIZED[1]);
  }
  if (access) throw new RoomError(401, messages.UNAUTHORIZED[1]);
  if (!allowNew) return null;
  const { data, error } = await auth.auth.signInAnonymously();
  if (error || !data.session) throw new RoomError(503, "Could not create a player session. Check that anonymous sign-ins are enabled, or try again shortly.");
  return { db: client(url, key, data.session.access_token), access: data.session.access_token, session: data.session };
}

async function input(request: NextRequest, action: Action): Promise<Record<string, unknown>> {
  if (action === "session") return {};
  // SameSite cookies plus strict Origin checking protect cookie-authorized writes.
  // NextURL normalizes 127.0.0.1 to localhost. The actual Host header preserves
  // the browser origin; never treat these distinct cookie origins as equivalent.
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
  if (request.headers.get("origin") !== expectedOrigin) throw new RoomError(403, "This request must come from the room page.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new RoomError(415, "Send room requests as JSON.");
  if (Number(request.headers.get("content-length")) > 1024) throw new RoomError(413, "The room request is too large.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1024) {
          await reader.cancel();
          throw new RoomError(413, "The room request is too large.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { throw new RoomError(400, "Invalid room request."); }
  const fields: string[] = { create: ["name"], join: ["name", "code"], ready: ["ready"], heartbeat: [], theme: ["themeId"] }[action];
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(key => !fields.includes(key))) {
    throw new RoomError(400, "Unexpected room request fields. Player identity comes from your session.");
  }
  if (action === "create" || action === "join") {
    if (typeof body.name !== "string" || !body.name.trim() || Array.from(body.name.trim()).length > 32 || /[\u0000-\u001f\u007f]/.test(body.name)) failDatabase("INVALID_NAME");
    body.name = body.name.trim();
  }
  if (action === "join") {
    if (typeof body.code !== "string" || !/^[A-HJ-NP-Z2-9]{6}$/.test(body.code.trim().toUpperCase())) failDatabase("INVALID_CODE");
    body.code = body.code.trim().toUpperCase();
  }
  if (action === "ready" && typeof body.ready !== "boolean") failDatabase("INVALID_READY");
  if (action === "theme" && !isThemeId(body.themeId)) failDatabase("INVALID_THEME");
  return body;
}

function setSession(response: NextResponse, session: Session, secure: boolean) {
  for (const [index, value] of [session.access_token, session.refresh_token].entries()) {
    response.cookies.set(cookieNames[index], value, { httpOnly: true, secure, sameSite: "strict", path: "/api/rooms", maxAge: 60 * 60 * 24 * 7 });
  }
}

export async function roomRoute(request: NextRequest, action: Action) {
  let renewed: Session | null = null;
  let response: NextResponse;
  try {
    const body = await input(request, action);
    const { url, key } = config();
    const auth = await identity(request, url, key, action === "create" || action === "join");
    if (!auth) {
      if (action !== "session") failDatabase("UNAUTHORIZED");
      response = NextResponse.json({ room: null });
    } else {
      renewed = auth.session;
      const rpc: Record<Action, [string, Record<string, unknown>]> = {
        session: ["get_quarrel_room", {}],
        create: ["create_quarrel_room", { p_name: body.name }],
        join: ["join_quarrel_room", { p_name: body.name, p_code: body.code }],
        ready: ["set_quarrel_ready", { p_ready: body.ready }],
        heartbeat: ["heartbeat_quarrel_room", {}],
        theme: ["set_quarrel_theme", { p_theme_id: body.themeId }],
      };
      const [name, params] = rpc[action];
      const { data, error } = await (auth.db as SupabaseClient).rpc(name, params);
      if (error) failDatabase(error.message);
      response = NextResponse.json({ room: data, ...(data ? { realtime: { url, key, accessToken: auth.access } } : {}) });
    }
  } catch (error) {
    const known = error instanceof RoomError;
    response = NextResponse.json({ error: known ? error.message : "The room service is temporarily unavailable. Please try again." }, { status: known ? error.status : 503 });
    if (known && error.status === 401) {
      for (const name of cookieNames) response.cookies.set(name, "", { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/api/rooms", maxAge: 0 });
    }
  }
  // Preserve newly issued identity even on a full/invalid-room error so retries
  // do not allocate an additional anonymous account or lose a refreshed session.
  if (renewed) setSession(response, renewed, request.nextUrl.protocol === "https:");
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Vary", "Cookie");
  return response;
}
