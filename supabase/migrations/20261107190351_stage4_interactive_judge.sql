-- Stage 4: one room-scoped judge engine. No LLM can mutate official turns.
-- The application worker uses the verified player JWT plus a separate random
-- server capability; its SHA-256 digest is configured out of band. This is NOT
-- a Supabase service-role key and does not grant direct table access.
create table quarrel_private.judge_settings (
  singleton boolean primary key default true check (singleton),
  key_hash bytea check (key_hash is null or octet_length(key_hash) = 32)
);
insert into quarrel_private.judge_settings(singleton, key_hash) values (true, null);
alter table quarrel_private.judge_settings enable row level security;
revoke all on quarrel_private.judge_settings from public, anon, authenticated;

alter table quarrel_private.debates
  add column judge_enabled boolean not null default false,
  add column judge_mode text not null default 'demo' check (judge_mode in ('ai', 'demo')),
  add column judge_message_limit smallint not null default 2 check (judge_message_limit between 1 and 5),
  add column judge_lines jsonb not null default '{}'::jsonb,
  add column questions_pending boolean not null default false;
-- Only the inter-round preparation interval has no player deadline. The full
-- 30-second answer clock starts when both validated questions are persisted.
alter table quarrel_private.debates drop constraint debate_turn_state;
alter table quarrel_private.debates add constraint debate_turn_state check (
  (phase = 'setup' and turn_index is null and turn_deadline is null and started_at is null and not questions_pending)
  or (phase = 'opening' and turn_index in (0,1) and turn_index is not null and turn_deadline is not null and started_at is not null and not questions_pending)
  or (phase = 'rebuttal' and turn_index in (2,3) and turn_index is not null and turn_deadline is not null and started_at is not null and not questions_pending)
  or (phase = 'questions' and turn_index in (4,5) and turn_index is not null and started_at is not null and
    ((not questions_pending and turn_deadline is not null) or (judge_enabled and questions_pending and turn_index = 4 and turn_deadline is null)))
  or (phase = 'verdict' and turn_index is null and turn_deadline is null and started_at is not null and not questions_pending)
);

create table quarrel_private.judge_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references quarrel_private.debates(room_id) on delete cascade,
  revision integer not null check (revision > 0),
  kind text not null check (kind in ('introduction','transition','chat','questions')),
  event_key text not null,
  slot text check (slot in ('A','B')),
  turn_index smallint check (turn_index between 0 and 5),
  requested_by uuid,
  request_key uuid,
  player_text text check (player_text is null or char_length(player_text) between 1 and 600),
  text text check (text is null or char_length(text) between 1 and 1800),
  status text not null check (status in ('pending','complete')),
  source text not null check (source in ('ai','demo','fallback','scripted')),
  reaction text not null default 'speaking' check (reaction in ('speaking','questioning','surprised','listening')),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  claimed_at timestamptz,
  deadline_at timestamptz,
  unique (room_id, revision, event_key),
  unique (room_id, revision, requested_by, request_key),
  constraint judge_message_state check (
    (status = 'pending' and kind in ('chat','questions') and text is null and completed_at is null and deadline_at is not null)
    or (status = 'complete' and text is not null and completed_at is not null)
  ),
  constraint judge_chat_identity check (
    (kind = 'chat' and slot is not null and turn_index is not null and requested_by is not null and request_key is not null and player_text is not null)
    or (kind <> 'chat' and requested_by is null and request_key is null and player_text is null)
  )
);
create index judge_messages_pending on quarrel_private.judge_messages(room_id, created_at) where status = 'pending';
alter table quarrel_private.judge_messages enable row level security;
revoke all on quarrel_private.judge_messages from public, anon, authenticated;
-- No new table enters the publication. Only debate_version is broadcast.

