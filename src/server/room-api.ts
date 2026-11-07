import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { after, NextRequest, NextResponse } from "next/server";
import { getTheme, isThemeId } from "@/themes";
import { judgeServerConfig, processJudgeWork } from "./judge-worker";

type Action = "session" | "create" | "join" | "ready" | "heartbeat" | "theme" | "propose" | "approve" | "changes" | "start" | "argument" | "advance" | "judge";
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
  HOST_ONLY: [403, "Only Player A can perform this host action."],
  THEME_LOCKED: [409, "The room theme is locked."],
  INVALID_TOPIC: [400, "Enter a topic between 1 and 240 characters."],
  INVALID_POSITION: [400, "Enter two distinct opposing positions, each between 1 and 160 characters."],
  INVALID_CHANGE_REQUEST: [400, "Describe the requested change in 1 to 240 characters."],
  INVALID_ARGUMENT: [400, "Enter an argument between 1 and 2,000 characters."],
  INVALID_REVISION: [400, "The topic revision is invalid. Refresh the room."],
  INVALID_TURN: [400, "The turn is invalid. Refresh the room."],
  STALE_REVISION: [409, "The topic changed. Review the latest proposal before continuing."],
  STALE_TURN: [409, "That turn has ended. The room is moving to the next turn."],
  DEBATE_STARTED: [409, "The debate has started. Its topic and positions are locked."],
  DEBATE_NOT_STARTED: [409, "Both players must agree and be ready before the debate starts."],
  DEBATE_FINISHED: [409, "All debate turns are complete."],
  DEBATE_COMPLETE: [409, "All debate turns are complete."],
  TOPIC_NOT_APPROVED: [409, "Both players must approve the topic and their opposing positions."],
  CHANGES_REQUESTED: [409, "Player A must update the proposal before it can be approved."],
  PLAYERS_NOT_READY: [409, "Both players must be connected and ready."],
  GUEST_ONLY: [403, "Only Player B can request changes to this proposal."],
  NOT_YOUR_TURN: [403, "Wait for your turn before submitting."],
  TURN_EXPIRED: [409, "Your turn expired. The room is moving to the next turn."],
  DUPLICATE_SUBMISSION: [409, "This turn already has a submitted argument."],
  ALREADY_SUBMITTED: [409, "This turn already has a submitted argument."],
  DEBATE_NOT_READY: [409, "Both players must approve the topic and their positions, then be connected and ready."],
  JUDGE_NOT_CONFIGURED: [503, "The judge service needs its server configuration. Your room is saved."],
  INVALID_JUDGE_MESSAGE: [400, "Enter a judge message between 1 and 600 characters."],
  INVALID_REQUEST_KEY: [400, "This judge message needs a valid request ID."],
  JUDGE_LIMIT_REACHED: [429, "You have used your judge messages for this turn."],
  JUDGE_RATE_LIMITED: [429, "Wait a few seconds before asking the judge again."],
  JUDGE_BUSY: [409, "The judge is answering a message. Please wait."],
  JUDGE_NOT_ENABLED: [409, "This saved debate predates the interactive judge. Start a new room to use it."],
  QUESTIONS_PENDING: [409, "The judge is preparing both questions. Your answer timer has not started."],
  THEME_CHANGED: [409, "The room theme changed. Review it and start again."],
  JUDGE_SERVER_UNAUTHORIZED: [503, "The judge service needs its server configuration. Your room is saved."],
  INVALID_JUDGE_CONFIG: [503, "The judge service needs its server configuration. Your room is saved."],
  JUDGE_UNAVAILABLE: [409, "This saved debate predates the interactive judge. Start a new room to use it."],
  INVALID_JUDGE_REQUEST: [400, "This judge message needs a valid request ID."],
  JUDGE_REQUEST_CONFLICT: [409, "That request ID belongs to a different message. Send a new message."],
  JUDGE_PREPARING_QUESTIONS: [409, "The judge is preparing both questions. Your answer timer has not started."],
};

