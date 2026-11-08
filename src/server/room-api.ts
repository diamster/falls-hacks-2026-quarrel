import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { after, NextRequest, NextResponse } from "next/server";
import { getTheme, isThemeId } from "@/themes";
import { judgeServerConfig, processJudgeWork, processLawyerWork } from "./judge-worker";
import { cachedSpeech, SpeechError } from "./speech-provider";
import { attachSpeechReceipts, verifySpeechReceipt } from "./speech-receipts";

type Action = "session" | "create" | "join" | "leave" | "ready" | "heartbeat" | "theme" | "propose" | "approve" | "changes" | "start" | "argument" | "advance" | "judge"
  | "lawyerTopic" | "lawyerPosition" | "lawyerPlan" | "lawyerStart" | "lawyerSend" | "lawyerConsult" | "lawyerAdvance"
  | "resultsHistory" | "resultsAcknowledge" | "rematch" | "juryRetry" | "speech";
const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cookieNames = ["quarrel_access", "quarrel_refresh"] as const;
const messages: Record<string, [number, string]> = {
  UNAUTHORIZED: [401, "Your player session has expired. Please reload and join again."],
  ROOM_NOT_FOUND: [404, "That room does not exist. Check the six-character code."],
  ROOM_FULL: [409, "That room already has two players."],
  ROOM_CLOSED: [409, "A player has left that room. Ask for a new invitation."],
  STALE_ROOM: [409, "Your room changed in another tab. The current room is being refreshed; your action was not applied."],
  INVALID_ROOM: [400, "This action needs a valid room ID. Refresh the page."],
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
  INVALID_DURATION: [400, "Choose 2, 4, 6 or 10 minutes per player."],
  INVALID_LAWYER_POSITION: [400, "Write your own position in 1 to 600 characters."],
  INVALID_LAWYER_MESSAGE: [400, "Write a message in 1 to 600 characters."],
  LAWYER_FORMAT_REQUIRED: [409, "Create a new room to use the lawyer debate flow."],
  LEGACY_ACTION_DISABLED: [409, "This room uses the lawyer debate flow. Refresh to use its current controls."],
  LAWYER_BUSY: [409, "Your lawyer is working. Neither clock is running."],
  MESSAGE_LIMIT_REACHED: [429, "You have used all 12 official submissions for this subtopic. The clock continues until time expires."],
  CONSULTATION_LIMIT_REACHED: [429, "You have used both private consultations for this subtopic."],
  PLAN_NOT_READY: [409, "Wait for the shared subtopic plan before starting."],
  PLAN_REGENERATION_USED: [409, "The plan has already been regenerated once."],
  STALE_PLAN: [409, "The plan changed. Review the updated subtopics before starting."],
  REQUEST_CONFLICT: [409, "This request ID already belongs to another message. Submit a new request."],
  LAWYER_UNAVAILABLE: [409, "Create a new room to use the lawyer debate flow."],
  LAWYER_FLOW_REQUIRED: [409, "This room uses personal lawyers. Refresh to use its current controls."],
  LAWYER_REQUEST_CONFLICT: [409, "This request ID already belongs to another message. Submit a new request."],
  LAWYER_LIMIT_REACHED: [429, "You have used this subtopic’s allowance for that action. Your remaining writing time is unchanged."],
  INVALID_LAWYER_CONFIG: [503, "The lawyer service needs its server configuration. Your room is saved."],
  INVALID_DEBATE: [400, "Choose a valid debate record."],
  RESULTS_NOT_FOUND: [404, "That debate result is not available to this player."],
  STALE_DEBATE: [409, "This debate has changed. Refresh before trying again."],
  RESULTS_NOT_READY: [409, "The final results are not ready yet."],
  REMATCH_NOT_READY: [409, "Both players must finish this debate before requesting a rematch."],
  JURY_RETRY_NOT_READY: [409, "The jury is still processing or does not need a retry."],
  JURY_RETRY_RATE_LIMITED: [429, "Please wait before retrying the jury."],
  STALE_LAWYER_CLAIM: [409, "This processing attempt has expired. The saved debate remains available."],
};

class RoomError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RoomError(503, "Rooms are not configured yet. Complete the Supabase setup in the README, then restart the app.");
  return { url, key };
}

