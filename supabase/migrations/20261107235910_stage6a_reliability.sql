-- Stage 6A: additive session archives, lease fencing, truthful jury retries.
-- REVIEW BEFORE CLOUD APPLICATION. No reset, table/data deletion or RLS relaxation.
-- Version 1 rooms keep Stage 5 worker behavior until a Stage 6 worker upgrades them.

create table quarrel_private.lawyer_sessions (
 id uuid primary key, room_id uuid not null references public.quarrel_rooms(id),
 player_a uuid, player_b uuid, name_a text, name_b text,
 theme_id text not null, topic text, position_a text, position_b text,
 total_seconds integer not null, revision integer not null, generation integer not null,
 created_at timestamptz not null default clock_timestamp(), started_at timestamptz,
 completed_at timestamptz, verdict jsonb,
 acknowledged_a timestamptz, acknowledged_b timestamptz,
 rematch_a timestamptz, rematch_b timestamptz, next_debate_id uuid references quarrel_private.lawyer_sessions(id),
 check((completed_at is null and verdict is null) or (completed_at is not null and verdict is not null))
);
alter table quarrel_private.lawyer_sessions enable row level security;
revoke all on quarrel_private.lawyer_sessions from public,anon,authenticated;
create index lawyer_sessions_a on quarrel_private.lawyer_sessions(player_a,completed_at desc);
create index lawyer_sessions_b on quarrel_private.lawyer_sessions(player_b,completed_at desc);
create index lawyer_sessions_room on quarrel_private.lawyer_sessions(room_id,created_at);
alter table quarrel_private.lawyer_debates add column debate_id uuid not null default gen_random_uuid(),
 add column reliability_version integer not null default 1 check(reliability_version in(1,2));
insert into quarrel_private.lawyer_sessions(id,room_id,player_a,player_b,name_a,name_b,theme_id,topic,position_a,position_b,total_seconds,revision,generation,started_at,completed_at,verdict)
 select d.debate_id,d.room_id,a.user_id,b.user_id,a.display_name,b.display_name,r.theme_id,d.topic,d.position_a,d.position_b,d.total_seconds,d.revision,d.plan_generation,d.started_at,
 case when d.phase='complete' then coalesce((select max(completed_at) from quarrel_private.lawyer_messages m where m.room_id=d.room_id and m.revision=d.revision and m.generation=d.plan_generation and m.kind='jury'),clock_timestamp()) end,d.verdict
 from quarrel_private.lawyer_debates d join public.quarrel_rooms r on r.id=d.room_id
 left join public.quarrel_players a on a.room_id=d.room_id and a.slot='A'
 left join public.quarrel_players b on b.room_id=d.room_id and b.slot='B';
-- Departed pre-migration identities were already detached. Never guess them.
alter table quarrel_private.lawyer_debates add constraint lawyer_current_session_fk foreign key(debate_id) references quarrel_private.lawyer_sessions(id);
alter table quarrel_private.lawyer_messages add column debate_id uuid references quarrel_private.lawyer_sessions(id),
 add column claim_token uuid, add column attempts integer not null default 0 check(attempts>=0),
 add column retry_at timestamptz, add column error_code text, add column last_retry_at timestamptz;
alter table quarrel_private.lawyer_subtopics add column debate_id uuid references quarrel_private.lawyer_sessions(id);
update quarrel_private.lawyer_messages m set debate_id=d.debate_id from quarrel_private.lawyer_debates d where d.room_id=m.room_id;
update quarrel_private.lawyer_subtopics s set debate_id=d.debate_id from quarrel_private.lawyer_debates d where d.room_id=s.room_id;
alter table quarrel_private.lawyer_messages alter column debate_id set not null;
alter table quarrel_private.lawyer_subtopics alter column debate_id set not null;
create index lawyer_messages_session on quarrel_private.lawyer_messages(debate_id,revision,generation,created_at,id);
create index lawyer_subtopics_session on quarrel_private.lawyer_subtopics(debate_id,revision,generation,ordinal);

