-- Stage 5. Additive: existing Stage 3/4 records, phase constraints and workers
-- remain intact. New records are private and never enter Realtime publication.
-- REVIEW THIS FILE BEFORE APPLYING TO CLOUD. No resets or data deletion.
alter table public.quarrel_rooms alter column theme_id set default 'courtroom';

create table quarrel_private.lawyer_debates (
 room_id uuid primary key references public.quarrel_rooms(id) on delete cascade,
 phase text not null default 'setup' check(phase in ('setup','planning','subtopic','summary','jury','complete')),
 topic text check(char_length(topic) between 1 and 240),
 total_seconds integer not null default 240 check(total_seconds in (120,240,360,600)),
 revision integer not null default 0 check(revision>=0),
 position_a text check(char_length(position_a) between 1 and 600),
 position_b text check(char_length(position_b) between 1 and 600),
 confirmed_a boolean not null default false, confirmed_b boolean not null default false,
 plan_ready boolean not null default false, regeneration_used boolean not null default false,
 plan_generation integer not null default 0 check(plan_generation between 0 and 1),
 mode text not null default 'demo' check(mode in ('ai','demo')),
 current_subtopic integer, state text check(state in ('composing','lawyering','consulting')),
 active_slot text check(active_slot in ('A','B')),
 turn_deadline timestamptz, summary_until timestamptz, started_at timestamptz,
 verdict jsonb,
 check((state='composing' and active_slot is not null and turn_deadline is not null)
   or (state in ('lawyering','consulting') and active_slot is not null and turn_deadline is null)
   or (state is null and active_slot is null and turn_deadline is null))
);
create table quarrel_private.lawyer_subtopics (
 room_id uuid not null references quarrel_private.lawyer_debates(room_id) on delete cascade,
 revision integer not null, generation integer not null,
 ordinal integer not null check(ordinal between 1 and 5),
 question text not null check(char_length(question) between 1 and 200),
 seconds_per_player integer not null check(seconds_per_player between 30 and 600),
 opener_slot text not null check(opener_slot in ('A','B')),
 source text not null check(source in ('ai','demo','fallback')),
 status text not null default 'pending' check(status in ('pending','active','summarizing','done')),
 remaining_ms_a bigint not null check(remaining_ms_a>=0), remaining_ms_b bigint not null check(remaining_ms_b>=0),
 primary key(room_id,revision,generation,ordinal)
);
-- Jobs are retained as the transcript; consultation rows are independently
-- owner-filtered, never included in public history or judge/jury context.
create table quarrel_private.lawyer_messages (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references quarrel_private.lawyer_debates(room_id) on delete cascade,
 revision integer not null, generation integer not null default 0,
 kind text not null check(kind in ('plan','lawyer','consult','summary','jury','announcement')),
 subtopic integer check(subtopic between 1 and 5),
 slot text check(slot in ('A','B')), requested_by uuid, request_key uuid,
 message_no integer, label text not null,
 raw_text text check(char_length(raw_text) between 1 and 600),
 text text check(char_length(text) between 1 and 2400), result jsonb,
 status text not null default 'pending' check(status in ('pending','complete')),
 source text not null check(source in ('ai','demo','fallback')),
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 claimed_at timestamptz, deadline_at timestamptz,
 unique(room_id,revision,generation,label), unique(room_id,revision,requested_by,request_key),
 check((kind in ('lawyer','consult') and slot is not null and requested_by is not null and request_key is not null and raw_text is not null and subtopic is not null)
   or (kind not in ('lawyer','consult') and requested_by is null and request_key is null and raw_text is null)),
 check((status='pending' and deadline_at is not null and completed_at is null and text is null)
   or (status='complete' and completed_at is not null and text is not null))
);
create index lawyer_pending on quarrel_private.lawyer_messages(room_id,created_at) where status='pending';
create index lawyer_transcript on quarrel_private.lawyer_messages(room_id,revision,generation,created_at,id);
alter table quarrel_private.lawyer_debates enable row level security;
alter table quarrel_private.lawyer_subtopics enable row level security;
alter table quarrel_private.lawyer_messages enable row level security;
revoke all on quarrel_private.lawyer_debates,quarrel_private.lawyer_subtopics,quarrel_private.lawyer_messages from public,anon,authenticated;

create function quarrel_private.lawyer_message_json(m quarrel_private.lawyer_messages, p_slot text, p_all_raw boolean default false) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',m.id,'label',m.label,'kind',case m.kind when 'lawyer' then 'argument' when 'summary' then 'judge_summary' when 'jury' then 'jury_verdict' else 'announcement' end,
  'subtopic',m.subtopic,'slot',m.slot,'text',m.text,'source',m.source,'status',m.status,'createdAt',m.created_at,'completedAt',m.completed_at)
  || case when m.kind='lawyer' and (p_all_raw or m.slot=p_slot) then jsonb_build_object('rawText',m.raw_text) else '{}'::jsonb end;
$$;