class RoomError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RoomError(503, "Rooms are not configured yet. Complete the Supabase setup in the README, then restart the app.");
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
  const maxBytes = action === "argument" ? 16_384 : action === "judge" ? 8192 : action === "propose" ? 4096 : action === "changes" ? 2048 : 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RoomError(413, "The room request is too large.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
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
  const fields: string[] = {
    create: ["name"], join: ["name", "code"], ready: ["ready"], heartbeat: [], theme: ["themeId"],
    propose: ["topic", "positionA", "positionB", "revision"], approve: ["revision"],
    changes: ["message", "revision"], start: ["revision"], argument: ["text", "revision", "turnIndex"], advance: ["revision", "turnIndex"],
    judge: ["text", "revision", "turnIndex", "requestKey"],
  }[action];
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
  if (["propose", "approve", "changes", "start", "argument", "advance", "judge"].includes(action)) {
    if (!Number.isInteger(body.revision) || (body.revision as number) < 0 || (body.revision as number) > 2_147_483_646) failDatabase("INVALID_REVISION");
  }
  function boundedText(field: string, max: number, error: string, multiline = false) {
    const value = body[field];
    const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
    if (typeof value !== "string" || !value.trim() || Array.from(value.trim()).length > max || controls.test(value)) failDatabase(error);
    body[field] = value.trim();
  }
  if (action === "propose") {
    boundedText("topic", 240, "INVALID_TOPIC");
    boundedText("positionA", 160, "INVALID_POSITION");
    boundedText("positionB", 160, "INVALID_POSITION");
    if ((body.positionA as string).toLowerCase() === (body.positionB as string).toLowerCase()) failDatabase("INVALID_POSITION");
  }
  if (action === "changes") boundedText("message", 240, "INVALID_CHANGE_REQUEST");
  if (action === "argument") boundedText("text", 2000, "INVALID_ARGUMENT", true);
  if (action === "judge") {
    boundedText("text", 600, "INVALID_JUDGE_MESSAGE", true);
    if (typeof body.requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestKey)) failDatabase("INVALID_REQUEST_KEY");
  }
  if (action === "argument" || action === "advance" || action === "judge") {
    if (!Number.isInteger(body.turnIndex) || (body.turnIndex as number) < 0 || (body.turnIndex as number) > 5) failDatabase("INVALID_TURN");
  }
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
      const judge = judgeServerConfig();
      if ((action === "start" || action === "judge") && !judge.serverKey) failDatabase("JUDGE_NOT_CONFIGURED");
      const rpc: Record<Action, [string, Record<string, unknown>]> = {
        session: ["get_quarrel_room", {}],
        create: ["create_quarrel_room", { p_name: body.name }],
        join: ["join_quarrel_room", { p_name: body.name, p_code: body.code }],
        ready: ["set_quarrel_ready", { p_ready: body.ready }],
        heartbeat: ["heartbeat_quarrel_room", {}],
        theme: ["set_quarrel_theme", { p_theme_id: body.themeId }],
        propose: ["propose_quarrel_debate", { p_topic: body.topic, p_position_a: body.positionA, p_position_b: body.positionB, p_revision: body.revision }],
        approve: ["approve_quarrel_debate", { p_revision: body.revision }],
        changes: ["request_quarrel_debate_changes", { p_message: body.message, p_revision: body.revision }],
        start: ["start_quarrel_judged_debate", { p_revision: body.revision, p_server_key: judge.serverKey, p_mode: judge.mode, p_message_limit: judge.messageLimit }],
        argument: ["submit_quarrel_argument", { p_text: body.text, p_revision: body.revision, p_turn_index: body.turnIndex }],
        advance: ["advance_quarrel_debate", { p_revision: body.revision, p_turn_index: body.turnIndex }],
        judge: ["begin_quarrel_judge_message", { p_text: body.text, p_revision: body.revision, p_turn_index: body.turnIndex, p_request_key: body.requestKey, p_server_key: judge.serverKey }],
      };
      const [name, params] = rpc[action];
      if (action === "start") {
        const current = await auth.db.rpc("get_quarrel_room");
        if (current.error) failDatabase(current.error.message);
        if (!current.data) failDatabase("ROOM_NOT_FOUND");
        const theme = getTheme(current.data.themeId);
        params.p_lines = { ...theme.judge.debateDialogue, themeId: theme.id };
      }
      const { data, error } = await (auth.db as SupabaseClient).rpc(name, params);
      if (error) failDatabase(error.message);
      if (data?.judge?.needsWork && judge.serverKey) {
        // The response exposes only the persisted pending job. Work survives the
        // response lifecycle; a database claim prevents refreshes duplicating it.
        after(() => processJudgeWork(auth.db, judge.serverKey).then(() => {}));
      }
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