create function quarrel_private.lawyer_track_session() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;a public.quarrel_players;b public.quarrel_players;
begin
 select * into r from public.quarrel_rooms where id=new.room_id;
 select * into a from public.quarrel_players where room_id=new.room_id and slot='A';
 select * into b from public.quarrel_players where room_id=new.room_id and slot='B';
 insert into quarrel_private.lawyer_sessions(id,room_id,player_a,player_b,name_a,name_b,theme_id,topic,position_a,position_b,total_seconds,revision,generation,started_at,completed_at,verdict)
 values(new.debate_id,new.room_id,a.user_id,b.user_id,a.display_name,b.display_name,r.theme_id,new.topic,new.position_a,new.position_b,new.total_seconds,new.revision,new.plan_generation,new.started_at,case when new.phase='complete' then clock_timestamp() end,new.verdict)
 on conflict(id) do update set
 player_a=coalesce(quarrel_private.lawyer_sessions.player_a,excluded.player_a),player_b=coalesce(quarrel_private.lawyer_sessions.player_b,excluded.player_b),
 name_a=coalesce(quarrel_private.lawyer_sessions.name_a,excluded.name_a),name_b=coalesce(quarrel_private.lawyer_sessions.name_b,excluded.name_b),
 theme_id=excluded.theme_id,topic=excluded.topic,position_a=excluded.position_a,position_b=excluded.position_b,total_seconds=excluded.total_seconds,
 revision=excluded.revision,generation=excluded.generation,started_at=excluded.started_at,
 completed_at=coalesce(quarrel_private.lawyer_sessions.completed_at,excluded.completed_at),verdict=excluded.verdict;
 return new;
end;$$;
create trigger lawyer_session_metadata before insert or update on quarrel_private.lawyer_debates for each row execute function quarrel_private.lawyer_track_session();
create function quarrel_private.lawyer_attach_session() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select debate_id into new.debate_id from quarrel_private.lawyer_debates where room_id=new.room_id;
 return new;
end;$$;
create trigger lawyer_message_session before insert on quarrel_private.lawyer_messages for each row execute function quarrel_private.lawyer_attach_session();
create trigger lawyer_subtopic_session before insert on quarrel_private.lawyer_subtopics for each row execute function quarrel_private.lawyer_attach_session();

-- Keep the reviewed Stage 5 validation/clock implementation, then add strict
-- version-2 verdict validation around it. Private helper copies are not callable.
do $$declare definition text;begin
 definition:=pg_get_functiondef('quarrel_private.lawyer_finish(uuid,jsonb,timestamptz)'::regprocedure);
 execute replace(definition,'FUNCTION quarrel_private.lawyer_finish(', 'FUNCTION quarrel_private.stage5_lawyer_finish(');
 definition:=pg_get_functiondef('quarrel_private.reconcile_lawyer(uuid)'::regprocedure);
 execute replace(definition,'FUNCTION quarrel_private.reconcile_lawyer(', 'FUNCTION quarrel_private.stage5_reconcile_lawyer(');
end;$$;