create function quarrel_private.lawyer_queue(p_room uuid,p_kind text,p_subtopic integer,p_label text,p_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare d quarrel_private.lawyer_debates;
begin
 select * into d from quarrel_private.lawyer_debates where room_id=p_room;
 insert into quarrel_private.lawyer_messages(room_id,revision,generation,kind,subtopic,label,source,deadline_at)
 values(p_room,d.revision,d.plan_generation,p_kind,p_subtopic,p_label,case when d.mode='ai' then 'ai' else 'demo' end,p_at+interval '20 seconds')
 on conflict(room_id,revision,generation,label) do nothing;
end; $$;

-- Resume at p_at. For expired clocks p_at is the ORIGINAL deadline; AI work
-- resumes at committed completion and consumes neither player's writing time.
create function quarrel_private.lawyer_next_writer(p_room uuid,p_preferred text,p_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare d quarrel_private.lawyer_debates; s quarrel_private.lawyer_subtopics; who text; ms bigint;
begin
 select * into d from quarrel_private.lawyer_debates where room_id=p_room;
 select * into s from quarrel_private.lawyer_subtopics where room_id=p_room and revision=d.revision and generation=d.plan_generation and ordinal=d.current_subtopic;
 if p_preferred='A' and s.remaining_ms_a>0 or p_preferred='B' and s.remaining_ms_b>0 then who:=p_preferred;
 elsif s.remaining_ms_a>0 then who:='A'; elsif s.remaining_ms_b>0 then who:='B'; end if;
 if who is null then
  update quarrel_private.lawyer_debates set phase='summary',state=null,active_slot=null,turn_deadline=null,summary_until=null where room_id=p_room;
  update quarrel_private.lawyer_subtopics set status='summarizing' where room_id=p_room and revision=d.revision and generation=d.plan_generation and ordinal=d.current_subtopic;
  -- Summary work only begins when observed; offline waiting must not charge AI.
  perform quarrel_private.lawyer_queue(p_room,'summary',d.current_subtopic,'S'||d.current_subtopic||'-J',clock_timestamp());
 else
  ms:=case when who='A' then s.remaining_ms_a else s.remaining_ms_b end;
  update quarrel_private.lawyer_debates set phase='subtopic',state='composing',active_slot=who,turn_deadline=p_at+ms*interval '1 millisecond' where room_id=p_room;
 end if;
end; $$;

create function quarrel_private.lawyer_open_subtopic(p_room uuid,p_ordinal integer,p_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare d quarrel_private.lawyer_debates; s quarrel_private.lawyer_subtopics;
begin
 select * into d from quarrel_private.lawyer_debates where room_id=p_room;
 select * into s from quarrel_private.lawyer_subtopics where room_id=p_room and revision=d.revision and generation=d.plan_generation and ordinal=p_ordinal;
 if not found then
  update quarrel_private.lawyer_debates set phase='jury',state=null,active_slot=null,turn_deadline=null,summary_until=null where room_id=p_room;
  perform quarrel_private.lawyer_queue(p_room,'jury',null,'JURY',clock_timestamp());
 else
  update quarrel_private.lawyer_debates set current_subtopic=p_ordinal,summary_until=null where room_id=p_room;
  update quarrel_private.lawyer_subtopics set status='active' where room_id=p_room and revision=d.revision and generation=d.plan_generation and ordinal=p_ordinal;
  insert into quarrel_private.lawyer_messages(room_id,revision,generation,kind,subtopic,label,text,status,source,completed_at)
   values(p_room,d.revision,d.plan_generation,'announcement',p_ordinal,'S'||p_ordinal||'-START','Subtopic '||p_ordinal||': '||s.question,'complete','demo',p_at) on conflict do nothing;
  perform quarrel_private.lawyer_next_writer(p_room,s.opener_slot,p_at);
 end if;
end; $$;


-- Defense-in-depth tripwire. Official raw fallback is handled separately below:
-- quoting a player's words is not an authorized model outcome.
create function quarrel_private.lawyer_safe_text(p_text text,p_max integer) returns boolean
language sql immutable set search_path='' as $$
 select p_text is not null and char_length(btrim(p_text)) between 1 and p_max
 and translate(p_text,E'\n\r\t','')!~'[[:cntrl:]]'
 and p_text !~* '\m(player|side|team)\s*[ab]\s+(wins?|won|is\s+(the\s+)?winner|has\s+won)\M|\m(winner\s+is|declare\s+(a\s+)?winner|final\s+verdict\s*:)\M|\m(score|points?)\s*[:=]\s*[0-9]';
$$;

-- Shared validated completion used by the worker and deterministic lease repair.
create function quarrel_private.lawyer_finish(p_id uuid,p_result jsonb,p_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare m quarrel_private.lawyer_messages; d quarrel_private.lawyer_debates; q jsonb; v jsonb; n integer; total integer; txt text; src text;
begin
 select * into m from quarrel_private.lawyer_messages where id=p_id;
 select * into d from quarrel_private.lawyer_debates where room_id=m.room_id;
 if m.status='complete' then return; end if;
 if m.revision<>d.revision or m.generation<>d.plan_generation then raise exception 'STALE_REVISION'; end if;
 if jsonb_typeof(p_result) is distinct from 'object' then raise exception 'INVALID_LAWYER_RESPONSE';end if;
 if p_result->>'kind' is distinct from m.kind
  or jsonb_typeof(p_result->'text') is distinct from 'string' or char_length(btrim(p_result->>'text')) not between 1 and 2400
  or p_result->>'source' is null or p_result->>'source' not in ('ai','demo','fallback')
  or exists(select 1 from jsonb_object_keys(p_result) k where k not in ('kind','text','source','subtopics','verdict')) then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
 txt:=btrim(p_result->>'text');src:=p_result->>'source';
 if not(m.kind='lawyer' and src='fallback' and txt=m.raw_text) and not quarrel_private.lawyer_safe_text(txt,case when m.kind='jury' then 2400 when m.kind='summary' then 1800 else 900 end) then raise exception 'INVALID_LAWYER_RESPONSE';end if;
 if m.kind<>'plan' and p_result ? 'subtopics' or m.kind<>'jury' and p_result ? 'verdict' then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
 if m.kind='plan' then
  if jsonb_typeof(p_result->'subtopics') is distinct from 'array' then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
  n:=jsonb_array_length(p_result->'subtopics');
  if n not between 2 and 5 then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
  total:=0;
  for q in select value from jsonb_array_elements(p_result->'subtopics') loop
   if jsonb_typeof(q) is distinct from 'object' then raise exception 'INVALID_LAWYER_RESPONSE';end if;
   if jsonb_typeof(q->'ordinal') is distinct from 'number' or (q->>'ordinal') !~ '^[1-5]$'
    or jsonb_typeof(q->'question') is distinct from 'string' or not quarrel_private.lawyer_safe_text(q->>'question',200)
    or jsonb_typeof(q->'secondsPerPlayer') is distinct from 'number' or (q->>'secondsPerPlayer') !~ '^[0-9]+$'
    or (q->>'secondsPerPlayer')::numeric not between 30 and 600
    or exists(select 1 from jsonb_object_keys(q) k where k not in ('ordinal','question','secondsPerPlayer')) then raise exception 'INVALID_LAWYER_RESPONSE';end if;
   total:=total+(q->>'secondsPerPlayer')::integer;
  end loop;
  if total<>d.total_seconds or (select count(distinct lower(btrim(x->>'question'))) from jsonb_array_elements(p_result->'subtopics') x)<>n or (select count(distinct (x->>'ordinal')::int) from jsonb_array_elements(p_result->'subtopics') x where (x->>'ordinal')::int between 1 and n)<>n then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
  for q in select value from jsonb_array_elements(p_result->'subtopics') loop
   insert into quarrel_private.lawyer_subtopics(room_id,revision,generation,ordinal,question,seconds_per_player,opener_slot,source,remaining_ms_a,remaining_ms_b)
    values(m.room_id,m.revision,m.generation,(q->>'ordinal')::int,btrim(q->>'question'),(q->>'secondsPerPlayer')::int,
    case when (q->>'ordinal')::int%2=1 then 'A' else 'B' end,src,(q->>'secondsPerPlayer')::bigint*1000,(q->>'secondsPerPlayer')::bigint*1000);
  end loop;
  update quarrel_private.lawyer_debates set plan_ready=true where room_id=m.room_id;
 elsif m.kind='lawyer' then
  if src='fallback' then txt:=m.raw_text;
  elsif char_length(txt)>least(900,floor(char_length(m.raw_text)*1.5)::int) then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
  perform quarrel_private.lawyer_next_writer(m.room_id,case when m.slot='A' then 'B' else 'A' end,p_at);
 elsif m.kind='consult' then
  perform quarrel_private.lawyer_next_writer(m.room_id,m.slot,p_at);
 elsif m.kind='summary' then
  update quarrel_private.lawyer_subtopics set status='done' where room_id=m.room_id and revision=m.revision and generation=m.generation and ordinal=m.subtopic;
  update quarrel_private.lawyer_debates set summary_until=p_at+interval '4 seconds' where room_id=m.room_id;
 elsif m.kind='jury' then
  v:=p_result->'verdict';
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'INVALID_LAWYER_RESPONSE';end if;
  if v->>'outcome' is null or v->>'outcome' not in ('A','B','split')
   or jsonb_typeof(v->'reasoning') is distinct from 'string' or not quarrel_private.lawyer_safe_text(v->>'reasoning',1800)
   or jsonb_typeof(v->'perSubtopic') is distinct from 'array'
   or exists(select 1 from jsonb_object_keys(v) k where k not in ('outcome','reasoning','perSubtopic')) then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
  select count(*) into n from quarrel_private.lawyer_subtopics where room_id=m.room_id and revision=m.revision and generation=m.generation;
  if jsonb_array_length(v->'perSubtopic')<>n then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
  for q in select value from jsonb_array_elements(v->'perSubtopic') loop
   if jsonb_typeof(q) is distinct from 'object' then raise exception 'INVALID_LAWYER_RESPONSE';end if;
   if jsonb_typeof(q->'ordinal') is distinct from 'number' or (q->>'ordinal') !~ '^[1-5]$'
    or jsonb_typeof(q->'text') is distinct from 'string' or not quarrel_private.lawyer_safe_text(q->>'text',600)
    or exists(select 1 from jsonb_object_keys(q) k where k not in ('ordinal','text')) then raise exception 'INVALID_LAWYER_RESPONSE';end if;
  end loop;
  if (select count(distinct (x->>'ordinal')::int) from jsonb_array_elements(v->'perSubtopic') x where (x->>'ordinal')::int between 1 and n)<>n then raise exception 'INVALID_LAWYER_RESPONSE'; end if;
  update quarrel_private.lawyer_debates set phase='complete',verdict=v,state=null,active_slot=null,turn_deadline=null where room_id=m.room_id;
 end if;
 update quarrel_private.lawyer_messages set status='complete',text=txt,result=p_result,source=src,completed_at=p_at where id=p_id;
 update public.quarrel_rooms set debate_version=debate_version+1 where id=m.room_id;
end; $$;

create function quarrel_private.lawyer_fallback(m quarrel_private.lawyer_messages) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d quarrel_private.lawyer_debates; r jsonb; lines jsonb; a_text text; b_text text; summary_text text;
begin
 select * into d from quarrel_private.lawyer_debates where room_id=m.room_id;
 r:=jsonb_build_object('kind',m.kind,'source','fallback','text',case m.kind when 'lawyer' then m.raw_text when 'consult' then 'Your private lawyer is unavailable. Check that your argument states your own reasoning and does not add unsupported claims.' when 'plan' then 'A fallback plan is ready for both players to review.' when 'summary' then 'Fallback summary: review both sides’ presentations below. No external claims have been verified.' else 'The fallback jury cannot reliably distinguish the arguments. The result is inconclusive.' end);
 if m.kind='plan' then
  r:=r||jsonb_build_object('subtopics',jsonb_build_array(jsonb_build_object('ordinal',1,'question',case when quarrel_private.lawyer_safe_text(d.topic,240) then 'Which reasons support each position on: '||left(d.topic,150)||'?' else 'Which reasons support each confirmed position on the agreed topic?' end,'secondsPerPlayer',d.total_seconds/2),jsonb_build_object('ordinal',2,'question',case when quarrel_private.lawyer_safe_text(d.topic,240) then 'Which trade-offs or disagreements matter most for: '||left(d.topic,140)||'?' else 'Which trade-offs and disagreements matter most to both participants?' end,'secondsPerPlayer',d.total_seconds-d.total_seconds/2)));
 elsif m.kind='summary' then
  select left(text,430) into a_text from quarrel_private.lawyer_messages where room_id=m.room_id and revision=m.revision and generation=m.generation and subtopic=m.subtopic and kind='lawyer' and slot='A' and status='complete' order by created_at desc,id desc limit 1;
  select left(text,430) into b_text from quarrel_private.lawyer_messages where room_id=m.room_id and revision=m.revision and generation=m.generation and subtopic=m.subtopic and kind='lawyer' and slot='B' and status='complete' order by created_at desc,id desc limit 1;
  summary_text:='Fallback summary. A’s last public point: '||coalesce(a_text,'No official submission.')||' B’s last public point: '||coalesce(b_text,'No official submission.')||' These are participant claims, not independently verified facts. Review the full transcript for context.';
  if quarrel_private.lawyer_safe_text(summary_text,1800) then r:=jsonb_set(r,'{text}',to_jsonb(summary_text));end if;
 elsif m.kind='jury' then
  select jsonb_agg(jsonb_build_object('ordinal',ordinal,'text','Both sides’ public presentations remain available; this fallback does not assess a winner.') order by ordinal) into lines from quarrel_private.lawyer_subtopics where room_id=m.room_id and revision=m.revision and generation=m.generation;
  r:=r||jsonb_build_object('verdict',jsonb_build_object('outcome','split','reasoning','The AI evaluation was unavailable. This labelled fallback is inconclusive, not a judgment of either player.', 'perSubtopic',lines));
 end if;
 return r;
end; $$;

create function quarrel_private.reconcile_lawyer(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d quarrel_private.lawyer_debates; m quarrel_private.lawyer_messages; now_at timestamptz:=clock_timestamp(); changed boolean;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 loop
  changed:=false;
  select * into d from quarrel_private.lawyer_debates where room_id=p_room;
  if not found then return;end if;
  for m in select * from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and generation=d.plan_generation and status='pending' and deadline_at<=now_at order by created_at,id loop
   perform quarrel_private.lawyer_finish(m.id,quarrel_private.lawyer_fallback(m),now_at); changed:=true;
  end loop;
  select * into d from quarrel_private.lawyer_debates where room_id=p_room;
  if d.state='composing' and d.turn_deadline<=now_at then
   update quarrel_private.lawyer_subtopics set remaining_ms_a=case when d.active_slot='A' then 0 else remaining_ms_a end,remaining_ms_b=case when d.active_slot='B' then 0 else remaining_ms_b end where room_id=p_room and revision=d.revision and generation=d.plan_generation and ordinal=d.current_subtopic;
   perform quarrel_private.lawyer_next_writer(p_room,case when d.active_slot='A' then 'B' else 'A' end,d.turn_deadline); changed:=true;
   update public.quarrel_rooms set debate_version=debate_version+1 where id=p_room;
  elsif d.phase='summary' and d.summary_until<=now_at then
   perform quarrel_private.lawyer_open_subtopic(p_room,d.current_subtopic+1,d.summary_until);changed:=true;
   update public.quarrel_rooms set debate_version=debate_version+1 where id=p_room;
  end if;
  exit when not changed;
 end loop;
end; $$;

create function quarrel_private.lawyer_snapshot(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d quarrel_private.lawyer_debates; who text; subs jsonb; history jsonb; private_history jsonb; current_s quarrel_private.lawyer_subtopics;
begin
 select * into d from quarrel_private.lawyer_debates where room_id=p_room;
 if not found then return null;end if;
 select slot into who from public.quarrel_players where room_id=p_room and user_id=auth.uid();
 if who is null then raise exception 'UNAUTHORIZED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('ordinal',ordinal,'question',question,'secondsPerPlayer',seconds_per_player,'openerSlot',opener_slot,'source',source,'status',status,'remainingMsA',remaining_ms_a,'remainingMsB',remaining_ms_b) order by ordinal),'[]'::jsonb) into subs from quarrel_private.lawyer_subtopics where room_id=p_room and revision=d.revision and generation=d.plan_generation;
 select * into current_s from quarrel_private.lawyer_subtopics where room_id=p_room and revision=d.revision and generation=d.plan_generation and ordinal=d.current_subtopic;
 select coalesce(jsonb_agg(quarrel_private.lawyer_message_json(m,who) order by m.created_at,m.id),'[]'::jsonb) into history from quarrel_private.lawyer_messages m where m.room_id=p_room and m.revision=d.revision and m.generation=d.plan_generation and m.kind in ('lawyer','summary','jury','announcement');
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'subtopic',subtopic,'playerText',raw_text,'text',text,'source',source,'status',status,'createdAt',created_at) order by created_at,id),'[]'::jsonb) into private_history from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and kind='consult' and requested_by=auth.uid();
 return jsonb_build_object('format','lawyer','phase',d.phase,'topic',d.topic,'totalSeconds',d.total_seconds,'revision',d.revision,'positionA',d.position_a,'positionB',d.position_b,'confirmedA',d.confirmed_a,'confirmedB',d.confirmed_b,'planReady',d.plan_ready,'regenerationUsed',d.regeneration_used,'planGeneration',d.plan_generation,'subtopics',subs,'currentSubtopic',d.current_subtopic,
  'state',case when d.state='consulting' and d.active_slot<>who then 'lawyering' else d.state end,'activeSlot',case when d.state='composing' then d.active_slot else null end,'turnDeadline',d.turn_deadline,'remainingMsA',coalesce(current_s.remaining_ms_a,0),'remainingMsB',coalesce(current_s.remaining_ms_b,0),'serverNow',clock_timestamp(),'startedAt',d.started_at,'history',history,'consultations',private_history,'verdict',d.verdict,
  'ownMessageCount',(select count(*) from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and subtopic=d.current_subtopic and slot=who and kind='lawyer'),
  'ownConsultationCount',(select count(*) from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and subtopic=d.current_subtopic and requested_by=auth.uid() and kind='consult'),
  'needsWork',exists(select 1 from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and generation=d.plan_generation and status='pending' and claimed_at is null and (kind<>'consult' or requested_by=auth.uid())));
end; $$;

-- Copy the original snapshot implementation, including hidden-opening guards.
-- Preserve the public function OID so cached callers also use the new wrapper.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.get_quarrel_room()'::regprocedure);
 definition:=replace(definition,'FUNCTION public.get_quarrel_room()', 'FUNCTION quarrel_private.stage4_room_snapshot()');
 execute definition;
end;$$;
revoke all on function quarrel_private.stage4_room_snapshot() from public,anon,authenticated;
create or replace function public.get_quarrel_room() returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.quarrel_rooms; base jsonb; l jsonb;
begin
 r:=quarrel_private.lock_member_room();if r.id is null then return null;end if;
 perform quarrel_private.reconcile_lawyer(r.id);
 base:=quarrel_private.stage4_room_snapshot();l:=quarrel_private.lawyer_snapshot(r.id);
 return case when l is null then base else base||jsonb_build_object('lawyer',l) end;
end; $$;

create function public.create_quarrel_lawyer_room(p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; existing_id uuid;
begin
 -- Existing session in an older room is recovered, never silently converted.
 perform quarrel_private.prepare_player(p_name);
 select room_id into existing_id from public.quarrel_players where user_id=auth.uid();
 if existing_id is not null then return public.get_quarrel_room();end if;
 r:=public.create_quarrel_room(p_name);
 insert into quarrel_private.lawyer_debates(room_id) values((r->>'id')::uuid);
 return public.get_quarrel_room();
end; $$;

create function public.propose_quarrel_lawyer_topic(p_topic text,p_total_seconds integer,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms; d quarrel_private.lawyer_debates;
begin
 r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then raise exception 'LAWYER_UNAVAILABLE';end if;
 if (select slot from public.quarrel_players where user_id=auth.uid())<>'A' then raise exception 'HOST_ONLY';end if;
 if d.started_at is not null then raise exception 'DEBATE_STARTED';end if;
 if p_revision is distinct from d.revision then raise exception 'STALE_REVISION';end if;
 if p_topic is null or char_length(btrim(p_topic)) not between 1 and 240 or p_topic ~ '[[:cntrl:]]' then raise exception 'INVALID_TOPIC';end if;
 if p_total_seconds is null or p_total_seconds not in (120,240,360,600) then raise exception 'INVALID_DURATION';end if;
 update quarrel_private.lawyer_debates set topic=btrim(p_topic),total_seconds=p_total_seconds,revision=revision+1,phase='setup',position_a=null,position_b=null,confirmed_a=false,confirmed_b=false,plan_ready=false,regeneration_used=false,plan_generation=0 where room_id=r.id;
 update public.quarrel_players set ready=false where room_id=r.id;update public.quarrel_rooms set debate_version=debate_version+1 where id=r.id;
 return public.get_quarrel_room();
end; $$;

create function public.set_quarrel_lawyer_position(p_position text,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms; d quarrel_private.lawyer_debates; who text;
begin
 r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then raise exception 'LAWYER_UNAVAILABLE';end if;
 if d.started_at is not null then raise exception 'DEBATE_STARTED';end if;
 if p_revision is distinct from d.revision then raise exception 'STALE_REVISION';end if;
 if d.topic is null then raise exception 'DEBATE_NOT_READY';end if;
 if p_position is null or char_length(btrim(p_position)) not between 1 and 600 or translate(p_position,E'\n\r\t','') ~ '[[:cntrl:]]' then raise exception 'INVALID_POSITION';end if;
 select slot into who from public.quarrel_players where user_id=auth.uid();
 update quarrel_private.lawyer_debates set position_a=case when who='A' then btrim(p_position) else position_a end,position_b=case when who='B' then btrim(p_position) else position_b end,
 confirmed_a=case when who='A' then true else confirmed_a end,confirmed_b=case when who='B' then true else confirmed_b end,revision=revision+1,phase='setup',plan_ready=false,regeneration_used=false,plan_generation=0 where room_id=r.id;
 update public.quarrel_players set ready=false where room_id=r.id;update public.quarrel_rooms set debate_version=debate_version+1 where id=r.id;
 return public.get_quarrel_room();
end; $$;

do $$declare definition text;begin
 definition:=pg_get_functiondef('public.set_quarrel_ready(boolean)'::regprocedure);
 definition:=replace(definition,'FUNCTION public.set_quarrel_ready(', 'FUNCTION quarrel_private.stage4_set_ready(');
 execute definition;
end;$$;
revoke all on function quarrel_private.stage4_set_ready(boolean) from public,anon,authenticated;
create or replace function public.set_quarrel_ready(p_ready boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms; d quarrel_private.lawyer_debates; who text;
begin
 r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;
 if not found then return quarrel_private.stage4_set_ready(p_ready);end if;
 if p_ready is null then raise exception 'INVALID_READY';end if;
 if d.started_at is not null then raise exception 'DEBATE_STARTED';end if;
 select slot into who from public.quarrel_players where user_id=auth.uid();
 if p_ready and (d.topic is null or (who='A' and not d.confirmed_a) or (who='B' and not d.confirmed_b)) then raise exception 'DEBATE_NOT_READY';end if;
 update public.quarrel_players set ready=p_ready,last_seen=clock_timestamp() where user_id=auth.uid();
 return public.get_quarrel_room();
end; $$;

create function public.prepare_quarrel_lawyer_plan(p_revision integer,p_regenerate boolean,p_mode text,p_server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then raise exception 'LAWYER_UNAVAILABLE';end if;
 if d.started_at is not null then raise exception 'DEBATE_STARTED';end if;
 if p_revision is distinct from d.revision then raise exception 'STALE_REVISION';end if;
 if p_mode is null or p_mode not in ('ai','demo') or p_regenerate is null then raise exception 'INVALID_LAWYER_CONFIG';end if;
 if not p_regenerate and d.phase='planning' then return public.get_quarrel_room();end if;
 if p_regenerate then
  if (select slot from public.quarrel_players where user_id=auth.uid())<>'A' then raise exception 'HOST_ONLY';end if;
  if d.regeneration_used then raise exception 'PLAN_REGENERATION_USED';end if;
  if not d.plan_ready then raise exception 'PLAN_NOT_READY';end if;
 end if;
 if d.topic is null or not d.confirmed_a or not d.confirmed_b or not (select count(*)=2 and bool_and(ready and user_id is not null) from public.quarrel_players where room_id=r.id) then raise exception 'DEBATE_NOT_READY';end if;
 update quarrel_private.lawyer_debates set phase='planning',mode=p_mode,plan_ready=false,regeneration_used=regeneration_used or p_regenerate,plan_generation=plan_generation+case when p_regenerate then 1 else 0 end where room_id=r.id;
 perform quarrel_private.lawyer_queue(r.id,'plan',null,'PLAN',clock_timestamp());
 update public.quarrel_rooms set debate_version=debate_version+1 where id=r.id;return public.get_quarrel_room();
end; $$;

create function public.start_quarrel_lawyer_debate(p_revision integer,p_plan_generation integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates;now_at timestamptz;
begin
 r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then raise exception 'LAWYER_UNAVAILABLE';end if;
 if (select slot from public.quarrel_players where user_id=auth.uid())<>'A' then raise exception 'HOST_ONLY';end if;
 if d.started_at is not null then raise exception 'DEBATE_STARTED';end if;
 if p_revision is distinct from d.revision then raise exception 'STALE_REVISION';end if;
 if p_plan_generation is distinct from d.plan_generation then raise exception 'STALE_PLAN';end if;
 now_at:=clock_timestamp();
 if not d.plan_ready or not d.confirmed_a or not d.confirmed_b or not (select count(*)=2 and bool_and(ready and user_id is not null and last_seen>now_at-interval '35 seconds') from public.quarrel_players where room_id=r.id) then raise exception 'DEBATE_NOT_READY';end if;
 update quarrel_private.lawyer_debates set started_at=now_at where room_id=r.id;
 update public.quarrel_rooms set theme_locked=true,debate_version=debate_version+1 where id=r.id;
 perform quarrel_private.lawyer_open_subtopic(r.id,1,now_at);return public.get_quarrel_room();
end; $$;

create function quarrel_private.lawyer_submit(p_kind text,p_text text,p_revision integer,p_subtopic integer,p_request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates; old quarrel_private.lawyer_messages;who text;n integer;ms bigint;at_time timestamptz;
begin
 r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 perform quarrel_private.reconcile_lawyer(r.id);select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then raise exception 'LAWYER_UNAVAILABLE';end if;
 if p_revision is distinct from d.revision then raise exception 'STALE_REVISION';end if;
 if p_request_key is null or p_text is null or char_length(btrim(p_text)) not between 1 and 600 or btrim(p_text)!~'[^[:space:]]' or translate(p_text,E'\n\r\t','')~'[[:cntrl:]]' then raise exception 'INVALID_LAWYER_MESSAGE';end if;
 select * into old from quarrel_private.lawyer_messages where room_id=r.id and revision=p_revision and requested_by=auth.uid() and request_key=p_request_key;
 if found then
  if old.kind<>p_kind or old.subtopic is distinct from p_subtopic or old.raw_text<>btrim(p_text) then raise exception 'LAWYER_REQUEST_CONFLICT';end if;
  return public.get_quarrel_room();
 end if;
 if d.phase='complete' then raise exception 'DEBATE_COMPLETE';end if;
 if d.phase<>'subtopic' then raise exception 'DEBATE_NOT_STARTED';end if;
 if p_subtopic is distinct from d.current_subtopic then raise exception 'STALE_TURN';end if;
 select slot into who from public.quarrel_players where user_id=auth.uid();
 if d.active_slot<>who then raise exception 'NOT_YOUR_TURN';end if;
 if d.state<>'composing' then raise exception 'LAWYER_BUSY';end if;
 at_time:=clock_timestamp();if d.turn_deadline<=at_time then raise exception 'TURN_EXPIRED';end if;
 select count(*)+1 into n from quarrel_private.lawyer_messages where room_id=r.id and revision=p_revision and subtopic=p_subtopic and slot=who and kind=p_kind;
 if n>(case when p_kind='consult' then 2 else 12 end) then raise exception 'LAWYER_LIMIT_REACHED';end if;
 ms:=greatest(0,ceil(extract(epoch from(d.turn_deadline-at_time))*1000)::bigint);
 update quarrel_private.lawyer_subtopics set remaining_ms_a=case when who='A' then least(remaining_ms_a,ms) else remaining_ms_a end,remaining_ms_b=case when who='B' then least(remaining_ms_b,ms) else remaining_ms_b end where room_id=r.id and revision=p_revision and generation=d.plan_generation and ordinal=p_subtopic;
 insert into quarrel_private.lawyer_messages(room_id,revision,generation,kind,subtopic,slot,requested_by,request_key,message_no,label,raw_text,source,deadline_at)
 values(r.id,p_revision,d.plan_generation,p_kind,p_subtopic,who,auth.uid(),p_request_key,n,'S'||p_subtopic||'-P'||case when who='A' then '1L1' else '2L2' end||case when p_kind='consult' then 'C' else 'M' end||n,btrim(p_text),case when d.mode='ai' then 'ai' else 'demo' end,at_time+interval '20 seconds');
 update quarrel_private.lawyer_debates set state=case when p_kind='consult' then 'consulting' else 'lawyering' end,turn_deadline=null where room_id=r.id;
 update public.quarrel_rooms set debate_version=debate_version+1 where id=r.id;return public.get_quarrel_room();
end; $$;
create function public.submit_quarrel_lawyer_argument(p_text text,p_revision integer,p_subtopic integer,p_request_key uuid) returns jsonb language sql security definer set search_path='' as $$select quarrel_private.lawyer_submit('lawyer',p_text,p_revision,p_subtopic,p_request_key);$$;
create function public.consult_quarrel_lawyer(p_text text,p_revision integer,p_subtopic integer,p_request_key uuid) returns jsonb language sql security definer set search_path='' as $$select quarrel_private.lawyer_submit('consult',p_text,p_revision,p_subtopic,p_request_key);$$;
create function public.advance_quarrel_lawyer_debate(p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;
begin r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 if p_revision is distinct from (select revision from quarrel_private.lawyer_debates where room_id=r.id) then raise exception 'STALE_REVISION';end if;
 return public.get_quarrel_room();end;$$;

create function public.claim_quarrel_lawyer_work(p_server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates;m quarrel_private.lawyer_messages;args jsonb;players jsonb;subs jsonb;consults jsonb;ctx jsonb;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 perform quarrel_private.reconcile_lawyer(r.id);select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then return null;end if;
 if exists(select 1 from quarrel_private.lawyer_messages where room_id=r.id and revision=d.revision and generation=d.plan_generation and status='pending' and claimed_at is not null) then return null;end if;
 select * into m from quarrel_private.lawyer_messages where room_id=r.id and revision=d.revision and generation=d.plan_generation and status='pending' and claimed_at is null and (kind<>'consult' or requested_by=auth.uid()) order by created_at,id limit 1;
 if not found then return null;end if;
 update quarrel_private.lawyer_messages set claimed_at=clock_timestamp() where id=m.id;
 select jsonb_agg(jsonb_build_object('slot',slot,'name',display_name,'position',case when slot='A' then d.position_a else d.position_b end) order by slot) into players from public.quarrel_players where room_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('ordinal',ordinal,'question',question,'secondsPerPlayer',seconds_per_player) order by ordinal),'[]'::jsonb) into subs from quarrel_private.lawyer_subtopics where room_id=r.id and revision=d.revision and generation=d.plan_generation;
 select coalesce(jsonb_agg(quarrel_private.lawyer_message_json(x,m.slot,m.kind in ('summary','jury')) order by x.created_at,x.id),'[]'::jsonb) into args from quarrel_private.lawyer_messages x where x.room_id=r.id and x.revision=d.revision and x.generation=d.plan_generation and x.kind in ('lawyer','summary','announcement') and x.status='complete' and (m.kind<>'summary' or x.subtopic=m.subtopic);
 ctx:=jsonb_build_object('themeId',r.theme_id,'topic',d.topic,'totalSeconds',d.total_seconds,'players',players,'subtopics',subs,'currentSubtopic',d.current_subtopic,'messages',args);
 if m.kind='consult' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'subtopic',subtopic,'playerText',raw_text,'text',text,'source',source,'status',status,'createdAt',created_at) order by created_at,id),'[]'::jsonb) into consults from quarrel_private.lawyer_messages where room_id=r.id and revision=d.revision and kind='consult' and requested_by=m.requested_by and status='complete';
  ctx:=ctx||jsonb_build_object('consultations',consults);
 end if;
 return jsonb_build_object('id',m.id,'kind',m.kind,'mode',d.mode,'slot',m.slot,'playerText',m.raw_text,'context',ctx);
end; $$;
create function public.finish_quarrel_lawyer_work(p_id uuid,p_result jsonb,p_server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;m quarrel_private.lawyer_messages;d quarrel_private.lawyer_debates;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 perform quarrel_private.reconcile_lawyer(r.id);
 select * into m from quarrel_private.lawyer_messages where id=p_id and room_id=r.id and (kind<>'consult' or requested_by=auth.uid());if not found then raise exception 'LAWYER_REQUEST_NOT_FOUND';end if;
 if m.status='complete' then return public.get_quarrel_room();end if;
 if m.claimed_at is null then raise exception 'LAWYER_REQUEST_NOT_CLAIMED';end if;
 perform quarrel_private.lawyer_finish(p_id,p_result,clock_timestamp());return public.get_quarrel_room();
end; $$;

-- Prevent old direct RPCs from editing positions, starting the old turn engine,
-- or reviving shared judge chat in a Stage 5 room. Legacy rooms are unchanged.
create function quarrel_private.assert_legacy_debate() returns void language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;
begin r:=quarrel_private.lock_member_room();if exists(select 1 from quarrel_private.lawyer_debates where room_id=r.id) then raise exception 'LAWYER_FLOW_REQUIRED';end if;end;$$;
do $$declare f record; definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('propose_quarrel_debate','approve_quarrel_debate','request_quarrel_debate_changes','start_quarrel_debate','start_quarrel_judged_debate','submit_quarrel_argument','advance_quarrel_debate','begin_quarrel_judge_message') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\n  perform quarrel_private.assert_legacy_debate();','i');
  execute definition;
 end loop;
end;$$;
-- All helpers are inaccessible; public entry points still require verified JWT,
-- member lock, and the separate server capability for job generation/completion.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='quarrel_private' and (p.proname like 'lawyer_%' or p.proname in ('reconcile_lawyer','assert_legacy_debate')))
    or (n.nspname='public' and (p.proname like '%quarrel_lawyer%' or p.proname in ('consult_quarrel_lawyer','get_quarrel_room','set_quarrel_ready'))) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