function client(url: string, key: string, token?: string, roomId?: string | null) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}`, ...(roomId ? { "x-quarrel-room-id": roomId } : {}) } } } : {}),
  });
}

function failDatabase(message: string): never {
  const known = messages[message];
  if (known) throw new RoomError(...known, message === "STALE_ROOM" || message === "STALE_DEBATE" ? message : undefined);
  throw new RoomError(503, "The room service is temporarily unavailable. Please try again.");
}

function checkAuthAvailability(error: { status?: number } | null) {
  // A temporary Auth outage must not delete the only credential for a reserved
  // anonymous seat. Only definitive invalid-session errors permit clearing it.
  if (error && ![400, 401, 403, 422].includes(error.status ?? 0)) {
    throw new RoomError(503, "The session service is temporarily unavailable. Your seat is saved; please try again.");
  }
}

async function identity(request: NextRequest, url: string, key: string, allowNew: boolean, roomId?: string | null) {
  const access = request.cookies.get(cookieNames[0])?.value;
  const refresh = request.cookies.get(cookieNames[1])?.value;
  const auth = client(url, key);
  if (access) {
    // Verify with Auth; never authorize by decoding a browser-supplied identifier.
    const { data, error } = await auth.auth.getUser(access);
    checkAuthAvailability(error);
    if (!error && data.user) return { db: client(url, key, access, roomId), access, session: null, userId: data.user.id };
  }
  if (refresh) {
    const { data, error } = await auth.auth.refreshSession({ refresh_token: refresh });
    checkAuthAvailability(error);
    if (!error && data.session) return { db: client(url, key, data.session.access_token, roomId), access: data.session.access_token, session: data.session, userId: data.session.user?.id };
    throw new RoomError(401, messages.UNAUTHORIZED[1]);
  }
  if (access) throw new RoomError(401, messages.UNAUTHORIZED[1]);
  if (!allowNew) return null;
  const { data, error } = await auth.auth.signInAnonymously();
  if (error || !data.session) throw new RoomError(503, "Could not create a player session. Check that anonymous sign-ins are enabled, or try again shortly.");
  return { db: client(url, key, data.session.access_token, roomId), access: data.session.access_token, session: data.session, userId: data.session.user?.id };
}

async function input(request: NextRequest, action: Action): Promise<Record<string, unknown>> {
  if (action === "session") return {};
  if (action === "resultsHistory") {
    // Read-only archives use authenticated cookies, never a public room code.
    const params = request.nextUrl.searchParams;
    const keys = [...params.keys()];
    if (keys.length > 1 || keys.some(key => key !== "debateId" && key !== "roomId")) failDatabase("INVALID_DEBATE");
    const debateId = params.get("debateId");
    const roomId = params.get("roomId");
    if ((debateId !== null && !roomIdPattern.test(debateId)) || (roomId !== null && !roomIdPattern.test(roomId))) failDatabase("INVALID_DEBATE");
    return { debateId, roomId };
  }
  // SameSite cookies plus strict Origin checking protect cookie-authorized writes.
  // NextURL normalizes 127.0.0.1 to localhost. The actual Host header preserves
  // the browser origin; never treat these distinct cookie origins as equivalent.
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
  if (request.headers.get("origin") !== expectedOrigin) throw new RoomError(403, "This request must come from the room page.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new RoomError(415, "Send room requests as JSON.");
  // The character limits below count Unicode code points, not UTF-8 bytes.
  // Keep enough bounded transport space for a full multilingual lawyer message.
  const lawyerTextAction = ["lawyerTopic", "lawyerPosition", "lawyerSend", "lawyerConsult"].includes(action);
  const maxBytes = action === "speech" ? 32_768 : action === "argument" ? 16_384 : action === "judge" || lawyerTextAction ? 8192 : action === "propose" ? 4096 : action === "changes" ? 2048 : 1024;
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
    create: ["name"], join: ["name", "code"], leave: ["roomId"], ready: ["ready"], heartbeat: [], theme: ["themeId"],
    propose: ["topic", "positionA", "positionB", "revision"], approve: ["revision"],
    changes: ["message", "revision"], start: ["revision"], argument: ["text", "revision", "turnIndex"], advance: ["revision", "turnIndex"],
    judge: ["text", "revision", "turnIndex", "requestKey"],
    lawyerTopic: ["topic", "totalSeconds", "revision"], lawyerPosition: ["position", "revision"],
    lawyerPlan: ["revision", "regenerate"], lawyerStart: ["revision", "planGeneration"], lawyerAdvance: ["revision"],
    lawyerSend: ["text", "revision", "subtopic", "requestKey"], lawyerConsult: ["text", "revision", "subtopic", "requestKey"],
    resultsAcknowledge: ["debateId"], rematch: ["debateId"], juryRetry: ["debateId"],
    speech: ["debateId", "messageId", "speechToken"],
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
  if (action === "leave" && (typeof body.roomId !== "string" || !roomIdPattern.test(body.roomId))) failDatabase("INVALID_ROOM");
  if (action === "theme" && !isThemeId(body.themeId)) failDatabase("INVALID_THEME");
  if (["resultsAcknowledge", "rematch", "juryRetry", "speech"].includes(action)
    && (typeof body.debateId !== "string" || !roomIdPattern.test(body.debateId))) failDatabase("INVALID_DEBATE");
  if (action === "speech" && (typeof body.messageId !== "string" || !roomIdPattern.test(body.messageId)
    || typeof body.speechToken !== "string" || body.speechToken.length > 32_000)) throw new RoomError(400, "Choose a saved public message for speech.");
  if (["propose", "approve", "changes", "start", "argument", "advance", "judge"].includes(action) || action.startsWith("lawyer")) {
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
  if (action === "lawyerTopic") {
    boundedText("topic", 240, "INVALID_TOPIC");
    if (![120, 240, 360, 600].includes(Number(body.totalSeconds)) || typeof body.totalSeconds !== "number") failDatabase("INVALID_DURATION");
  }
  if (action === "lawyerPosition") boundedText("position", 600, "INVALID_LAWYER_POSITION", true);
  if (action === "lawyerPlan" && typeof body.regenerate !== "boolean") throw new RoomError(400, "Choose whether to regenerate the plan.");
  if (action === "lawyerStart" && ![0, 1].includes(body.planGeneration as number)) failDatabase("STALE_PLAN");
  if (action === "lawyerSend" || action === "lawyerConsult") {
    boundedText("text", 600, "INVALID_LAWYER_MESSAGE", true);
    if (!Number.isInteger(body.subtopic) || Number(body.subtopic) < 1 || Number(body.subtopic) > 5) failDatabase("INVALID_TURN");
    if (typeof body.requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestKey)) failDatabase("INVALID_REQUEST_KEY");
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
    const archiveAction = action === "resultsHistory" || action === "resultsAcknowledge";
    const expectedRoomId = action === "session" || archiveAction ? null : request.headers.get("x-quarrel-room-id");
    if (expectedRoomId !== null && !roomIdPattern.test(expectedRoomId)) failDatabase("INVALID_ROOM");
    if ((action === "rematch" || action === "juryRetry" || action === "speech") && expectedRoomId === null) failDatabase("INVALID_ROOM");
    const { url, key } = config();
    // This is a stale-view guard, never identity: Postgres checks it under the
    // same room lock as the authorized mutation. GET recovers the current room.
    const auth = await identity(request, url, key, action === "create" || action === "join", expectedRoomId);
    if (!auth) {
      if (action !== "session") failDatabase("UNAUTHORIZED");
      response = NextResponse.json({ room: null });
    } else {
      renewed = auth.session;
      if (action === "speech") {
        if (!auth.userId) failDatabase("UNAUTHORIZED");
        const receipt = verifySpeechReceipt(body.speechToken as string, { userId: auth.userId, roomId: expectedRoomId!, debateId: body.debateId as string, messageId: body.messageId as string });
        // No room read, worker or transition: playback cannot advance clocks.
        const wav = await cachedSpeech(receipt);
        response = new NextResponse(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "X-Content-Type-Options": "nosniff" } });
      } else {
      const judge = judgeServerConfig();
      if (["start", "judge", "lawyerPlan", "juryRetry"].includes(action) && !judge.serverKey) failDatabase("JUDGE_NOT_CONFIGURED");
      const rpc: Record<Exclude<Action, "speech">, [string, Record<string, unknown>]> = {
        session: ["get_quarrel_room", {}],
        create: ["create_quarrel_lawyer_room_v2", { p_name: body.name }],
        join: ["join_quarrel_room", { p_name: body.name, p_code: body.code }],
        leave: ["leave_quarrel_room", { p_expected_room_id: body.roomId }],
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
        lawyerTopic: ["propose_quarrel_lawyer_topic", { p_topic: body.topic, p_total_seconds: body.totalSeconds, p_revision: body.revision }],
        lawyerPosition: ["set_quarrel_lawyer_position", { p_position: body.position, p_revision: body.revision }],
        lawyerPlan: ["prepare_quarrel_lawyer_plan", { p_revision: body.revision, p_regenerate: body.regenerate, p_mode: judge.mode, p_server_key: judge.serverKey }],
        lawyerStart: ["start_quarrel_lawyer_debate", { p_revision: body.revision, p_plan_generation: body.planGeneration }],
        lawyerSend: ["submit_quarrel_lawyer_argument", { p_text: body.text, p_revision: body.revision, p_subtopic: body.subtopic, p_request_key: body.requestKey }],
        lawyerConsult: ["consult_quarrel_lawyer", { p_text: body.text, p_revision: body.revision, p_subtopic: body.subtopic, p_request_key: body.requestKey }],
        lawyerAdvance: ["advance_quarrel_lawyer_debate", { p_revision: body.revision }],
        resultsHistory: body.debateId ? ["get_quarrel_lawyer_results", { p_debate_id: body.debateId }] : ["list_quarrel_lawyer_results", { p_room_id: body.roomId ?? null }],
        resultsAcknowledge: ["acknowledge_quarrel_lawyer_results", { p_debate_id: body.debateId }],
        rematch: ["request_quarrel_lawyer_rematch", { p_debate_id: body.debateId }],
        juryRetry: ["retry_quarrel_lawyer_jury", { p_debate_id: body.debateId }],
      };
      const [name, params] = rpc[action];
      if (action === "start") {
        const current = await auth.db.rpc("get_quarrel_room");
        if (current.error) failDatabase(current.error.message);
        if (!current.data) failDatabase("ROOM_NOT_FOUND");
        const theme = getTheme(current.data.themeId);
        params.p_lines = { ...theme.judge.debateDialogue, themeId: theme.id };
      }
      let { data, error } = await (auth.db as SupabaseClient).rpc(name, params);
      if (error) failDatabase(error.message);
      if (!archiveAction && data?.lawyer?.phase === "setup" && data.bothReady && data.lawyer.confirmedA && data.lawyer.confirmedB && judge.serverKey) {
        // A database reservation makes automatic planning once-per-revision,
        // even if both players' readiness and heartbeats arrive together.
        const plan = await auth.db.rpc("prepare_quarrel_lawyer_plan", { p_revision: data.lawyer.revision, p_regenerate: false, p_mode: judge.mode, p_server_key: judge.serverKey });
        if (!plan.error && plan.data) data = plan.data;
      }
      if (!archiveAction && data?.lawyer?.needsWork && judge.serverKey) after(() => processLawyerWork(auth.db, judge.serverKey).then(() => {}));
      if (!archiveAction && data?.judge?.needsWork && judge.serverKey) {
        // The response exposes only the persisted pending job. Work survives the
        // response lifecycle; a database claim prevents refreshes duplicating it.
        after(() => processJudgeWork(auth.db, judge.serverKey).then(() => {}));
      }
      if (auth.userId) {
        if (archiveAction && Array.isArray(data?.history)) data = { ...data, history: attachSpeechReceipts(data.history, { userId: auth.userId, roomId: data.roomId, debateId: data.id, themeId: data.themeId }) };
        else if (Array.isArray(data?.lawyer?.history) && data.lawyer.debateId) data = { ...data, lawyer: { ...data.lawyer, history: attachSpeechReceipts(data.lawyer.history, { userId: auth.userId, roomId: data.id, debateId: data.lawyer.debateId, themeId: data.themeId }) } };
      }
      response = NextResponse.json(action === "resultsHistory" ? { history: data } : action === "resultsAcknowledge" ? { results: data }
        : { room: data, ...(data ? { realtime: { url, key, accessToken: auth.access } } : {}) });
      }
    }
  } catch (error) {
    const known = error instanceof RoomError || error instanceof SpeechError;
    response = NextResponse.json({ error: known ? error.message : "The room service is temporarily unavailable. Please try again.", ...(known && error.code ? { code: error.code } : {}), ...(action === "speech" ? { fallbackAllowed: error instanceof SpeechError && error.fallbackAllowed } : {}) }, { status: known ? error.status : 503 });
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