create function quarrel_private.assert_judge_server(p_server_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_server_key is null or char_length(p_server_key) not between 32 and 512
    or not exists(select 1 from quarrel_private.judge_settings where singleton and key_hash = sha256(convert_to(p_server_key, 'UTF8'))) then
    raise exception 'JUDGE_SERVER_UNAUTHORIZED';
  end if;
end;
$$;

create function quarrel_private.judge_message_json(p_message quarrel_private.judge_messages) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', p_message.id, 'kind', p_message.kind, 'slot', p_message.slot,
    'turnIndex', p_message.turn_index, 'playerText', p_message.player_text, 'text', p_message.text,
    'status', p_message.status, 'source', p_message.source, 'reaction', p_message.reaction,
    'createdAt', p_message.created_at, 'completedAt', p_message.completed_at);
$$;

create function quarrel_private.judge_announcement(p_room_id uuid, p_kind text, p_event_key text, p_line_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_d quarrel_private.debates; v_text text; v_a text; v_b text; v_speaker text;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_d from quarrel_private.debates where room_id = p_room_id;
  if not v_d.judge_enabled then return; end if;
  select display_name into v_a from public.quarrel_players where room_id = p_room_id and slot = 'A';
  select display_name into v_b from public.quarrel_players where room_id = p_room_id and slot = 'B';
  v_speaker := case when v_d.turn_index % 2 = 0 then v_a else v_b end;
  v_text := coalesce(v_d.judge_lines->>p_line_key, 'Both perspectives will receive the same care.');
  v_text := replace(replace(replace(replace(v_text, '{speaker}', coalesce(v_speaker, 'Both players')), '{playerA}', v_a), '{playerB}', v_b), '{topic}', v_d.topic);
  insert into quarrel_private.judge_messages(room_id, revision, kind, event_key, turn_index, text, status, source, completed_at)
    values(p_room_id, v_d.revision, p_kind, p_event_key, v_d.turn_index, left(v_text,1800), 'complete', 'scripted', clock_timestamp())
    on conflict (room_id, revision, event_key) do nothing;
end;
$$;

-- Lease expiry never reissues an LLM request. It completes once with a labeled
-- deterministic fallback. The question clock starts only after persistence;
-- already-running player clocks retain their original chain offline.
create function quarrel_private.reconcile_judge(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_job quarrel_private.judge_messages; v_a text; v_b text; v_topic text; v_questions jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  for v_job in select * from quarrel_private.judge_messages where room_id = p_room_id and status = 'pending'
    and deadline_at <= clock_timestamp() order by created_at, id
  loop
    if v_job.kind = 'questions' then
      select topic into v_topic from quarrel_private.debates where room_id = p_room_id;
      select left(text,160) into v_a from quarrel_private.debate_entries where room_id = p_room_id and revision = v_job.revision and slot = 'A' and status = 'submitted' order by turn_index desc limit 1;
      select left(text,160) into v_b from quarrel_private.debate_entries where room_id = p_room_id and revision = v_job.revision and slot = 'B' and status = 'submitted' order by turn_index desc limit 1;
      v_questions := jsonb_build_array(
        jsonb_build_object('slot','A','id',v_job.id::text || '-A','source','fallback','text',case when v_a is not null then 'Player A, you said “' || v_a || '”. What evidence supports this claim, and what could change your view?' else 'Player A, what is your main reason for your position on “' || v_topic || '”, and what evidence would help us examine it?' end),
        jsonb_build_object('slot','B','id',v_job.id::text || '-B','source','fallback','text',case when v_b is not null then 'Player B, you said “' || v_b || '”. What assumption does this depend on, and how would you address the opposing position?' else 'Player B, what is your main concern about “' || v_topic || '”, and what would you need clarified about the other position?' end));
      update quarrel_private.debates set questions = v_questions, questions_pending = false,
        turn_deadline = clock_timestamp() + interval '30 seconds'
        where room_id = p_room_id and revision = v_job.revision and questions_pending;
    end if;
    update quarrel_private.judge_messages set status = 'complete', source = 'fallback',
      reaction = case when kind = 'questions' then 'questioning' else 'listening' end,
      text = case when kind = 'questions' then 'The live question service was unavailable. Two saved fallback questions are ready; each side receives the same opportunity to clarify.' else 'I could not complete that response in time. Your message is saved for both players. Please clarify the evidence or assumption you want examined; no claim has been treated as proven.' end,
      completed_at = clock_timestamp() where id = v_job.id;
    update public.quarrel_rooms set debate_version = debate_version + 1 where id = p_room_id;
  end loop;
end;
$$;

create or replace function quarrel_private.complete_debate_turn(p_room_id uuid, p_completed_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare v_next integer; v_d quarrel_private.debates;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_d from quarrel_private.debates where room_id = p_room_id;
  v_next := v_d.turn_index + 1;
  if v_next = 6 then
    update quarrel_private.debates set phase = 'verdict', turn_index = null, turn_deadline = null, questions_pending = false where room_id = p_room_id;
    perform quarrel_private.judge_announcement(p_room_id, 'transition', 'complete', 'complete');
  elsif v_next = 4 and v_d.judge_enabled then
    update quarrel_private.debates set phase = 'questions', turn_index = 4, turn_deadline = null, questions_pending = true where room_id = p_room_id;
    insert into quarrel_private.judge_messages(room_id, revision, kind, event_key, turn_index, status, source, reaction, deadline_at)
      values(p_room_id, v_d.revision, 'questions', 'questions', 4, 'pending', case when v_d.judge_mode = 'ai' then 'ai' else 'demo' end, 'questioning', p_completed_at + interval '20 seconds')
      on conflict (room_id, revision, event_key) do nothing;
  else
    update quarrel_private.debates set turn_index = v_next,
      phase = case when v_next < 2 then 'opening' when v_next < 4 then 'rebuttal' else 'questions' end,
      turn_deadline = p_completed_at + case when v_next < 4 then interval '45 seconds' else interval '30 seconds' end
      where room_id = p_room_id;
    perform quarrel_private.judge_announcement(p_room_id, 'transition', 'turn-' || v_next::text,
      case when v_next < 2 then 'opening' when v_next < 4 then 'rebuttal' else 'questions' end);
  end if;
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = p_room_id;
end;
$$;

create or replace function quarrel_private.reconcile_debate(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_debate quarrel_private.debates; v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  loop
    perform quarrel_private.reconcile_judge(p_room_id);
    select * into v_debate from quarrel_private.debates where room_id = p_room_id;
    exit when v_debate.turn_deadline is null or v_debate.turn_deadline > v_now;
    insert into quarrel_private.debate_entries(room_id, revision, turn_index, slot, phase, status)
      values(p_room_id, v_debate.revision, v_debate.turn_index, case when v_debate.turn_index % 2 = 0 then 'A' else 'B' end, v_debate.phase, 'expired');
    perform quarrel_private.complete_debate_turn(p_room_id, v_debate.turn_deadline);
  end loop;
end;
$$;

create function public.start_quarrel_judged_debate(p_revision integer, p_server_key text, p_mode text, p_message_limit integer, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quarrel_rooms; v_key text;
begin
  perform quarrel_private.assert_judge_server(p_server_key);
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_mode is null or p_mode not in ('ai','demo') or p_message_limit is null or p_message_limit not between 1 and 5
    or jsonb_typeof(p_lines) is distinct from 'object' then raise exception 'INVALID_JUDGE_CONFIG'; end if;
  foreach v_key in array array['introduction','opening','rebuttal','questions','complete'] loop
    if jsonb_typeof(p_lines->v_key) is distinct from 'string' or char_length(btrim(p_lines->>v_key)) not between 1 and 1000 then raise exception 'INVALID_JUDGE_CONFIG'; end if;
  end loop;
  if p_lines->>'themeId' is distinct from v_room.theme_id then raise exception 'THEME_CHANGED'; end if;
  -- Original function still enforces host, revision, approvals, connections and readiness.
  perform public.start_quarrel_debate(p_revision);
  update quarrel_private.debates set judge_enabled = true, judge_mode = p_mode,
    judge_message_limit = p_message_limit, judge_lines = p_lines, questions = '[]'::jsonb where room_id = v_room.id;
  perform quarrel_private.judge_announcement(v_room.id, 'introduction', 'introduction', 'introduction');
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create function public.begin_quarrel_judge_message(p_text text, p_revision integer, p_turn_index integer, p_request_key uuid, p_server_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quarrel_rooms; v_d quarrel_private.debates; v_slot text; v_old quarrel_private.judge_messages; v_now timestamptz := clock_timestamp();
begin
  perform quarrel_private.assert_judge_server(p_server_key);
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  perform quarrel_private.reconcile_debate(v_room.id);
  select * into v_d from quarrel_private.debates where room_id = v_room.id;
  select slot into v_slot from public.quarrel_players where user_id = auth.uid();
  if not v_d.judge_enabled then raise exception 'JUDGE_UNAVAILABLE'; end if;
  if p_revision is null or p_revision <> v_d.revision then raise exception 'STALE_REVISION'; end if;
  if p_request_key is null then raise exception 'INVALID_JUDGE_REQUEST'; end if;
  if p_text is null or char_length(btrim(p_text)) not between 1 and 600 or btrim(p_text) !~ '[^[:space:]]' or translate(p_text, E'\n\r\t', '') ~ '[[:cntrl:]]' then raise exception 'INVALID_JUDGE_MESSAGE'; end if;
  select * into v_old from quarrel_private.judge_messages where room_id = v_room.id and revision = p_revision and requested_by = auth.uid() and request_key = p_request_key;
  if found then
    if v_old.player_text <> btrim(p_text) or v_old.turn_index is distinct from p_turn_index then raise exception 'JUDGE_REQUEST_CONFLICT'; end if;
    return public.get_quarrel_room(); -- Idempotent recovery after its original turn ended.
  end if;
  if v_d.phase = 'setup' then raise exception 'DEBATE_NOT_STARTED'; end if;
  if v_d.phase = 'verdict' then raise exception 'DEBATE_COMPLETE'; end if;
  if v_d.questions_pending then raise exception 'JUDGE_PREPARING_QUESTIONS'; end if;
  if p_turn_index is null or p_turn_index <> v_d.turn_index then raise exception 'STALE_TURN'; end if;
  if v_slot <> (case when v_d.turn_index % 2 = 0 then 'A' else 'B' end) then raise exception 'NOT_YOUR_TURN'; end if;
  if v_d.turn_deadline is null or v_d.turn_deadline <= clock_timestamp() then raise exception 'TURN_EXPIRED'; end if;
  if exists(select 1 from quarrel_private.judge_messages where room_id = v_room.id and status = 'pending') then raise exception 'JUDGE_BUSY'; end if;
  if (select count(*) from quarrel_private.judge_messages where room_id = v_room.id and revision = p_revision and turn_index = p_turn_index and requested_by = auth.uid()) >= v_d.judge_message_limit then raise exception 'JUDGE_LIMIT_REACHED'; end if;
  if exists(select 1 from quarrel_private.judge_messages where room_id = v_room.id and requested_by = auth.uid() and created_at > clock_timestamp() - interval '3 seconds') then raise exception 'JUDGE_RATE_LIMITED'; end if;
  insert into quarrel_private.judge_messages(room_id, revision, kind, event_key, slot, turn_index, requested_by, request_key, player_text, status, source, deadline_at)
    values(v_room.id, p_revision, 'chat', 'chat-' || auth.uid()::text || '-' || p_request_key::text, v_slot, p_turn_index, auth.uid(), p_request_key, btrim(p_text), 'pending', case when v_d.judge_mode = 'ai' then 'ai' else 'demo' end, clock_timestamp() + interval '20 seconds');
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create function public.claim_quarrel_judge_work(p_server_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quarrel_rooms; v_d quarrel_private.debates; v_job quarrel_private.judge_messages; v_args jsonb; v_players jsonb; v_history jsonb;
begin
  perform quarrel_private.assert_judge_server(p_server_key);
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  perform quarrel_private.reconcile_debate(v_room.id);
  select * into v_d from quarrel_private.debates where room_id = v_room.id;
  -- Only one model call per room at a time, regardless of concurrent workers.
  if exists(select 1 from quarrel_private.judge_messages where room_id = v_room.id and status = 'pending' and claimed_at is not null) then return null; end if;
  select * into v_job from quarrel_private.judge_messages where room_id = v_room.id and status = 'pending' and claimed_at is null order by created_at, id limit 1;
  if not found then return null; end if;
  update quarrel_private.judge_messages set claimed_at = clock_timestamp() where id = v_job.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'slot',e.slot,'phase',e.phase,'turnIndex',e.turn_index,'text',e.text,'submittedAt',e.submitted_at,'status',e.status) order by e.turn_index), '[]'::jsonb)
    into v_args from quarrel_private.debate_entries e where room_id = v_room.id and revision = v_d.revision and (e.phase <> 'opening' or v_d.phase <> 'opening');
  select jsonb_agg(jsonb_build_object('slot',slot,'name',display_name,'position',case when slot = 'A' then v_d.position_a else v_d.position_b end) order by slot)
    into v_players from public.quarrel_players where room_id = v_room.id;
  select coalesce(jsonb_agg(quarrel_private.judge_message_json(m::quarrel_private.judge_messages) order by m.created_at,m.id), '[]'::jsonb) into v_history from
    (select * from quarrel_private.judge_messages where room_id = v_room.id and revision = v_d.revision and status = 'complete' order by created_at desc,id desc limit 8) m;
  return jsonb_build_object('id',v_job.id,'mode',v_d.judge_mode,'kind',v_job.kind,'slot',v_job.slot,'turnIndex',v_job.turn_index,'playerText',v_job.player_text,
    'context',jsonb_build_object('topic',v_d.topic,'phase',v_d.phase,'themeId',v_room.theme_id,'players',v_players,'arguments',v_args,'questions',v_d.questions,'conversation',v_history));
end;
$$;

create function public.finish_quarrel_judge_work(p_id uuid, p_result jsonb, p_server_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quarrel_rooms; v_job quarrel_private.judge_messages; v_q jsonb; v_questions jsonb; v_now timestamptz;
begin
  perform quarrel_private.assert_judge_server(p_server_key);
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  perform quarrel_private.reconcile_debate(v_room.id);
  select * into v_job from quarrel_private.judge_messages where id = p_id and room_id = v_room.id;
  if not found then raise exception 'JUDGE_REQUEST_NOT_FOUND'; end if;
  if v_job.status = 'complete' then return public.get_quarrel_room(); end if;
  if v_job.claimed_at is null then raise exception 'JUDGE_REQUEST_NOT_CLAIMED'; end if;
  if jsonb_typeof(p_result) is distinct from 'object' or jsonb_typeof(p_result->'text') is distinct from 'string'
    or char_length(btrim(p_result->>'text')) not between 1 and 1800
    or p_result->>'source' is null or p_result->>'source' not in ('ai','demo','fallback')
    or p_result->>'reaction' is null or p_result->>'reaction' not in ('speaking','questioning','surprised','listening')
    or exists(select 1 from jsonb_object_keys(p_result) k where k not in ('text','source','reaction','questions')) then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
  v_now := clock_timestamp();
  if v_job.kind = 'questions' then
    if jsonb_typeof(p_result->'questions') is distinct from 'array' or jsonb_array_length(p_result->'questions') <> 2 then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
    if (select count(distinct q->>'slot') from jsonb_array_elements(p_result->'questions') q where q->>'slot' in ('A','B')) <> 2 then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
    for v_q in select value from jsonb_array_elements(p_result->'questions') loop
      if jsonb_typeof(v_q) is distinct from 'object' or jsonb_typeof(v_q->'text') is distinct from 'string' or char_length(btrim(v_q->>'text')) not between 1 and 600
        or v_q->>'source' is distinct from p_result->>'source' or exists(select 1 from jsonb_object_keys(v_q) k where k not in ('slot','text','source')) then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
    end loop;
    if lower(btrim(p_result #>> '{questions,0,text}')) = lower(btrim(p_result #>> '{questions,1,text}')) then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
    select jsonb_agg(jsonb_build_object('slot',q->>'slot','id',v_job.id::text || '-' || (q->>'slot'),'text',btrim(q->>'text'),'source',q->>'source') order by q->>'slot') into v_questions from jsonb_array_elements(p_result->'questions') q;
    update quarrel_private.debates set questions = v_questions, questions_pending = false, turn_deadline = v_now + interval '30 seconds'
      where room_id = v_room.id and revision = v_job.revision and questions_pending;
  elsif p_result ? 'questions' then raise exception 'INVALID_JUDGE_RESPONSE';
  end if;
  update quarrel_private.judge_messages set text = btrim(p_result->>'text'), reaction = p_result->>'reaction', source = p_result->>'source', status = 'complete', completed_at = v_now where id = v_job.id;
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create or replace function public.get_quarrel_room() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_room public.quarrel_rooms;
  v_debate quarrel_private.debates;
  v_slot text;
  v_players jsonb;
  v_both_ready boolean;
  v_history jsonb;
  v_now timestamptz;
  v_judge jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then return null; end if;
  perform quarrel_private.reconcile_debate(v_room.id);
  select * into v_debate from quarrel_private.debates where room_id = v_room.id;
  select slot into v_slot from public.quarrel_players where user_id = auth.uid();
  v_now := clock_timestamp();
  select jsonb_agg(jsonb_build_object(
      'slot', p.slot, 'name', p.display_name, 'ready', p.ready,
      'connected', p.last_seen > v_now - interval '35 seconds'
    ) order by p.slot),
    count(*) = 2 and bool_and(p.ready and p.last_seen > v_now - interval '35 seconds')
    into v_players, v_both_ready from public.quarrel_players p where p.room_id = v_room.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'slot', e.slot, 'phase', e.phase, 'turnIndex', e.turn_index,
    'text', e.text, 'submittedAt', e.submitted_at, 'status', e.status
  ) order by e.turn_index), '[]'::jsonb) into v_history
    from quarrel_private.debate_entries e where e.room_id = v_room.id and e.revision = v_debate.revision
      and (e.phase <> 'opening' or e.slot = v_slot or v_debate.phase <> 'opening');
  if v_debate.judge_enabled then
    select jsonb_build_object('enabled', true, 'mode', v_debate.judge_mode,
      'messages', coalesce(jsonb_agg(quarrel_private.judge_message_json(m) order by m.created_at,m.id), '[]'::jsonb),
      'pendingRequestId', (select id from quarrel_private.judge_messages where room_id = v_room.id and status = 'pending' order by created_at,id limit 1),
      'messagesUsed', (select count(*) from quarrel_private.judge_messages where room_id = v_room.id and revision = v_debate.revision and turn_index = v_debate.turn_index and requested_by = auth.uid()),
      'maxMessagesPerTurn', v_debate.judge_message_limit,
      'needsWork', exists(select 1 from quarrel_private.judge_messages where room_id = v_room.id and status = 'pending' and claimed_at is null),
      'preparingQuestions', v_debate.questions_pending)
    into v_judge from quarrel_private.judge_messages m where m.room_id = v_room.id and m.revision = v_debate.revision;
  end if;
  return jsonb_build_object('id', v_room.id, 'code', v_room.code,
    'expiresAt', v_room.expires_at, 'you', v_slot, 'players', v_players,
    'bothReady', v_both_ready, 'themeId', v_room.theme_id,
    'themeLocked', v_room.theme_locked, 'mode', 'solo', 'capacity', 2, 'judge', v_judge,
    'debate', jsonb_build_object(
      'phase', v_debate.phase, 'topic', v_debate.topic, 'positionA', v_debate.position_a,
      'positionB', v_debate.position_b, 'revision', v_debate.revision,
      'approvedA', v_debate.approved_a, 'approvedB', v_debate.approved_b,
      'changeRequest', v_debate.change_request,
      'activeSlot', case when v_debate.turn_index is null or v_debate.questions_pending then null when v_debate.turn_index % 2 = 0 then 'A' else 'B' end,
      'turnIndex', v_debate.turn_index, 'turnDeadline', v_debate.turn_deadline,
      'serverNow', v_now, 'startedAt', v_debate.started_at,
      'history', v_history, 'questions', v_debate.questions));
end;
$$;


create or replace function public.submit_quarrel_argument(p_text text, p_revision integer, p_turn_index integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.quarrel_rooms;
  v_debate quarrel_private.debates;
  v_slot text;
  v_status text;
  v_now timestamptz;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_debate from quarrel_private.debates where room_id = v_room.id;
  select slot into v_slot from public.quarrel_players where user_id = auth.uid();
  if p_revision is null or p_revision <> v_debate.revision then raise exception 'STALE_REVISION'; end if;
  if p_turn_index is null or p_turn_index not between 0 and 5 then raise exception 'STALE_TURN'; end if;
  if v_debate.phase = 'setup' then raise exception 'DEBATE_NOT_STARTED'; end if;
  if v_slot <> (case when p_turn_index % 2 = 0 then 'A' else 'B' end) then raise exception 'NOT_YOUR_TURN'; end if;
  select status into v_status from quarrel_private.debate_entries
    where room_id = v_room.id and revision = p_revision and turn_index = p_turn_index;
  if v_status = 'submitted' then raise exception 'ALREADY_SUBMITTED'; end if;
  if v_status = 'expired' then raise exception 'TURN_EXPIRED'; end if;
  if v_debate.phase = 'verdict' then raise exception 'DEBATE_COMPLETE'; end if;
  if v_debate.questions_pending then raise exception 'JUDGE_PREPARING_QUESTIONS'; end if;
  if p_turn_index <> v_debate.turn_index then raise exception 'STALE_TURN'; end if;
  v_now := clock_timestamp();
  if v_debate.turn_deadline <= v_now then raise exception 'TURN_EXPIRED'; end if;
  if p_text is null or char_length(btrim(p_text)) not between 1 and 2000
    or btrim(p_text) !~ '[^[:space:]]' or translate(p_text, E'\n\r\t', '') ~ '[[:cntrl:]]' then
    raise exception 'INVALID_ARGUMENT';
  end if;
  insert into quarrel_private.debate_entries(room_id, revision, turn_index, slot, phase, text, submitted_at, status)
    values (v_room.id, p_revision, p_turn_index, v_slot, v_debate.phase, btrim(p_text), v_now, 'submitted');
  perform quarrel_private.complete_debate_turn(v_room.id, v_now);
  return public.get_quarrel_room();
end;
$$;


revoke all on function quarrel_private.assert_judge_server(text),
  quarrel_private.judge_message_json(quarrel_private.judge_messages),
  quarrel_private.judge_announcement(uuid,text,text,text), quarrel_private.reconcile_judge(uuid)
  from public, anon, authenticated;
revoke all on function public.start_quarrel_judged_debate(integer,text,text,integer,jsonb),
  public.begin_quarrel_judge_message(text,integer,integer,uuid,text),
  public.claim_quarrel_judge_work(text), public.finish_quarrel_judge_work(uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.start_quarrel_judged_debate(integer,text,text,integer,jsonb),
  public.begin_quarrel_judge_message(text,integer,integer,uuid,text),
  public.claim_quarrel_judge_work(text), public.finish_quarrel_judge_work(uuid,jsonb,text)
  to authenticated;
