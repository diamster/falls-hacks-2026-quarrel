-- Authorized development Cloud verification without Docker or extensions.
-- Run the whole file as one request. All fixtures and clock adjustments use
-- newly generated IDs inside this transaction and are unconditionally rolled
-- back on success. Assertion failures abort the transaction, never commit it.
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_room_id uuid;
  v_code text;
  v_snapshot jsonb;
  v_deadline timestamptz;
  v_denied boolean;
  v_entry_count integer;
begin
  assert not has_table_privilege('authenticated', 'quarrel_private.debate_entries', 'SELECT'), 'Hidden entries must not be selectable';
  assert not has_table_privilege('authenticated', 'quarrel_private.debates', 'SELECT'), 'Private state must not be selectable';
  assert not has_table_privilege('anon', 'quarrel_private.debate_entries', 'SELECT'), 'Anonymous API role cannot read entries';
  assert not has_table_privilege('authenticated', 'public.quarrel_rooms', 'UPDATE'), 'No direct room writes';
  assert not has_table_privilege('authenticated', 'public.quarrel_players', 'UPDATE'), 'No direct player writes';
  assert (select bool_and(relrowsecurity) from pg_class where oid in ('quarrel_private.debates'::regclass, 'quarrel_private.debate_entries'::regclass)), 'Private tables require RLS';
  assert not exists(select 1 from pg_publication_tables where schemaname = 'quarrel_private' and tablename in ('debates', 'debate_entries')), 'Private tables must not enter Realtime';
  assert (select pubinsert and pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname = 'supabase_realtime'), 'Realtime privacy guard must remain';
  assert not has_function_privilege('authenticated', 'quarrel_private.complete_debate_turn(uuid,timestamptz)', 'EXECUTE'), 'Private transition cannot be called directly';
  assert not has_function_privilege('authenticated', 'quarrel_private.reconcile_debate(uuid)', 'EXECUTE'), 'Private reconciliation cannot accept a caller room ID';
  assert not has_function_privilege('authenticated', 'quarrel_private.lock_member_room()', 'EXECUTE'), 'Private lock helper cannot be called directly';
  assert not has_function_privilege('anon', 'public.start_quarrel_debate(integer)', 'EXECUTE'), 'Start requires authentication';
  assert not has_function_privilege('anon', 'public.submit_quarrel_argument(text,integer,integer)', 'EXECUTE'), 'Submission requires authentication';

  insert into auth.users(id, aud, role, is_anonymous, created_at, updated_at) values
    (v_a, 'authenticated', 'authenticated', true, now(), now()),
    (v_b, 'authenticated', 'authenticated', true, now(), now()),
    (v_outsider, 'authenticated', 'authenticated', true, now(), now());

  -- Switch the actual database role, not just the JWT identity. These RPCs and
  -- direct-table attempts exercise the same grants as authenticated clients.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  assert public.get_quarrel_room() is null, 'Outsider snapshot must be null';
  v_denied := false;
  begin
    perform public.start_quarrel_debate(0);
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'ROOM_NOT_FOUND', 'Outsider start returned unexpected error';
    v_denied := true;
  end;
  assert v_denied, 'Outsider must not start a room';

  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_snapshot := public.create_quarrel_room('Cloud SQL host');
  v_room_id := (v_snapshot->>'id')::uuid;
  v_code := v_snapshot->>'code';
  assert v_snapshot #>> '{debate,phase}' = 'setup', 'Room must initialize setup';
  assert v_snapshot #>> '{debate,revision}' = '0', 'Initial revision must be zero';
  assert v_snapshot->>'capacity' = '2', 'Room capacity must remain two';
  perform public.set_quarrel_ready(true);
  v_snapshot := public.propose_quarrel_debate('Campus transport', 'Support the proposal', 'Oppose the proposal', 0);
  assert v_snapshot #>> '{players,0,ready}' = 'false', 'Proposal must clear prior readiness';
  assert v_snapshot #>> '{debate,approvedA}' = 'true', 'Host proposal confirms own position';
  perform public.set_quarrel_ready(true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform public.join_quarrel_room(v_code, 'Cloud SQL guest');
  perform public.approve_quarrel_debate(1);
  perform public.set_quarrel_ready(true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_snapshot := public.start_quarrel_debate(1);
  assert v_snapshot->>'themeLocked' = 'true', 'Start must atomically lock theme';
  assert (v_snapshot #>> '{debate,turnDeadline}')::timestamptz - (v_snapshot #>> '{debate,startedAt}')::timestamptz = interval '45 seconds', 'Opening duration must be 45 seconds';
  assert v_snapshot #>> '{debate,activeSlot}' = 'A', 'Opening starts with A';
  v_denied := false;
  begin
    perform public.set_quarrel_ready(false);
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'DEBATE_STARTED', 'Started readiness returned unexpected error';
    v_denied := true;
  end;
  assert v_denied, 'Readiness must be frozen after start';
  assert public.advance_quarrel_debate(1, 5) #>> '{debate,turnIndex}' = '0', 'Future index cannot force early advance';
  v_snapshot := public.submit_quarrel_argument('Private opening sentinel', 1, 0);
  assert v_snapshot #>> '{debate,history,0,text}' = 'Private opening sentinel', 'Own submission must survive recovery';
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  assert jsonb_array_length(public.get_quarrel_room() #> '{debate,history}') = 0, 'Peer opening must remain concealed';
  assert not exists(select 1 from public.quarrel_rooms r where to_jsonb(r)::text like '%Private opening sentinel%'), 'Published room row cannot contain opening text';
  assert not exists(select 1 from public.quarrel_players p where to_jsonb(p)::text like '%Private opening sentinel%'), 'Published player row cannot contain opening text';
  v_denied := false;
  begin
    perform 1 from quarrel_private.debate_entries;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  assert v_denied, 'Actual authenticated SELECT must fail for private entries';

  -- Only the rollback fixture administrator can move time. Public RPCs retain
  -- their real 45/30-second durations and accept no client-provided timestamps.
  execute 'reset role';
  v_deadline := clock_timestamp() - interval '1 second';
  update quarrel_private.debates set turn_deadline = v_deadline where room_id = v_room_id;
  update public.quarrel_players set last_seen = clock_timestamp() - interval '36 seconds' where room_id = v_room_id;
  execute 'set local role authenticated';
  v_denied := false;
  begin
    perform public.submit_quarrel_argument('Too late', 1, 1);
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'TURN_EXPIRED', 'Late submission returned unexpected error';
    v_denied := true;
  end;
  assert v_denied, 'Unreconciled expired turn cannot accept a late submission';
  v_snapshot := public.advance_quarrel_debate(1, 1);
  assert v_snapshot #>> '{debate,turnIndex}' = '2', 'Expired B opening must advance despite disconnection';
  assert (v_snapshot #>> '{debate,turnDeadline}')::timestamptz = v_deadline + interval '45 seconds', 'Next deadline must chain from old deadline';
  assert v_snapshot #>> '{debate,history,0,text}' = 'Private opening sentinel', 'Completion of both turns reveals opening';
  assert v_snapshot #>> '{debate,history,1,status}' = 'expired', 'Timeout must have explicit status';
  assert v_snapshot #>> '{debate,history,1,text}' is null, 'Timeout must not fabricate argument text';
  assert public.advance_quarrel_debate(1, 0) #>> '{debate,turnIndex}' = '2', 'Stale timer retry must not skip a new turn';
  v_denied := false;
  begin
    perform public.submit_quarrel_argument('Out of turn reconnect', 1, 2);
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'NOT_YOUR_TURN', 'Wrong-player submission returned unexpected error';
    v_denied := true;
  end;
  assert v_denied, 'Reconnection cannot claim another slot';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_snapshot := public.submit_quarrel_argument('Valid authenticated reconnect', 1, 2);
  assert v_snapshot #>> '{debate,turnIndex}' = '3', 'Stale heartbeat must not block valid own-turn submission';

  execute 'reset role';
  update quarrel_private.debates set turn_deadline = clock_timestamp() - interval '5 minutes' where room_id = v_room_id;
  execute 'set local role authenticated';
  v_snapshot := public.heartbeat_quarrel_room();
  assert v_snapshot #>> '{debate,phase}' = 'verdict', 'Heartbeat must catch up all missed offline turns';
  assert v_snapshot #>> '{debate,turnIndex}' is null, 'Completed debate must have no active turn';
  assert v_snapshot #>> '{debate,turnDeadline}' is null, 'Completed debate must have no deadline';
  assert jsonb_array_length(v_snapshot #> '{debate,history}') = 6, 'Every completed turn must be recorded exactly once';
  select count(*) into v_entry_count from jsonb_array_elements(v_snapshot #> '{debate,history}') e where e->>'status' = 'expired';
  assert v_entry_count = 4, 'Catchup must preserve two submissions and four timeouts';
  assert not (v_snapshot #> '{debate}' ? 'winner'), 'Stage 3 must not generate a winner';
  assert public.advance_quarrel_debate(1, 0) #>> '{debate,phase}' = 'verdict', 'Late timer must not restart verdict';
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  assert not exists(select 1 from public.quarrel_rooms where id = v_room_id), 'Outsider RLS must still hide completed room';
  assert public.get_quarrel_room() is null, 'Outsider must never receive completed history';
  execute 'reset role';
end;
$$;
select 'Stage 3 Cloud SQL assertions passed; all generated fixtures are rolled back by this file.' as result;
rollback;
