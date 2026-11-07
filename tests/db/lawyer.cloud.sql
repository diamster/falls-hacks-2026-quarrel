-- Stage 5 authenticated Cloud assertions. Run this entire transaction only
-- after the reviewed migration. Synthetic fixtures and test capability roll back.
-- No model calls, extension installation, existing room edits, or schema changes.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();
 r uuid;code text;legacy_r uuid;legacy_code text;s jsonb;j jsonb;prior jsonb;req uuid;consult_id uuid;msg_id uuid;
 k text:=gen_random_uuid()::text||gen_random_uuid()::text;
 denied boolean;rev integer;ms_a bigint;ms_b bigint;deadline timestamptz;plan_count integer;summary_id uuid;
 plan jsonb:='{"kind":"plan","source":"demo","text":"Review both perspectives.","subtopics":[{"ordinal":1,"question":"What does attendance contribute to learning?","secondsPerPlayer":60},{"ordinal":2,"question":"What flexibility should students retain?","secondsPerPlayer":60}]}';
 result jsonb;seq integer;bad jsonb;
begin
 assert not has_table_privilege('authenticated','quarrel_private.lawyer_messages','SELECT'),'No direct transcript/consultation access';
 assert not has_table_privilege('authenticated','quarrel_private.lawyer_debates','UPDATE'),'No direct clock writes';
 assert not has_function_privilege('anon','public.create_quarrel_lawyer_room(text)','EXECUTE'),'Verified identity required';
 assert not has_function_privilege('authenticated','quarrel_private.lawyer_finish(uuid,jsonb,timestamptz)','EXECUTE'),'Internal completion not callable';
 assert not has_function_privilege('authenticated','quarrel_private.stage4_room_snapshot()','EXECUTE'),'Legacy internal snapshot not exposed';
 assert not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='quarrel_private'),'No private table enters Realtime';
 assert (select pubinsert and pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname='supabase_realtime'),'Realtime privacy guard preserved';
 insert into auth.users(id,aud,role,is_anonymous,created_at,updated_at) values(a,'authenticated','authenticated',true,now(),now()),(b,'authenticated','authenticated',true,now(),now()),(c,'authenticated','authenticated',true,now(),now());
 update quarrel_private.judge_settings set key_hash=sha256(convert_to(k,'UTF8')) where singleton;
 execute 'set local role authenticated';perform set_config('request.headers','{}',true);
 perform set_config('request.jwt.claim.sub',c::text,true);
 s:=public.create_quarrel_room('Legacy host');legacy_r:=(s->>'id')::uuid;legacy_code:=s->>'code';
 assert not(s?'lawyer'),'Legacy creation stays legacy';
 perform public.set_quarrel_theme('detective');
 s:=public.propose_quarrel_debate('Legacy topic','Legacy A','Legacy B',0);
 assert s #>> '{debate,positionB}'='Legacy B','Existing proposal contract remains compatible';
 assert public.create_quarrel_lawyer_room('Legacy host') #>> '{debate,topic}'='Legacy topic','Create retry never silently upgrades old room';
 assert public.get_quarrel_room()->>'themeId'='detective','Existing room retains its selected theme';
 perform set_config('request.jwt.claim.sub',a::text,true);
 s:=public.create_quarrel_lawyer_room('Stage5 A');r:=(s->>'id')::uuid;code:=s->>'code';
 assert s->>'themeId'='courtroom','New rooms default Courtroom';
 assert s #>> '{lawyer,format}'='lawyer' and s #>> '{lawyer,phase}'='setup','Explicit Stage5 initialization';
 assert public.create_quarrel_lawyer_room('Retry')->>'id'=r::text,'Create retry retains same seat';
 denied:=false;begin perform public.set_quarrel_ready(true);exception when sqlstate 'P0001' then assert sqlerrm='DEBATE_NOT_READY';denied:=true;end;assert denied,'Cannot ready without own position';
 s:=public.propose_quarrel_lawyer_topic('Should lectures be mandatory?',120,0);assert s #>> '{lawyer,revision}'='1','Topic increments revision';
 denied:=false;begin perform public.set_quarrel_lawyer_position('Stale',0);exception when sqlstate 'P0001' then assert sqlerrm='STALE_REVISION';denied:=true;end;assert denied,'Stale position edits rejected';
 s:=public.set_quarrel_lawyer_position('Attendance supports participation.',1);
 assert s #>> '{lawyer,positionA}'='Attendance supports participation.' and s #>> '{lawyer,positionB}' is null,'Host writes only A position';
 denied:=false;begin perform public.propose_quarrel_debate('Bypass','Host A','Forged B',0);exception when sqlstate 'P0001' then assert sqlerrm='LAWYER_FLOW_REQUIRED';denied:=true;end;assert denied,'Old proposal cannot write peer position';
 perform set_config('request.jwt.claim.sub',b::text,true);s:=public.join_quarrel_room(code,'Stage5 B');
 assert s #>> '{lawyer,positionA}'='Attendance supports participation.','Guest sees submitted host position';
 denied:=false;begin perform public.propose_quarrel_lawyer_topic('Guest topic',120,2);exception when sqlstate 'P0001' then assert sqlerrm='HOST_ONLY';denied:=true;end;assert denied,'Guest cannot edit topic/duration';
 s:=public.set_quarrel_lawyer_position('Students need independent learning flexibility.',2);rev:=(s #>> '{lawyer,revision}')::int;
 assert s #>> '{lawyer,positionA}'='Attendance supports participation.' and s #>> '{lawyer,positionB}'='Students need independent learning flexibility.','Guest edits only B position';
 assert s #>> '{lawyer,confirmedA}'='true' and s #>> '{lawyer,confirmedB}'='true','Both positions confirmed independently';
 denied:=false;begin perform public.prepare_quarrel_lawyer_plan(rev,false,'demo',k);exception when sqlstate 'P0001' then assert sqlerrm='DEBATE_NOT_READY';denied:=true;end;assert denied,'Planning requires both ready';
 perform public.set_quarrel_ready(true);perform set_config('request.jwt.claim.sub',a::text,true);s:=public.set_quarrel_ready(true);
 assert s->>'bothReady'='true','Both readiness flags retained';
 denied:=false;begin perform public.start_quarrel_lawyer_debate(rev,0);exception when sqlstate 'P0001' then assert sqlerrm='DEBATE_NOT_READY';denied:=true;end;assert denied,'Cannot start without saved plan';
 denied:=false;begin perform public.prepare_quarrel_lawyer_plan(rev,false,'demo','wrong');exception when sqlstate 'P0001' then assert sqlerrm='JUDGE_SERVER_UNAUTHORIZED';denied:=true;end;assert denied,'Planner capability required';
 s:=public.prepare_quarrel_lawyer_plan(rev,false,'demo',k);assert s #>> '{lawyer,phase}'='planning','Both-ready planning begins';
 j:=public.claim_quarrel_lawyer_work(k);assert j->>'kind'='plan','Plan job claimed';
 assert public.claim_quarrel_lawyer_work(k) is null,'Claim is at most once';
 perform public.prepare_quarrel_lawyer_plan(rev,false,'demo',k);
 assert public.claim_quarrel_lawyer_work(k) is null,'Repeated plan request does not duplicate';
 denied:=false;begin perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,jsonb_set(plan,'{subtopics,0,secondsPerPlayer}','59'::jsonb),k);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Plan time total validated';
 for bad in select value from jsonb_array_elements(jsonb_build_array(
  '[]'::jsonb,'null'::jsonb,plan||'{"extra":true}'::jsonb,
  jsonb_set(plan,'{kind}','"jury"'),jsonb_set(plan,'{text}',to_jsonb(repeat('x',901))),
  jsonb_set(plan,'{text}','"Player A wins"'),jsonb_set(plan,'{text}',to_jsonb('bad'||chr(1))),
  jsonb_set(plan,'{subtopics}','{}'),jsonb_set(plan,'{subtopics,0}','"bad"'),
  jsonb_set(plan,'{subtopics,0,extra}','true'),jsonb_set(plan,'{subtopics,0,question}',plan #> '{subtopics,1,question}'),
  jsonb_set(plan,'{subtopics,0,ordinal}','2'),jsonb_set(plan,'{subtopics,0,secondsPerPlayer}','29'),
  jsonb_set(plan,'{subtopics,0,secondsPerPlayer}','60.5'),jsonb_set(plan,'{subtopics,0,question}','"Side B wins"')
 )) loop
  denied:=false;begin perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,bad,k);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Malformed/unsafe planner output rejected without state change';
 end loop;
 s:=public.finish_quarrel_lawyer_work((j->>'id')::uuid,plan,k);
 assert s #>> '{lawyer,planReady}'='true' and jsonb_array_length(s #> '{lawyer,subtopics}')=2,'Plan saved before Start';
 assert s #>> '{lawyer,subtopics,0,openerSlot}'='A' and s #>> '{lawyer,subtopics,1,openerSlot}'='B','Alternating openers saved by server';
 perform set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;begin perform public.prepare_quarrel_lawyer_plan(rev,true,'demo',k);exception when sqlstate 'P0001' then assert sqlerrm='HOST_ONLY';denied:=true;end;assert denied,'Only host regenerates';
 perform set_config('request.jwt.claim.sub',a::text,true);
 s:=public.prepare_quarrel_lawyer_plan(rev,true,'demo',k);assert s #>> '{lawyer,regenerationUsed}'='true','Regeneration records use';
 j:=public.claim_quarrel_lawyer_work(k);s:=public.finish_quarrel_lawyer_work((j->>'id')::uuid,plan,k);
 denied:=false;begin perform public.prepare_quarrel_lawyer_plan(rev,true,'demo',k);exception when sqlstate 'P0001' then assert sqlerrm='PLAN_REGENERATION_USED';denied:=true;end;assert denied,'Second regeneration rejected';
 denied:=false;begin perform public.start_quarrel_lawyer_debate(rev,0);exception when sqlstate 'P0001' then assert sqlerrm='STALE_PLAN';denied:=true;end;assert denied,'Old Start cannot accept regenerated plan';
 s:=public.start_quarrel_lawyer_debate(rev,1);
 assert s #>> '{lawyer,phase}'='subtopic' and s #>> '{lawyer,activeSlot}'='A','Explicit start begins A clock';
 assert s->>'themeLocked'='true','Theme locked atomically';
 assert s #>> '{lawyer,remainingMsB}'='60000','Inactive B clock untouched';
 denied:=false;begin perform public.set_quarrel_theme('jungle');exception when sqlstate 'P0001' then assert sqlerrm='THEME_LOCKED';denied:=true;end;assert denied,'Started theme cannot change';
 denied:=false;begin perform public.set_quarrel_ready(false);exception when sqlstate 'P0001' then assert sqlerrm='DEBATE_STARTED';denied:=true;end;assert denied,'Ready cannot affect running debate';
 denied:=false;begin perform public.set_quarrel_lawyer_position('Changed',rev);exception when sqlstate 'P0001' then assert sqlerrm='DEBATE_STARTED';denied:=true;end;assert denied,'Own positions locked after start';
 denied:=false;begin perform public.start_quarrel_debate(0);exception when sqlstate 'P0001' then assert sqlerrm='LAWYER_FLOW_REQUIRED';denied:=true;end;assert denied,'Old turn engine cannot start';
 denied:=false;begin perform public.begin_quarrel_judge_message('Ask judge',0,0,gen_random_uuid(),k);exception when sqlstate 'P0001' then assert sqlerrm='LAWYER_FLOW_REQUIRED';denied:=true;end;assert denied,'Old direct judge chat blocked';
 perform set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;begin perform public.submit_quarrel_lawyer_argument('Wrong turn',rev,1,gen_random_uuid());exception when sqlstate 'P0001' then assert sqlerrm='NOT_YOUR_TURN';denied:=true;end;assert denied,'Out-of-turn submit rejected';
 perform set_config('request.jwt.claim.sub',a::text,true);
 req:=gen_random_uuid();s:=public.consult_quarrel_lawyer('PRIVATE-ALPHA: help me organize my position.',rev,1,req);
 consult_id:=(s #>> '{lawyer,consultations,0,id}')::uuid;
 assert s #>> '{lawyer,state}'='consulting' and s #>> '{lawyer,turnDeadline}' is null,'Consultation pauses writing clock';
 ms_a:=(s #>> '{lawyer,remainingMsA}')::bigint;ms_b:=(s #>> '{lawyer,remainingMsB}')::bigint;
 assert s #>> '{lawyer,ownConsultationCount}'='1','Own consultation count visible';
 perform set_config('request.jwt.claim.sub',b::text,true);s:=public.get_quarrel_room();
 assert s::text not like '%PRIVATE-ALPHA%' and s::text not like '%'||consult_id::text||'%','Opponent never receives private text or message ID';
 assert s #> '{lawyer,consultations}'='[]'::jsonb and s #>> '{lawyer,ownConsultationCount}'='0','Opponent receives no consultation metadata';
 assert s #>> '{lawyer,needsWork}'='false','Opponent cannot schedule private work';
 assert public.claim_quarrel_lawyer_work(k) is null,'Even server-capable opponent cannot claim consultation';
 perform set_config('request.jwt.claim.sub',a::text,true);j:=public.claim_quarrel_lawyer_work(k);
 assert j->>'kind'='consult' and j->>'playerText' like 'PRIVATE-ALPHA%','Owner worker receives private context';
 s:=public.finish_quarrel_lawyer_work((j->>'id')::uuid,'{"kind":"consult","source":"demo","text":"PRIVATE-BETA: explain why participation matters."}',k);
 assert s #>> '{lawyer,activeSlot}'='A','Consultation resumes same player';
 assert (s #>> '{lawyer,remainingMsA}')::bigint=ms_a and (s #>> '{lawyer,remainingMsB}')::bigint=ms_b,'AI time consumes neither clock';
 assert (select count(*) from jsonb_array_elements(s #> '{lawyer,history}') m where m->>'kind'='argument')=0,'Private consultation is not an official argument';
 req:=gen_random_uuid();s:=public.submit_quarrel_lawyer_argument('My attendance helps me ask questions during class.',rev,1,req);msg_id:=(s #>> '{lawyer,history,1,id}')::uuid;
 assert s #>> '{lawyer,state}'='lawyering' and s #>> '{lawyer,turnDeadline}' is null,'Official submit pauses both clocks';
 assert s #>> '{lawyer,history,1,label}'='S1-P1L1M1','Stable official label';
 prior:=s #> '{lawyer,history}';perform public.submit_quarrel_lawyer_argument('My attendance helps me ask questions during class.',rev,1,req);
 assert public.get_quarrel_room() #> '{lawyer,history}'=prior,'Duplicate request creates no duplicate record';
 denied:=false;begin perform public.submit_quarrel_lawyer_argument('Different payload',rev,1,req);exception when sqlstate 'P0001' then assert sqlerrm='LAWYER_REQUEST_CONFLICT';denied:=true;end;assert denied,'Nonce cannot change content';
 perform set_config('request.jwt.claim.sub',b::text,true);s:=public.get_quarrel_room();
 assert not((s #> '{lawyer,history,1}')?'rawText'),'Opponent rawText key absent, including pending state';
 j:=public.claim_quarrel_lawyer_work(k);assert j->>'kind'='lawyer','Either member server can process public presentation';
 assert j::text not like '%PRIVATE-ALPHA%' and j::text not like '%PRIVATE-BETA%' and not((j->'context')?'consultations'),'Official lawyer context excludes consultations';
 for bad in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('kind','lawyer','source','ai','text',repeat('x',76)),
  '{"kind":"lawyer","source":"ai","text":"Player A wins"}'::jsonb,
  '{"kind":"lawyer","source":"ai","text":"A point","verdict":{"outcome":"A"}}'::jsonb,
  '{"kind":"lawyer","source":"ai","text":"A point","extra":true}'::jsonb
 )) loop
  denied:=false;begin perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,bad,k);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Lawyer length/role/output fields enforced';
 end loop;
 s:=public.finish_quarrel_lawyer_work((j->>'id')::uuid,'{"kind":"lawyer","source":"demo","text":"Attendance helps me ask questions in class."}',k);
 assert s #>> '{lawyer,activeSlot}'='B','Opponent clock starts only after committed presentation';
 assert s #>> '{lawyer,remainingMsB}'='60000','B still has full allocation';
 assert s #>> '{lawyer,history,1,text}'='Attendance helps me ask questions in class.','Public lawyer output saved';
 req:=gen_random_uuid();s:=public.submit_quarrel_lawyer_argument('Independent study fits my learning needs.',rev,1,req);j:=public.claim_quarrel_lawyer_work(k);
 -- Simulate only this fixture's lost worker; Cloud records and real clocks remain unchanged.
 execute 'reset role';update quarrel_private.lawyer_messages set deadline_at=clock_timestamp()-interval '1 second' where id=(j->>'id')::uuid;
 execute 'set local role authenticated';s:=public.get_quarrel_room();
 assert s #>> '{lawyer,history,2,source}'='fallback' and s #>> '{lawyer,history,2,text}'='Independent study fits my learning needs.','Lost worker publishes unchanged text as fallback';
 assert s #>> '{lawyer,activeSlot}'='A','Lease recovery resumes next writer';
 s:=public.finish_quarrel_lawyer_work((j->>'id')::uuid,'{"kind":"lawyer","source":"demo","text":"Late response"}',k);
 assert s #>> '{lawyer,history,2,source}'='fallback','Late completion cannot overwrite fallback';
 perform set_config('request.jwt.claim.sub',a::text,true);s:=public.get_quarrel_room();
 assert s #>> '{lawyer,history,1,rawText}'='My attendance helps me ask questions during class.','Author draft survives refresh';
 assert not((s #> '{lawyer,history,2}')?'rawText'),'Opponent draft remains absent after reveal';
 -- Artificially expire only the synthetic A clock; original deadline drives B.
 execute 'reset role';update quarrel_private.lawyer_debates set turn_deadline=clock_timestamp()-interval '2 seconds' where room_id=r;
 execute 'set local role authenticated';s:=public.get_quarrel_room();
 assert s #>> '{lawyer,activeSlot}'='B' and s #>> '{lawyer,remainingMsA}'='0','One exhausted clock transfers remaining time to peer';
 assert (s #>> '{lawyer,turnDeadline}')::timestamptz<clock_timestamp()+((s #>> '{lawyer,remainingMsB}')::bigint*interval '1 millisecond')-interval '1 second','Delayed read does not extend opposing clock';
 denied:=false;begin perform public.submit_quarrel_lawyer_argument('No time',rev,1,gen_random_uuid());exception when sqlstate 'P0001' then assert sqlerrm='NOT_YOUR_TURN';denied:=true;end;assert denied,'Exhausted player cannot send';
 execute 'reset role';update quarrel_private.lawyer_debates set turn_deadline=clock_timestamp()-interval '1 second' where room_id=r;
 execute 'set local role authenticated';s:=public.get_quarrel_room();
 assert s #>> '{lawyer,phase}'='summary' and s #>> '{lawyer,remainingMsA}'='0' and s #>> '{lawyer,remainingMsB}'='0','Subtopic finishes only after both clocks reach zero';
 j:=public.claim_quarrel_lawyer_work(k);summary_id:=(j->>'id')::uuid;
 assert j->>'kind'='summary' and j::text not like '%PRIVATE-ALPHA%' and j::text not like '%PRIVATE-BETA%','Summary excludes private consultation';
 assert j::text like '%My attendance helps me ask questions during class.%','Judge can compare approved official draft and presentation';
 s:=public.finish_quarrel_lawyer_work(summary_id,'{"kind":"summary","source":"demo","text":"A values participation; B values flexibility. Neither has supplied independent evidence."}',k);
 assert s #>> '{lawyer,phase}'='summary','Summary stays visible during server interval';
 execute 'reset role';update quarrel_private.lawyer_debates set summary_until=clock_timestamp()-interval '1 second' where room_id=r;
 execute 'set local role authenticated';s:=public.get_quarrel_room();
 assert s #>> '{lawyer,currentSubtopic}'='2' and s #>> '{lawyer,activeSlot}'='B','Second subtopic starts with B';
 -- Test consultation quota independently of official message quota.
 perform set_config('request.jwt.claim.sub',b::text,true);
 for seq in 1..2 loop
  perform public.consult_quarrel_lawyer('Help structure my point.',rev,2,gen_random_uuid());j:=public.claim_quarrel_lawyer_work(k);
  perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,'{"kind":"consult","source":"demo","text":"State your reason clearly."}',k);
 end loop;
 denied:=false;begin perform public.consult_quarrel_lawyer('Third consultation',rev,2,gen_random_uuid());exception when sqlstate 'P0001' then assert sqlerrm='LAWYER_LIMIT_REACHED';denied:=true;end;assert denied,'Private consultation quota enforced';
 -- Leave A no time so B may use the official cap without changing writers.
 execute 'reset role';update quarrel_private.lawyer_subtopics set remaining_ms_a=0 where room_id=r and revision=rev and generation=1 and ordinal=2;
 execute 'set local role authenticated';
 for seq in 1..12 loop
  perform public.submit_quarrel_lawyer_argument('Flexible study can support my schedule.',rev,2,gen_random_uuid());j:=public.claim_quarrel_lawyer_work(k);
  perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,'{"kind":"lawyer","source":"demo","text":"Flexible study supports my schedule."}',k);
 end loop;
 s:=public.get_quarrel_room();deadline:=(s #>> '{lawyer,turnDeadline}')::timestamptz;
 denied:=false;begin perform public.submit_quarrel_lawyer_argument('Thirteenth argument',rev,2,gen_random_uuid());exception when sqlstate 'P0001' then assert sqlerrm='LAWYER_LIMIT_REACHED';denied:=true;end;assert denied,'Official message cap enforced';
 s:=public.get_quarrel_room();assert s #>> '{lawyer,phase}'='subtopic' and (s #>> '{lawyer,turnDeadline}')::timestamptz=deadline,'Cap does not end or extend remaining clock';
 execute 'reset role';update quarrel_private.lawyer_debates set turn_deadline=clock_timestamp()-interval '1 second' where room_id=r;
 execute 'set local role authenticated';perform public.get_quarrel_room();j:=public.claim_quarrel_lawyer_work(k);
 perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,'{"kind":"summary","source":"demo","text":"B emphasized schedule flexibility. A added no statements on this subtopic."}',k);
 execute 'reset role';update quarrel_private.lawyer_debates set summary_until=clock_timestamp()-interval '1 second' where room_id=r;
 execute 'set local role authenticated';s:=public.get_quarrel_room();assert s #>> '{lawyer,phase}'='jury','Last summary leads to jury';
 j:=public.claim_quarrel_lawyer_work(k);
 assert j->>'kind'='jury' and jsonb_array_length(j #> '{context,messages}')>=16,'Jury receives entire public transcript and summaries';
 assert j::text not like '%PRIVATE-ALPHA%' and j::text not like '%PRIVATE-BETA%' and not((j->'context')?'consultations'),'Jury never receives private consultations';
 result:='{"kind":"jury","source":"demo","text":"The record is inconclusive.","verdict":{"outcome":"split","reasoning":"Both sides identify relevant values without independent evidence.","perSubtopic":[{"ordinal":1,"text":"Participation and flexibility remain in tension."},{"ordinal":2,"text":"Schedule flexibility was discussed."}]}}';
 denied:=false;begin perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,jsonb_set(result,'{verdict,outcome}','"C"'),k);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Jury outcome validated';
 for bad in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_set(result,'{text}',to_jsonb(repeat('x',2401))),
  jsonb_set(result,'{verdict}','[]'),jsonb_set(result,'{verdict,reasoning}','"Player B wins"'),
  jsonb_set(result,'{verdict,extra}','true'),jsonb_set(result,'{verdict,perSubtopic}','{}'),
  jsonb_set(result,'{verdict,perSubtopic,0}','null'),jsonb_set(result,'{verdict,perSubtopic,0,extra}','true'),
  jsonb_set(result,'{verdict,perSubtopic,1,ordinal}','1')
 )) loop
  denied:=false;begin perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,bad,k);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Malformed jury structures and outcome narrative rejected';
 end loop;
 -- Long valid jury narrative is permitted up to the engine's 2400-character bound.
 result:=jsonb_set(result,'{text}',to_jsonb(repeat('x',2400)));
 s:=public.finish_quarrel_lawyer_work((j->>'id')::uuid,result,k);
 assert s #>> '{lawyer,phase}'='complete' and s #>> '{lawyer,verdict,outcome}'='split','Jury completes exactly once';
 prior:=s #> '{lawyer,verdict}';perform set_config('request.jwt.claim.sub',a::text,true);s:=public.get_quarrel_room();
 assert s #> '{lawyer,verdict}'=prior,'Both members recover identical verdict';
 assert (select count(*) from jsonb_array_elements(s #> '{lawyer,history}') m where m->>'label'='JURY')=1,'One jury record';
 assert (select count(*) from jsonb_array_elements(s #> '{lawyer,history}') m where m->>'kind'='judge_summary')=2,'One summary per subtopic';
 perform set_config('request.jwt.claim.sub',c::text,true);s:=public.get_quarrel_room();
 assert s->>'id'=legacy_r::text and not(s?'lawyer') and s->>'themeId'='detective','Legacy room and chosen theme unchanged';
 perform set_config('request.headers',jsonb_build_object('x-quarrel-room-id',r)::text,true);
 denied:=false;begin perform public.claim_quarrel_lawyer_work(k);exception when sqlstate 'P0001' then assert sqlerrm='STALE_ROOM';denied:=true;end;assert denied,'Room header never grants outsider access';
 execute 'reset role';
end;$$;
rollback;
