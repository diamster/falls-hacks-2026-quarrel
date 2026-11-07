-- Validate JSON container types before inspecting their members. Keeping this
-- change separate preserves the already-applied Stage 4 migration history.
-- Existing authenticated execute grants and member/server authorization remain.
create or replace function public.finish_quarrel_judge_work(p_id uuid, p_result jsonb, p_server_key text) returns jsonb
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
  if jsonb_typeof(p_result) is distinct from 'object' then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
  if jsonb_typeof(p_result->'text') is distinct from 'string'
    or char_length(btrim(p_result->>'text')) not between 1 and 1800
    or p_result->>'source' is null or p_result->>'source' not in ('ai','demo','fallback')
    or p_result->>'reaction' is null or p_result->>'reaction' not in ('speaking','questioning','surprised','listening')
    or exists(select 1 from jsonb_object_keys(p_result) k where k not in ('text','source','reaction','questions')) then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
  v_now := clock_timestamp();
  if v_job.kind = 'questions' then
    if jsonb_typeof(p_result->'questions') is distinct from 'array' then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
    if jsonb_array_length(p_result->'questions') <> 2 then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
    if (select count(distinct q->>'slot') from jsonb_array_elements(p_result->'questions') q where q->>'slot' in ('A','B')) <> 2 then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
    for v_q in select value from jsonb_array_elements(p_result->'questions') loop
      if jsonb_typeof(v_q) is distinct from 'object' then raise exception 'INVALID_JUDGE_RESPONSE'; end if;
      if jsonb_typeof(v_q->'text') is distinct from 'string' or char_length(btrim(v_q->>'text')) not between 1 and 600
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