create or replace function quarrel_private.lawyer_finish(p_id uuid,p_result jsonb,p_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare m quarrel_private.lawyer_messages;d quarrel_private.lawyer_debates;v jsonb;reduced jsonb;side text;item jsonb;summaries jsonb;
begin
 select * into m from quarrel_private.lawyer_messages where id=p_id;
 select * into d from quarrel_private.lawyer_debates where room_id=m.room_id;
 if m.status='complete' then return;end if;
 if m.debate_id<>d.debate_id then raise exception 'STALE_DEBATE';end if;
 if m.kind<>'jury' or d.reliability_version=1 then perform quarrel_private.stage5_lawyer_finish(p_id,p_result,p_at);return;end if;
 v:=p_result->'verdict';
 if p_result->>'source' is distinct from 'ai' or jsonb_typeof(v) is distinct from 'object' then raise exception 'INVALID_LAWYER_RESPONSE';end if;
 if v->>'decision' is null or v->>'decision' not in('A','B','tie','inconclusive')
 or v->>'outcome' is distinct from (case when v->>'decision' in('A','B') then v->>'decision' else 'split' end)
 or v->>'topic' is distinct from d.topic or v->>'positionA' is distinct from d.position_a or v->>'positionB' is distinct from d.position_b
 or jsonb_typeof(v->'strongestArguments') is distinct from 'object' or jsonb_typeof(v->'weaknesses') is distinct from 'object'
 or (v->'compromise' is distinct from 'null'::jsonb and (jsonb_typeof(v->'compromise') is distinct from 'string' or not quarrel_private.lawyer_safe_text(v->>'compromise',600)))
 or exists(select 1 from jsonb_object_keys(v) k where k not in('decision','outcome','topic','positionA','positionB','reasoning','strongestArguments','weaknesses','perSubtopic','compromise')) then raise exception 'INVALID_LAWYER_RESPONSE';end if;
 if exists(select 1 from jsonb_object_keys(v->'strongestArguments') k where k not in('A','B')) or exists(select 1 from jsonb_object_keys(v->'weaknesses') k where k not in('A','B')) then raise exception 'INVALID_LAWYER_RESPONSE';end if;
 foreach side in array array['A','B'] loop
  if jsonb_typeof(v->'strongestArguments'->side) is distinct from 'string' or not quarrel_private.lawyer_safe_text(v->'strongestArguments'->>side,900)
  or jsonb_typeof(v->'weaknesses'->side) is distinct from 'array' then raise exception 'INVALID_LAWYER_RESPONSE';end if;
  if jsonb_array_length(v->'weaknesses'->side)>5 then raise exception 'INVALID_LAWYER_RESPONSE';end if;
  for item in select value from jsonb_array_elements(v->'weaknesses'->side) loop
   if jsonb_typeof(item) is distinct from 'string' or not quarrel_private.lawyer_safe_text(item#>>'{}',600) then raise exception 'INVALID_LAWYER_RESPONSE';end if;
  end loop;
 end loop;
 -- The actual saved summaries are attached by the database, never invented by a model.
 select coalesce(jsonb_agg(jsonb_build_object('ordinal',subtopic,'text',text,'source',source) order by subtopic),'[]'::jsonb) into summaries
 from quarrel_private.lawyer_messages where debate_id=d.debate_id and revision=d.revision and generation=d.plan_generation and kind='summary' and status='complete';
 if jsonb_array_length(summaries)<>(select count(*) from quarrel_private.lawyer_subtopics where debate_id=d.debate_id and revision=d.revision and generation=d.plan_generation) then raise exception 'SUMMARIES_NOT_READY';end if;
 if not exists(select 1 from quarrel_private.lawyer_messages where debate_id=d.debate_id and revision=d.revision and generation=d.plan_generation and kind='lawyer' and status='complete') and v->>'decision'<>'inconclusive' then raise exception 'INVALID_LAWYER_RESPONSE';end if;
 reduced:=jsonb_set(p_result,'{verdict}',jsonb_build_object('outcome',v->'outcome','reasoning',v->'reasoning','perSubtopic',v->'perSubtopic'));
 perform quarrel_private.stage5_lawyer_finish(p_id,reduced,p_at);
 v:=v||jsonb_build_object('subtopicSummaries',summaries);
 update quarrel_private.lawyer_messages set result=jsonb_set(p_result,'{verdict}',v),error_code=null,retry_at=null where id=p_id;
 update quarrel_private.lawyer_debates set verdict=v where room_id=m.room_id;
end;$$;

-- A failed jury call is not a verdict. Retry at most three times automatically;
-- later authorized retries are rate-limited but never alter writing clocks.
create function quarrel_private.lawyer_fail_attempt(p_id uuid,p_error_code text,p_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare m quarrel_private.lawyer_messages;
begin
 select * into m from quarrel_private.lawyer_messages where id=p_id;
 if m.status='complete' then return;end if;
 if m.kind='jury' then
  update quarrel_private.lawyer_messages set claimed_at=null,claim_token=null,error_code=p_error_code,
   retry_at=case when attempts<3 and p_error_code not in('quota_exhausted','missing_configuration','demo_mode','unsafe_dispute') then p_at+case when attempts<2 then interval '5 seconds' else interval '15 seconds' end end,
   deadline_at='infinity'::timestamptz where id=p_id;
 else
  perform quarrel_private.lawyer_finish(p_id,quarrel_private.lawyer_fallback(m),p_at);
 end if;
 update public.quarrel_rooms set debate_version=debate_version+1 where id=m.room_id;
end;$$;

create or replace function quarrel_private.reconcile_lawyer(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare d quarrel_private.lawyer_debates;m quarrel_private.lawyer_messages;at_time timestamptz:=clock_timestamp();changed boolean;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=p_room;
 if not found then return;end if;
 if d.reliability_version=1 then perform quarrel_private.stage5_reconcile_lawyer(p_room);return;end if;
 loop
  changed:=false;
  for m in select * from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and generation=d.plan_generation and status='pending' and deadline_at<=at_time order by created_at,id loop
   if m.kind='jury' and m.claimed_at is null then
    update quarrel_private.lawyer_messages set deadline_at='infinity'::timestamptz where id=m.id;
   else perform quarrel_private.lawyer_fail_attempt(m.id,'timeout',at_time);end if;
   changed:=true;
  end loop;
  select * into d from quarrel_private.lawyer_debates where room_id=p_room;
  if d.state='composing' and d.turn_deadline<=at_time then
   update quarrel_private.lawyer_subtopics set remaining_ms_a=case when d.active_slot='A' then 0 else remaining_ms_a end,remaining_ms_b=case when d.active_slot='B' then 0 else remaining_ms_b end where room_id=p_room and revision=d.revision and generation=d.plan_generation and ordinal=d.current_subtopic;
   perform quarrel_private.lawyer_next_writer(p_room,case when d.active_slot='A' then 'B' else 'A' end,d.turn_deadline);changed:=true;
   update public.quarrel_rooms set debate_version=debate_version+1 where id=p_room;
  elsif d.phase='summary' and d.summary_until<=at_time then
   perform quarrel_private.lawyer_open_subtopic(p_room,d.current_subtopic+1,d.summary_until);changed:=true;
   update public.quarrel_rooms set debate_version=debate_version+1 where id=p_room;
  end if;
  exit when not changed;
 end loop;
end;$$;

create or replace function quarrel_private.lawyer_snapshot(p_room uuid) returns jsonb
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
 return jsonb_build_object('debateId',d.debate_id,'reliabilityVersion',d.reliability_version,'format','lawyer','phase',d.phase,'topic',d.topic,'totalSeconds',d.total_seconds,'revision',d.revision,'positionA',d.position_a,'positionB',d.position_b,'confirmedA',d.confirmed_a,'confirmedB',d.confirmed_b,'planReady',d.plan_ready,'regenerationUsed',d.regeneration_used,'planGeneration',d.plan_generation,'subtopics',subs,'currentSubtopic',d.current_subtopic,
  'state',case when d.state='consulting' and d.active_slot<>who then 'lawyering' else d.state end,'activeSlot',case when d.state='composing' then d.active_slot else null end,'turnDeadline',d.turn_deadline,'remainingMsA',coalesce(current_s.remaining_ms_a,0),'remainingMsB',coalesce(current_s.remaining_ms_b,0),'serverNow',clock_timestamp(),'startedAt',d.started_at,'history',history,'consultations',private_history,'verdict',d.verdict,
  'ownMessageCount',(select count(*) from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and subtopic=d.current_subtopic and slot=who and kind='lawyer'),
  'ownConsultationCount',(select count(*) from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and subtopic=d.current_subtopic and requested_by=auth.uid() and kind='consult'),
  'acknowledgements',(select jsonb_build_object('A',acknowledged_a,'B',acknowledged_b) from quarrel_private.lawyer_sessions where id=d.debate_id),
  'rematch',(select jsonb_build_object('A',rematch_a,'B',rematch_b,'nextDebateId',next_debate_id) from quarrel_private.lawyer_sessions where id=d.debate_id),
  'juryStatus',(select jsonb_build_object('state',case when status='complete' then 'complete' when claimed_at is not null then 'processing' when error_code is not null and retry_at is null then 'retry_required' when retry_at>clock_timestamp() then 'retry_wait' else 'pending' end,'attempts',attempts,'retryAt',retry_at,'errorCode',error_code) from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and generation=d.plan_generation and kind='jury'),
  'needsWork',exists(select 1 from quarrel_private.lawyer_messages where room_id=p_room and revision=d.revision and generation=d.plan_generation and status='pending' and claimed_at is null and (d.reliability_version=1 or kind<>'jury' or ((attempts=0 or retry_at is not null) and coalesce(retry_at,'-infinity'::timestamptz)<=clock_timestamp())) and (kind<>'consult' or requested_by=auth.uid())));
end; $$;

create function quarrel_private.lawyer_claim_work(p_server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates;m quarrel_private.lawyer_messages;args jsonb;players jsonb;subs jsonb;consults jsonb;ctx jsonb;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 perform quarrel_private.reconcile_lawyer(r.id);select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then return null;end if;
 if exists(select 1 from quarrel_private.lawyer_messages where room_id=r.id and revision=d.revision and generation=d.plan_generation and status='pending' and claimed_at is not null) then return null;end if;
 select * into m from quarrel_private.lawyer_messages where room_id=r.id and revision=d.revision and generation=d.plan_generation and status='pending' and claimed_at is null and (d.reliability_version=1 or kind<>'jury' or ((attempts=0 or retry_at is not null) and coalesce(retry_at,'-infinity'::timestamptz)<=clock_timestamp())) and (kind<>'consult' or requested_by=auth.uid()) order by created_at,id limit 1;
 if not found then return null;end if;
 update quarrel_private.lawyer_messages set claimed_at=clock_timestamp(),claim_token=gen_random_uuid(),attempts=attempts+1,retry_at=null,deadline_at=clock_timestamp()+interval '20 seconds' where id=m.id returning * into m;
 select jsonb_agg(jsonb_build_object('slot',slot,'name',display_name,'position',case when slot='A' then d.position_a else d.position_b end) order by slot) into players from public.quarrel_players where room_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('ordinal',ordinal,'question',question,'secondsPerPlayer',seconds_per_player) order by ordinal),'[]'::jsonb) into subs from quarrel_private.lawyer_subtopics where room_id=r.id and revision=d.revision and generation=d.plan_generation;
 select coalesce(jsonb_agg(quarrel_private.lawyer_message_json(x,case when d.reliability_version=2 and m.kind in('summary','jury') then null else m.slot end,d.reliability_version=1 and m.kind in ('summary','jury')) order by x.created_at,x.id),'[]'::jsonb) into args from quarrel_private.lawyer_messages x where x.room_id=r.id and x.revision=d.revision and x.generation=d.plan_generation and x.kind in ('lawyer','summary','announcement') and x.status='complete' and (m.kind<>'summary' or x.subtopic=m.subtopic);
 ctx:=jsonb_build_object('themeId',r.theme_id,'topic',d.topic,'totalSeconds',d.total_seconds,'players',players,'subtopics',subs,'currentSubtopic',d.current_subtopic,'messages',args);
 if m.kind='consult' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'subtopic',subtopic,'playerText',raw_text,'text',text,'source',source,'status',status,'createdAt',created_at) order by created_at,id),'[]'::jsonb) into consults from quarrel_private.lawyer_messages where room_id=r.id and revision=d.revision and kind='consult' and requested_by=m.requested_by and status='complete';
  ctx:=ctx||jsonb_build_object('consultations',consults);
 end if;
 return jsonb_build_object('id',m.id,'debateId',d.debate_id,'claimToken',m.claim_token,'kind',m.kind,'mode',d.mode,'slot',m.slot,'playerText',m.raw_text,'context',ctx);
