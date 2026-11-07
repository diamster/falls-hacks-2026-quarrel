-- Stage 3: six server-timed turns, without AI, adjudication or reset/rematch.
-- Public room changes are invalidation signals ONLY. Keeping all argument text
-- in an unexposed, ungranted schema prevents Postgres Changes from bypassing the
-- opening-round concealment enforced by the member snapshot.
alter table public.quarrel_rooms add column debate_version bigint not null default 0;

create table quarrel_private.debates (
  room_id uuid primary key references public.quarrel_rooms(id) on delete cascade,
  phase text not null default 'setup' check (phase in ('setup', 'opening', 'rebuttal', 'questions', 'verdict')),
  topic text check (char_length(topic) between 1 and 240),
  position_a text check (char_length(position_a) between 1 and 160),
  position_b text check (char_length(position_b) between 1 and 160),
  revision integer not null default 0 check (revision >= 0),
  approved_a boolean not null default false,
  approved_b boolean not null default false,
  change_request text check (char_length(change_request) between 1 and 240),
  turn_index smallint check (turn_index between 0 and 5),
  turn_deadline timestamptz,
  started_at timestamptz,
  questions jsonb not null default '[]'::jsonb,
  constraint debate_turn_state check (
    (phase = 'setup' and turn_index is null and turn_deadline is null and started_at is null)
    or (phase = 'opening' and turn_index is not null and turn_index in (0, 1) and turn_deadline is not null and started_at is not null)
    or (phase = 'rebuttal' and turn_index is not null and turn_index in (2, 3) and turn_deadline is not null and started_at is not null)
    or (phase = 'questions' and turn_index is not null and turn_index in (4, 5) and turn_deadline is not null and started_at is not null)
    or (phase = 'verdict' and turn_index is null and turn_deadline is null and started_at is not null)
  )
);

create table quarrel_private.debate_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references quarrel_private.debates(room_id) on delete cascade,
  revision integer not null check (revision > 0),
  turn_index smallint not null check (turn_index between 0 and 5),
  slot text not null check (slot = case when turn_index % 2 = 0 then 'A' else 'B' end),
  phase text not null check (phase = case when turn_index < 2 then 'opening' when turn_index < 4 then 'rebuttal' else 'questions' end),
  text text,
  submitted_at timestamptz,
  status text not null check (status in ('submitted', 'expired')),
  unique (room_id, revision, turn_index),
  constraint debate_entry_content check (
    (status = 'submitted' and text is not null and char_length(text) between 1 and 2000 and submitted_at is not null)
    or (status = 'expired' and text is null and submitted_at is null)
  )
);

alter table quarrel_private.debates enable row level security;
alter table quarrel_private.debate_entries enable row level security;
revoke all on quarrel_private.debates, quarrel_private.debate_entries from public, anon, authenticated;
-- No direct-read policies, publication, browser writes, or secret-key bypass.

-- Every stage-3 transaction locks room first, then its private state/player rows.
-- Existing join/theme RPCs already take the same room lock. Ready/heartbeat call
-- get_quarrel_room before their player UPDATE and therefore share that order.
create function quarrel_private.lock_member_room() returns public.quarrel_rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_room public.quarrel_rooms;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select room_id into v_room_id from public.quarrel_players where user_id = v_uid;
  if not found then return null; end if;
  select * into v_room from public.quarrel_rooms where id = v_room_id for update;
  if not found then return null; end if;
  if v_room.expires_at <= clock_timestamp() then raise exception 'ROOM_EXPIRED'; end if;
  if not exists (select 1 from public.quarrel_players where room_id = v_room.id and user_id = v_uid) then
    return null;
  end if;
  -- Lazy initialization supports existing Stage 2 rooms and the existing create
  -- RPC without changing either room capacity or authentication behavior.
  insert into quarrel_private.debates(room_id) values(v_room.id) on conflict (room_id) do nothing;
  return v_room;
end;
$$;

