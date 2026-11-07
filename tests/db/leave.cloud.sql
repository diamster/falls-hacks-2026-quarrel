-- Authenticated Cloud checks. Run as ONE transaction; all fixtures/key changes
-- roll back. No deletion/reset of real rooms and no provider requests.
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  old_id uuid; new_id uuid; c_id uuid; lone_id uuid; old_code text; c_code text; lone_code text;
  snapshot jsonb; original_history jsonb; original_messages jsonb; job jsonb;
  denied boolean; key text := gen_random_uuid()::text || gen_random_uuid()::text;
  lines jsonb := '{"themeId":"jungle","introduction":"Welcome {playerA} and {playerB}: {topic}","opening":"{speaker}, opening time.","rebuttal":"{speaker}, rebuttal time.","questions":"{speaker}, answer your question.","complete":"Record complete. No winner."}';
begin
  assert not has_function_privilege('anon','public.leave_quarrel_room(uuid)','EXECUTE'),'Anonymous API role cannot leave rooms';
  assert has_function_privilege('authenticated','public.leave_quarrel_room(uuid)','EXECUTE'),'Verified sessions can leave';
  assert not has_function_privilege('authenticated','quarrel_private.check_room_request(uuid)','EXECUTE'),'Room guard is private';
  assert not has_table_privilege('authenticated','public.quarrel_players','UPDATE'),'Browser cannot detach another player';
  insert into auth.users(id,aud,role,is_anonymous,created_at,updated_at) values
    (a,'authenticated','authenticated',true,now(),now()),(b,'authenticated','authenticated',true,now(),now()),
    (c,'authenticated','authenticated',true,now(),now()),(d,'authenticated','authenticated',true,now(),now());
  update quarrel_private.judge_settings set key_hash=sha256(convert_to(key,'UTF8')) where singleton;
  execute 'set local role authenticated';
  perform set_config('request.headers','{}',true);
  perform set_config('request.jwt.claim.sub',a::text,true);
  snapshot:=public.create_quarrel_room('Original Alex');perform public.set_quarrel_theme('jungle');old_id:=(snapshot->>'id')::uuid;old_code:=snapshot->>'code';
  perform public.propose_quarrel_debate('Should we grow herbs?','Cooking ingredients matter','Flowers matter',0);perform public.set_quarrel_ready(true);
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.join_quarrel_room(old_code,'Original Blair');perform public.approve_quarrel_debate(1);perform public.set_quarrel_ready(true);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.start_quarrel_judged_debate(1,key,'demo',2,lines);
  perform public.begin_quarrel_judge_message('Help us compare values.',1,0,gen_random_uuid(),key);job:=public.claim_quarrel_judge_work(key);
  perform public.finish_quarrel_judge_work((job->>'id')::uuid,'{"text":"What matters to each side?","reaction":"questioning","source":"demo"}',key);
  perform public.submit_quarrel_argument('Herbs provide cooking ingredients.',1,0);
  perform set_config('request.jwt.claim.sub',b::text,true);perform public.submit_quarrel_argument('Flowers provide visual interest.',1,1);
  perform set_config('request.jwt.claim.sub',a::text,true);perform public.submit_quarrel_argument('Flowering herbs could support both aims.',1,2);
  perform set_config('request.jwt.claim.sub',b::text,true);perform public.submit_quarrel_argument('We should compare flowering seasons.',1,3);
  job:=public.claim_quarrel_judge_work(key);
  perform public.finish_quarrel_judge_work((job->>'id')::uuid,'{"text":"Clarify each point.","reaction":"questioning","source":"demo","questions":[{"slot":"A","text":"Which cooking uses matter?","source":"demo"},{"slot":"B","text":"Which flowering seasons matter?","source":"demo"}]}',key);
  perform set_config('request.jwt.claim.sub',a::text,true);perform public.submit_quarrel_argument('Our weekly meals.',1,4);
  perform set_config('request.jwt.claim.sub',b::text,true);snapshot:=public.submit_quarrel_argument('The summer season.',1,5);
  original_history:=snapshot #> '{debate,history}';original_messages:=snapshot #> '{judge,messages}';
  assert jsonb_array_length(original_history)=6,'Completed fixture has six official entries';

  perform set_config('request.jwt.claim.sub',c::text,true);
  assert public.leave_quarrel_room(old_id) is null,'Unseated outsider cannot affect another room';
  assert public.get_quarrel_room() is null,'Leaving does not grant outsider access';
  perform set_config('request.jwt.claim.sub',a::text,true);
  denied:=false;begin perform public.leave_quarrel_room(gen_random_uuid());exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Wrong room cannot detach current seat';
  denied:=false;begin perform public.leave_quarrel_room(null);exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Expected room is required';
  assert public.leave_quarrel_room(old_id) is null,'Leave returns empty current room';
  assert public.leave_quarrel_room(old_id) is null,'Leave retry is idempotent before another room';
  assert public.get_quarrel_room() is null,'Departed session no longer resumes old room';
  assert not exists(select 1 from public.quarrel_rooms where id=old_id),'RLS removes old room access after leaving';
  assert not exists(select 1 from public.quarrel_players where room_id=old_id),'RLS removes old player access after leaving';
  snapshot:=public.create_quarrel_room('New Alex');new_id:=(snapshot->>'id')::uuid;
  assert new_id<>old_id,'Same identity can create a fresh room';
  assert snapshot->>'you'='A','New room assigns host slot';
  assert snapshot #>> '{players,0,name}'='New Alex','New display name saved separately';
  assert snapshot #>> '{debate,phase}'='setup','New room starts in setup';
  assert snapshot #> '{debate,history}'='[]'::jsonb,'Old history never becomes new history';
  denied:=false;begin perform public.leave_quarrel_room(old_id);exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Delayed leave retry cannot leave newer room';
  assert (public.get_quarrel_room()->>'id')::uuid=new_id,'New room survives stale leave';

  perform set_config('request.headers',jsonb_build_object('x-quarrel-room-id',old_id)::text,true);
  denied:=false;begin perform public.set_quarrel_ready(true);exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Stale tab cannot ready a new room';
  denied:=false;begin perform public.set_quarrel_theme('courtroom');exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Stale tab cannot change a new theme';
  denied:=false;begin perform public.heartbeat_quarrel_room();exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Stale heartbeat cannot mutate new room';
  denied:=false;begin perform public.propose_quarrel_debate('Wrong room topic','A side','B side',0);exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Stale topic cannot affect a new room';
  denied:=false;begin perform public.submit_quarrel_argument('Old argument',1,0);exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Stale argument cannot affect new room';
  denied:=false;begin perform public.get_quarrel_room();exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Guarded reads cannot silently switch room context';
  perform set_config('request.headers',jsonb_build_object('x-quarrel-room-id',new_id)::text,true);
  snapshot:=public.set_quarrel_theme('detective');assert snapshot->>'themeId'='detective','Matching room header permits own action';
  assert snapshot #>> '{players,0,ready}'='false','Rejected old readiness did not mutate new state';
  perform set_config('request.headers','{}',true);

  perform set_config('request.jwt.claim.sub',b::text,true);snapshot:=public.get_quarrel_room();
  assert snapshot #> '{debate,history}'=original_history,'Peer retains all official submissions';
  assert snapshot #> '{judge,messages}'=original_messages,'Peer retains judge conversation';
  assert snapshot #>> '{players,0,name}'='Original Alex','Departed name remains in the record';
  assert snapshot #>> '{players,0,connected}'='false','Departed player immediately disconnected';
  assert snapshot #>> '{players,0,ready}'='false','Departed player no longer ready';
  assert jsonb_array_length(snapshot->'players')=2,'Both historical slots retained';
  assert (public.join_quarrel_room(old_code,'Original Blair')->>'id')::uuid=old_id,'Remaining member can recover old room';
  perform set_config('request.jwt.claim.sub',c::text,true);
  denied:=false;begin perform public.join_quarrel_room(old_code,'Replacement');exception when sqlstate 'P0001' then assert sqlerrm='ROOM_CLOSED';denied:=true;end;assert denied,'Departed seat cannot be taken by outsider';
  assert public.get_quarrel_room() is null,'Rejected join leaves identity unseated';
  snapshot:=public.create_quarrel_room('Casey');c_id:=(snapshot->>'id')::uuid;c_code:=snapshot->>'code';
  denied:=false;begin perform public.leave_quarrel_room(old_id);exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Seated outsider cannot leave another room';
  perform set_config('request.jwt.claim.sub',a::text,true);perform public.leave_quarrel_room(new_id);
  snapshot:=public.join_quarrel_room(c_code,'Alex joins');
  assert (snapshot->>'id')::uuid=c_id and snapshot->>'you'='B','Same identity can leave then join another room';
  assert (select count(*) from public.quarrel_players where user_id=a)=1,'Identity retains only one current seat';
  perform public.leave_quarrel_room(c_id);
  perform set_config('request.jwt.claim.sub',c::text,true);snapshot:=public.get_quarrel_room();
  assert snapshot #>> '{players,1,name}'='Alex joins','Guest departure also preserves its name';
  assert snapshot #>> '{players,1,connected}'='false','Guest departure immediately visible';
  perform set_config('request.jwt.claim.sub',d::text,true);
  denied:=false;begin perform public.join_quarrel_room(c_code,'Replacement guest');exception when sqlstate 'P0001' then assert sqlerrm='ROOM_CLOSED';denied:=true;end;assert denied,'Guest slot replacement is forbidden';
  snapshot:=public.create_quarrel_room('Lone host');lone_id:=(snapshot->>'id')::uuid;lone_code:=snapshot->>'code';
  perform public.leave_quarrel_room(lone_id);
  perform set_config('request.jwt.claim.sub',a::text,true);
  denied:=false;begin perform public.join_quarrel_room(lone_code,'Abandoned invite');exception when sqlstate 'P0001' then assert sqlerrm='ROOM_CLOSED';denied:=true;end;assert denied,'Unfilled abandoned host room also closes invitations';
  perform set_config('request.jwt.claim.sub',b::text,true);perform public.leave_quarrel_room(old_id);
  execute 'reset role';
  assert (select count(*) from public.quarrel_players where room_id=old_id and user_id is null)=2,'Both departed records retained';
  assert (select count(*) from quarrel_private.debate_entries where room_id=old_id)=6,'Both departures preserve private official rows';
  assert (select count(*) from quarrel_private.judge_messages where room_id=old_id)=jsonb_array_length(original_messages),'Both departures preserve private judge rows';
  -- Expiry cleanup also detaches without deleting history/name records.
  update public.quarrel_rooms set expires_at=clock_timestamp()-interval '1 second' where id=c_id;
  execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',c::text,true);
  snapshot:=public.create_quarrel_room('Casey again');assert (snapshot->>'id')::uuid<>c_id,'Expired identity can create fresh room';
  execute 'reset role';
  assert exists(select 1 from public.quarrel_players where room_id=c_id and slot='A' and user_id is null and display_name='Casey'),'Expired cleanup preserves old host name';
end;
$$;
rollback;