end; $$;

create or replace function public.claim_quarrel_lawyer_work(p_server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 if (select reliability_version from quarrel_private.lawyer_debates where room_id=r.id)=2 then return null;end if;
 return quarrel_private.lawyer_claim_work(p_server_key);
end;$$;

create function public.claim_quarrel_lawyer_work_v2(p_server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;if not found then return null;end if;
 -- Never upgrade while an old deployment owns a live lease.
 if d.reliability_version=1 then
  perform quarrel_private.reconcile_lawyer(r.id);
  if exists(select 1 from quarrel_private.lawyer_messages where room_id=r.id and revision=d.revision and generation=d.plan_generation and status='pending' and claimed_at is not null) then return null;end if;
  if d.phase<>'complete' then update quarrel_private.lawyer_debates set reliability_version=2 where room_id=r.id;end if;
 end if;
 return quarrel_private.lawyer_claim_work(p_server_key);
end;$$;

create function public.create_quarrel_lawyer_room_v2(p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;r uuid;
begin
 s:=public.create_quarrel_lawyer_room(p_name);r:=(s->>'id')::uuid;
 update quarrel_private.lawyer_debates d set reliability_version=2 where room_id=r and started_at is null
 and not exists(select 1 from quarrel_private.lawyer_messages m where m.room_id=r and m.revision=d.revision and m.generation=d.plan_generation and m.status='pending' and m.claimed_at is not null);
 return public.get_quarrel_room();
end;$$;

-- Existing deployment compatibility: its first claim may finish without a
-- token. After a retry only the version-2 fenced completion is accepted.
create or replace function public.finish_quarrel_lawyer_work(p_id uuid,p_result jsonb,p_server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;m quarrel_private.lawyer_messages;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 perform quarrel_private.reconcile_lawyer(r.id);
 select * into m from quarrel_private.lawyer_messages where id=p_id and room_id=r.id and (kind<>'consult' or requested_by=auth.uid());if not found then raise exception 'LAWYER_REQUEST_NOT_FOUND';end if;
 if m.status='complete' then return public.get_quarrel_room();end if;
 if m.claimed_at is null then raise exception 'LAWYER_REQUEST_NOT_CLAIMED';end if;
 if m.attempts>1 or (select reliability_version=2 from quarrel_private.lawyer_debates where room_id=r.id) then raise exception 'STALE_LAWYER_CLAIM';end if;
 perform quarrel_private.lawyer_finish(p_id,p_result,clock_timestamp());return public.get_quarrel_room();
end;$$;

create function public.finish_quarrel_lawyer_work_v2(p_id uuid,p_result jsonb,p_server_key text,p_claim_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;m quarrel_private.lawyer_messages;d quarrel_private.lawyer_debates;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 perform quarrel_private.reconcile_lawyer(r.id);
 select * into m from quarrel_private.lawyer_messages where id=p_id and room_id=r.id and (kind<>'consult' or requested_by=auth.uid());if not found then raise exception 'LAWYER_REQUEST_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;
 if m.debate_id<>d.debate_id or m.revision<>d.revision or m.generation<>d.plan_generation then raise exception 'STALE_DEBATE';end if;
 if m.status='complete' then return public.get_quarrel_room();end if;
 if p_claim_token is null or m.claim_token is distinct from p_claim_token or m.claimed_at is null then raise exception 'STALE_LAWYER_CLAIM';end if;
 perform quarrel_private.lawyer_finish(p_id,p_result,clock_timestamp());return public.get_quarrel_room();
end;$$;

create function public.fail_quarrel_lawyer_work(p_id uuid,p_claim_token uuid,p_server_key text,p_error_code text default 'provider_unavailable') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;m quarrel_private.lawyer_messages;d quarrel_private.lawyer_debates;
begin
 perform quarrel_private.assert_judge_server(p_server_key);r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 perform quarrel_private.reconcile_lawyer(r.id);
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;
 select * into m from quarrel_private.lawyer_messages where id=p_id and room_id=r.id and (kind<>'consult' or requested_by=auth.uid());if not found then raise exception 'LAWYER_REQUEST_NOT_FOUND';end if;
 if m.debate_id<>d.debate_id or m.revision<>d.revision or m.generation<>d.plan_generation then raise exception 'STALE_DEBATE';end if;
 if m.status='complete' then return public.get_quarrel_room();end if;
 -- A repeated failure acknowledgement does not schedule another attempt.
 if m.claimed_at is null and m.error_code is not null then return public.get_quarrel_room();end if;
 if p_claim_token is null or m.claim_token is distinct from p_claim_token or m.claimed_at is null then raise exception 'STALE_LAWYER_CLAIM';end if;
 if p_error_code is null or p_error_code not in('quota_exhausted','rate_limited','provider_unavailable','timeout','invalid_response','missing_configuration','demo_mode','unsafe_dispute') then raise exception 'INVALID_LAWYER_RESPONSE';end if;
 perform quarrel_private.lawyer_fail_attempt(p_id,p_error_code,clock_timestamp());
 return public.get_quarrel_room();
end;$$;

create function public.retry_quarrel_lawyer_jury(p_debate_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates;m quarrel_private.lawyer_messages;at_time timestamptz:=clock_timestamp();
begin
 r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;
 if p_debate_id is distinct from d.debate_id then raise exception 'STALE_DEBATE';end if;
 if d.phase<>'jury' then raise exception 'JURY_RETRY_NOT_READY';end if;
 perform quarrel_private.reconcile_lawyer(r.id);
 select * into m from quarrel_private.lawyer_messages where debate_id=d.debate_id and revision=d.revision and generation=d.plan_generation and kind='jury';
 if not found or m.status='complete' then raise exception 'JURY_RETRY_NOT_READY';end if;
 if m.claimed_at is not null or m.retry_at is not null or m.attempts=0 then return public.get_quarrel_room();end if;
 if m.last_retry_at>at_time-interval '60 seconds' then raise exception 'JURY_RETRY_RATE_LIMITED';end if;
 update quarrel_private.lawyer_messages set attempts=0,retry_at=at_time,last_retry_at=at_time,claim_token=null,claimed_at=null,deadline_at='infinity'::timestamptz where id=m.id;
 update public.quarrel_rooms set debate_version=debate_version+1 where id=r.id;
 return public.get_quarrel_room();
end;$$;

create function quarrel_private.lawyer_result_json(s quarrel_private.lawyer_sessions,p_detail boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=jsonb_build_object('id',s.id,'roomId',s.room_id,'topic',s.topic,'themeId',s.theme_id,'totalSeconds',s.total_seconds,'startedAt',s.started_at,'completedAt',s.completed_at,'verdict',s.verdict,
 'acknowledgements',jsonb_build_object('A',s.acknowledged_a,'B',s.acknowledged_b),
 'rematch',jsonb_build_object('A',s.rematch_a,'B',s.rematch_b,'nextDebateId',s.next_debate_id));
 if p_detail then
  result:=result||jsonb_build_object('positions',jsonb_build_object('A',s.position_a,'B',s.position_b),'players',jsonb_build_array(jsonb_build_object('slot','A','name',s.name_a),jsonb_build_object('slot','B','name',s.name_b)),
   'history',(select coalesce(jsonb_agg(quarrel_private.lawyer_message_json(m,null,false)||jsonb_build_object('debateId',s.id) order by m.created_at,m.id),'[]'::jsonb) from quarrel_private.lawyer_messages m where m.debate_id=s.id and m.revision=s.revision and m.generation=s.generation and m.status='complete' and m.kind in('lawyer','summary','jury','announcement')),
   'subtopics',(select coalesce(jsonb_agg(jsonb_build_object('ordinal',t.ordinal,'question',t.question,'secondsPerPlayer',t.seconds_per_player,'summary',(select text from quarrel_private.lawyer_messages m where m.debate_id=s.id and m.revision=s.revision and m.generation=s.generation and m.kind='summary' and m.subtopic=t.ordinal and m.status='complete')) order by t.ordinal),'[]'::jsonb) from quarrel_private.lawyer_subtopics t where t.debate_id=s.id and t.revision=s.revision and t.generation=s.generation));
 end if;
 return result;
end;$$;

create function public.list_quarrel_lawyer_results(p_room_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 return (select coalesce(jsonb_agg(quarrel_private.lawyer_result_json(s,false) order by s.completed_at desc,s.id),'[]'::jsonb)
 from (select * from quarrel_private.lawyer_sessions where completed_at is not null and (player_a=auth.uid() or player_b=auth.uid()) and (p_room_id is null or room_id=p_room_id) order by completed_at desc,id limit 100) s);
end;$$;
create function public.get_quarrel_lawyer_results(p_debate_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s quarrel_private.lawyer_sessions;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 select * into s from quarrel_private.lawyer_sessions where id=p_debate_id and (player_a=auth.uid() or player_b=auth.uid());
 if not found then raise exception 'RESULTS_NOT_FOUND';end if;
 if s.completed_at is null then raise exception 'RESULTS_NOT_READY';end if;
 return quarrel_private.lawyer_result_json(s,true);
end;$$;

create function public.acknowledge_quarrel_lawyer_results(p_debate_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s quarrel_private.lawyer_sessions;r uuid;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 select room_id into r from quarrel_private.lawyer_sessions where id=p_debate_id and (player_a=auth.uid() or player_b=auth.uid());if not found then raise exception 'RESULTS_NOT_FOUND';end if;
 -- Consistent room-then-session lock order with rematch and worker completion.
 perform 1 from public.quarrel_rooms where id=r for update;
 select * into s from quarrel_private.lawyer_sessions where id=p_debate_id for update;
 if s.completed_at is null then raise exception 'RESULTS_NOT_READY';end if;
 if (s.player_a=auth.uid() and s.acknowledged_a is not null) or (s.player_b=auth.uid() and s.acknowledged_b is not null) then return public.get_quarrel_lawyer_results(p_debate_id);end if;
 update quarrel_private.lawyer_sessions set acknowledged_a=case when player_a=auth.uid() then coalesce(acknowledged_a,clock_timestamp()) else acknowledged_a end,
 acknowledged_b=case when player_b=auth.uid() then coalesce(acknowledged_b,clock_timestamp()) else acknowledged_b end where id=p_debate_id;
 update public.quarrel_rooms set debate_version=debate_version+1 where id=r;
 return public.get_quarrel_lawyer_results(p_debate_id);
end;$$;

create function public.request_quarrel_lawyer_rematch(p_debate_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.quarrel_rooms;d quarrel_private.lawyer_debates;s quarrel_private.lawyer_sessions;next_id uuid;
begin
 r:=quarrel_private.lock_member_room();if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 select * into s from quarrel_private.lawyer_sessions where id=p_debate_id and room_id=r.id and (player_a=auth.uid() or player_b=auth.uid()) for update;
 if not found then raise exception 'RESULTS_NOT_FOUND';end if;
 select * into d from quarrel_private.lawyer_debates where room_id=r.id;
 if s.next_debate_id is not null then return public.get_quarrel_room();end if;
 if d.debate_id<>p_debate_id then raise exception 'STALE_DEBATE';end if;
 if d.phase<>'complete' or s.completed_at is null then raise exception 'REMATCH_NOT_READY';end if;
 if not exists(select 1 from public.quarrel_players where room_id=r.id and slot='A' and user_id=s.player_a) or not exists(select 1 from public.quarrel_players where room_id=r.id and slot='B' and user_id=s.player_b) then raise exception 'ROOM_CLOSED';end if;
 update quarrel_private.lawyer_sessions set rematch_a=case when player_a=auth.uid() then coalesce(rematch_a,clock_timestamp()) else rematch_a end,
 rematch_b=case when player_b=auth.uid() then coalesce(rematch_b,clock_timestamp()) else rematch_b end where id=p_debate_id returning * into s;
 if s.rematch_a is not null and s.rematch_b is not null then
  next_id:=gen_random_uuid();
  -- Revision remains monotonic: an old tab cannot mutate the new session.
  update quarrel_private.lawyer_debates set debate_id=next_id,reliability_version=2,phase='setup',topic=null,total_seconds=240,revision=revision+1,
   position_a=null,position_b=null,confirmed_a=false,confirmed_b=false,plan_ready=false,regeneration_used=false,plan_generation=0,
   current_subtopic=null,state=null,active_slot=null,turn_deadline=null,summary_until=null,started_at=null,verdict=null where room_id=r.id;
  update quarrel_private.lawyer_sessions set next_debate_id=next_id where id=p_debate_id;
  update public.quarrel_players set ready=false where room_id=r.id;
  update public.quarrel_rooms set theme_locked=false where id=r.id;
 end if;
 update public.quarrel_rooms set debate_version=debate_version+1 where id=r.id;
 return public.get_quarrel_room();
end;$$;

-- Every private helper remains inaccessible. Public RPCs require verified auth;
-- claim/finish/fail additionally require the existing server capability.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='quarrel_private' and (p.proname like 'lawyer_%' or p.proname in('stage5_lawyer_finish','stage5_reconcile_lawyer','reconcile_lawyer')))
 or (n.nspname='public' and p.proname in('claim_quarrel_lawyer_work','claim_quarrel_lawyer_work_v2','create_quarrel_lawyer_room_v2','finish_quarrel_lawyer_work','finish_quarrel_lawyer_work_v2','fail_quarrel_lawyer_work','retry_quarrel_lawyer_jury','list_quarrel_lawyer_results','get_quarrel_lawyer_results','acknowledge_quarrel_lawyer_results','request_quarrel_lawyer_rematch')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