-- Internal caller holds the room lock. Completion advances exactly one turn;
-- the supplied time is the accepted submission time OR the expired deadline.
create function quarrel_private.complete_debate_turn(p_room_id uuid, p_completed_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare v_next integer;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select turn_index + 1 into v_next from quarrel_private.debates where room_id = p_room_id;
  if v_next = 6 then
    update quarrel_private.debates set phase = 'verdict', turn_index = null, turn_deadline = null where room_id = p_room_id;
  else
    update quarrel_private.debates set turn_index = v_next,
      phase = case when v_next < 2 then 'opening' when v_next < 4 then 'rebuttal' else 'questions' end,
      turn_deadline = p_completed_at + case when v_next < 4 then interval '45 seconds' else interval '30 seconds' end
      where room_id = p_room_id;
  end if;
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = p_room_id;
end;
$$;

-- No cron dependency. A member GET, heartbeat or advance persists every missed
-- deadline. Anchoring each timeout to its old deadline prevents offline clients
-- or delayed requests from extending the total debate duration.
create function quarrel_private.reconcile_debate(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_debate quarrel_private.debates;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  loop
    select * into v_debate from quarrel_private.debates where room_id = p_room_id;
    exit when v_debate.turn_deadline is null or v_debate.turn_deadline > v_now;
    insert into quarrel_private.debate_entries(room_id, revision, turn_index, slot, phase, status)
      values (p_room_id, v_debate.revision, v_debate.turn_index,
        case when v_debate.turn_index % 2 = 0 then 'A' else 'B' end, v_debate.phase, 'expired');
    perform quarrel_private.complete_debate_turn(p_room_id, v_debate.turn_deadline);
  end loop;
end;
$$;

revoke all on function quarrel_private.lock_member_room(),
  quarrel_private.complete_debate_turn(uuid, timestamptz),
  quarrel_private.reconcile_debate(uuid) from public, anon, authenticated;

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
  return jsonb_build_object('id', v_room.id, 'code', v_room.code,
    'expiresAt', v_room.expires_at, 'you', v_slot, 'players', v_players,
    'bothReady', v_both_ready, 'themeId', v_room.theme_id,
    'themeLocked', v_room.theme_locked, 'mode', 'solo', 'capacity', 2,
    'debate', jsonb_build_object(
      'phase', v_debate.phase, 'topic', v_debate.topic, 'positionA', v_debate.position_a,
      'positionB', v_debate.position_b, 'revision', v_debate.revision,
      'approvedA', v_debate.approved_a, 'approvedB', v_debate.approved_b,
      'changeRequest', v_debate.change_request,
      'activeSlot', case when v_debate.turn_index is null then null when v_debate.turn_index % 2 = 0 then 'A' else 'B' end,
      'turnIndex', v_debate.turn_index, 'turnDeadline', v_debate.turn_deadline,
      'serverNow', v_now, 'startedAt', v_debate.started_at,
      'history', v_history, 'questions', v_debate.questions));
end;
$$;

-- Readiness is a lobby decision. Once started, it cannot be toggled to change
-- the accepted participants or imply that running deadlines should pause.
create or replace function public.set_quarrel_ready(p_ready boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quarrel_rooms;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_ready is null then raise exception 'INVALID_READY'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if (select phase from quarrel_private.debates where room_id = v_room.id) <> 'setup' then raise exception 'DEBATE_STARTED'; end if;
  update public.quarrel_players set ready = p_ready, last_seen = clock_timestamp() where user_id = auth.uid();
  return public.get_quarrel_room();
end;
$$;

create function public.propose_quarrel_debate(p_topic text, p_position_a text, p_position_b text, p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.quarrel_rooms;
  v_debate quarrel_private.debates;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if (select slot from public.quarrel_players where user_id = auth.uid()) <> 'A' then raise exception 'HOST_ONLY'; end if;
  select * into v_debate from quarrel_private.debates where room_id = v_room.id;
  if v_debate.phase <> 'setup' then raise exception 'DEBATE_STARTED'; end if;
  if p_revision is null or p_revision <> v_debate.revision then raise exception 'STALE_REVISION'; end if;
  if p_topic is null or char_length(btrim(p_topic)) not between 1 and 240 or p_topic ~ '[[:cntrl:]]' then
    raise exception 'INVALID_TOPIC';
  end if;
  if p_position_a is null or p_position_b is null
    or char_length(btrim(p_position_a)) not between 1 and 160
    or char_length(btrim(p_position_b)) not between 1 and 160
    or p_position_a ~ '[[:cntrl:]]' or p_position_b ~ '[[:cntrl:]]'
    or lower(btrim(p_position_a)) = lower(btrim(p_position_b)) then raise exception 'INVALID_POSITION'; end if;
  update quarrel_private.debates set topic = btrim(p_topic), position_a = btrim(p_position_a), position_b = btrim(p_position_b),
    revision = revision + 1, approved_a = true, approved_b = false, change_request = null where room_id = v_room.id;
  update public.quarrel_players set ready = false where room_id = v_room.id;
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create function public.approve_quarrel_debate(p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.quarrel_rooms;
  v_debate quarrel_private.debates;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_debate from quarrel_private.debates where room_id = v_room.id;
  if v_debate.phase <> 'setup' then raise exception 'DEBATE_STARTED'; end if;
  if p_revision is null or p_revision <> v_debate.revision then raise exception 'STALE_REVISION'; end if;
  if v_debate.topic is null then raise exception 'DEBATE_NOT_READY'; end if;
  if v_debate.change_request is not null then raise exception 'CHANGES_REQUESTED'; end if;
  if (select slot from public.quarrel_players where user_id = auth.uid()) = 'A' then
    update quarrel_private.debates set approved_a = true where room_id = v_room.id;
  else
    update quarrel_private.debates set approved_b = true where room_id = v_room.id;
  end if;
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create function public.request_quarrel_debate_changes(p_message text, p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.quarrel_rooms;
  v_debate quarrel_private.debates;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if (select slot from public.quarrel_players where user_id = auth.uid()) <> 'B' then raise exception 'GUEST_ONLY'; end if;
  select * into v_debate from quarrel_private.debates where room_id = v_room.id;
  if v_debate.phase <> 'setup' then raise exception 'DEBATE_STARTED'; end if;
  if p_revision is null or p_revision <> v_debate.revision then raise exception 'STALE_REVISION'; end if;
  if v_debate.topic is null then raise exception 'DEBATE_NOT_READY'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 240 or p_message ~ '[[:cntrl:]]' then
    raise exception 'INVALID_CHANGE_REQUEST';
  end if;
  update quarrel_private.debates set change_request = btrim(p_message), approved_b = false where room_id = v_room.id;
  update public.quarrel_players set ready = false where room_id = v_room.id;
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create function public.start_quarrel_debate(p_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.quarrel_rooms;
  v_debate quarrel_private.debates;
  v_now timestamptz;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if (select slot from public.quarrel_players where user_id = auth.uid()) <> 'A' then raise exception 'HOST_ONLY'; end if;
  select * into v_debate from quarrel_private.debates where room_id = v_room.id;
  if v_debate.phase <> 'setup' then raise exception 'DEBATE_STARTED'; end if;
  if p_revision is null or p_revision <> v_debate.revision then raise exception 'STALE_REVISION'; end if;
  v_now := clock_timestamp();
  if v_debate.topic is null or v_debate.position_a is null or v_debate.position_b is null
    or not v_debate.approved_a or not v_debate.approved_b or v_debate.change_request is not null
    or not (select count(*) = 2 and bool_and(ready and last_seen > v_now - interval '35 seconds')
      from public.quarrel_players where room_id = v_room.id) then raise exception 'DEBATE_NOT_READY'; end if;
  update quarrel_private.debates set phase = 'opening', turn_index = 0, turn_deadline = v_now + interval '45 seconds', started_at = v_now,
    questions = '[{"slot":"A","id":"clarify-position","text":"What evidence best supports your position, and what could change your mind?","source":"placeholder"},{"slot":"B","id":"address-counterpoint","text":"What is the strongest counterpoint to your position, and how do you address it?","source":"placeholder"}]'::jsonb
    where room_id = v_room.id;
  update public.quarrel_rooms set theme_locked = true, debate_version = debate_version + 1 where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create function public.submit_quarrel_argument(p_text text, p_revision integer, p_turn_index integer) returns jsonb
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

create function public.advance_quarrel_debate(p_revision integer, p_turn_index integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.quarrel_rooms;
  v_debate quarrel_private.debates;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_debate from quarrel_private.debates where room_id = v_room.id;
  if p_revision is null or p_revision <> v_debate.revision then raise exception 'STALE_REVISION'; end if;
  if p_turn_index is null or p_turn_index not between 0 and 5 then raise exception 'STALE_TURN'; end if;
  if v_debate.phase = 'setup' then raise exception 'DEBATE_NOT_STARTED'; end if;
  -- Index is advisory here: duplicate timer requests return current state. It
  -- never authorizes skipping a turn; only the database deadline does that.
  return public.get_quarrel_room();
end;
$$;

-- Existing get/heartbeat/ready grants survive CREATE OR REPLACE. Reassert get's
-- permissions and explicitly close all newly created RPCs before granting only
-- authenticated callers. Identity and room membership are checked inside each.
revoke all on function public.get_quarrel_room(),
  public.propose_quarrel_debate(text, text, text, integer),
  public.approve_quarrel_debate(integer), public.request_quarrel_debate_changes(text, integer),
  public.start_quarrel_debate(integer), public.submit_quarrel_argument(text, integer, integer),
  public.advance_quarrel_debate(integer, integer) from public, anon, authenticated;
grant execute on function public.get_quarrel_room(),
  public.propose_quarrel_debate(text, text, text, integer),
  public.approve_quarrel_debate(integer), public.request_quarrel_debate_changes(text, integer),
  public.start_quarrel_debate(integer), public.submit_quarrel_argument(text, integer, integer),
  public.advance_quarrel_debate(integer, integer) to authenticated;
