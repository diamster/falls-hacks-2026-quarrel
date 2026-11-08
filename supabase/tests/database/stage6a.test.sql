-- Transactional synthetic fixtures only. No real clocks/data are modified.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local plpgsql.check_asserts=on;
select no_plan();
select ok(not has_table_privilege('authenticated','quarrel_private.lawyer_sessions','SELECT'),'Archives deny direct reads');
select ok(not has_function_privilege('authenticated','quarrel_private.lawyer_result_json(quarrel_private.lawyer_sessions,boolean)','EXECUTE'),'Private archive serializer is not exposed');
select ok(not has_function_privilege('anon','public.request_quarrel_lawyer_rematch(uuid)','EXECUTE'),'Rematch requires authenticated identity');
select lives_ok($stage6a$
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();k text:=gen_random_uuid()::text||gen_random_uuid()::text;
 fixture_room uuid;debate_id uuid;new_id uuid;code text;s jsonb;j jsonb;old_j jsonb;verdict jsonb;result jsonb;before jsonb;history jsonb;
 revision integer;denied boolean;outcome text;stamp timestamptz;attempt integer;
 plan jsonb:='{"kind":"plan","source":"demo","text":"Review the two positions.","subtopics":[{"ordinal":1,"question":"How does attendance support learning?","secondsPerPlayer":60},{"ordinal":2,"question":"What flexibility supports learning?","secondsPerPlayer":60}]}';
begin
 insert into auth.users(id,aud,role,is_anonymous,created_at,updated_at) values(a,'authenticated','authenticated',true,now(),now()),(b,'authenticated','authenticated',true,now(),now()),(outsider,'authenticated','authenticated',true,now(),now());
 update quarrel_private.judge_settings set key_hash=sha256(convert_to(k,'UTF8')) where singleton;
 execute 'set local role authenticated';perform set_config('request.headers','{}',true);perform set_config('request.jwt.claim.sub',a::text,true);
 s:=public.create_quarrel_lawyer_room_v2('Reliability A');fixture_room:=(s->>'id')::uuid;code:=s->>'code';debate_id:=(s #>> '{lawyer,debateId}')::uuid;
 assert s #>> '{lawyer,reliabilityVersion}'='2','Stage6 room explicitly uses strict backend';
 s:=public.propose_quarrel_lawyer_topic('Should lectures be mandatory?',120,0);
 s:=public.set_quarrel_lawyer_position('Attendance supports participation.',1);
 perform set_config('request.jwt.claim.sub',b::text,true);perform public.join_quarrel_room(code,'Reliability B');
 s:=public.set_quarrel_lawyer_position('Students need flexibility.',2);revision:=(s #>> '{lawyer,revision}')::integer;
 perform public.set_quarrel_ready(true);perform set_config('request.jwt.claim.sub',a::text,true);perform public.set_quarrel_ready(true);
 perform public.prepare_quarrel_lawyer_plan(revision,false,'ai',k);assert public.claim_quarrel_lawyer_work(k) is null,'Legacy server cannot steal version2 work';j:=public.claim_quarrel_lawyer_work_v2(k);
 assert public.claim_quarrel_lawyer_work_v2(k) is null,'Parallel worker cannot duplicate a claim';
 assert j->>'claimToken' is not null,'Server-generated attempt token returned';
 denied:=false;begin perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,plan,k,gen_random_uuid());exception when sqlstate 'P0001' then assert sqlerrm='STALE_LAWYER_CLAIM';denied:=true;end;assert denied,'Forged lease token rejected';
 perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,plan,k,(j->>'claimToken')::uuid);
 perform public.start_quarrel_lawyer_debate(revision,0);
 perform public.consult_quarrel_lawyer('PRIVATE-CONSULTATION-NEVER-JURY',revision,1,gen_random_uuid());j:=public.claim_quarrel_lawyer_work_v2(k);
 perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,'{"kind":"consult","source":"demo","text":"PRIVATE-RESPONSE-NEVER-JURY"}',k,(j->>'claimToken')::uuid);
 s:=public.submit_quarrel_lawyer_argument('UNPUBLISHED-DRAFT: attending class helps me ask questions.',revision,1,gen_random_uuid());j:=public.claim_quarrel_lawyer_work_v2(k);
 assert s #>> '{lawyer,turnDeadline}' is null,'Lawyer work pauses writing clocks';
 before:=jsonb_build_array(s #> '{lawyer,remainingMsA}',s #> '{lawyer,remainingMsB}');
 s:=public.get_quarrel_room();assert jsonb_build_array(s #> '{lawyer,remainingMsA}',s #> '{lawyer,remainingMsB}')=before,'Refresh does not reset paused clocks';
 perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,'{"kind":"lawyer","source":"ai","text":"Attending class lets me ask questions."}',k,(j->>'claimToken')::uuid);
 s:=public.get_quarrel_room();assert s #>> '{lawyer,activeSlot}'='B','Saved lawyer presentation starts opposing clock';
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.submit_quarrel_lawyer_argument('Independent study lets me choose when I learn.',revision,1,gen_random_uuid());j:=public.claim_quarrel_lawyer_work_v2(k);
 perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,'{"kind":"lawyer","source":"ai","text":"Independent study lets me choose my learning schedule."}',k,(j->>'claimToken')::uuid);
 -- Expire this fixture's composing chain, retaining original deadline semantics.
 execute 'reset role';update quarrel_private.lawyer_debates set turn_deadline=clock_timestamp()-interval '5 minutes' where lawyer_debates.room_id=fixture_room;
 execute 'set local role authenticated';s:=public.get_quarrel_room();j:=public.claim_quarrel_lawyer_work_v2(k);
 assert s #>> '{lawyer,phase}'='summary' and s #>> '{lawyer,remainingMsA}'='0' and s #>> '{lawyer,remainingMsB}'='0','Both clocks must expire before summary';
 assert s #>> '{lawyer,turnDeadline}' is null,'Judge processing consumes no player time';
 assert j::text not like '%PRIVATE-%' and j::text not like '%UNPUBLISHED-DRAFT%' and j::text not like '%rawText%','Judge receives public presentations only';
 old_j:=j;perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,'{"kind":"summary","source":"ai","text":"A values classroom questions; B values scheduling flexibility. Neither claim was independently verified."}',k,(j->>'claimToken')::uuid);
 before:=public.get_quarrel_room();perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,'{"kind":"summary","source":"ai","text":"Duplicate should not replace the summary."}',k,(j->>'claimToken')::uuid);
 assert public.get_quarrel_room() #> '{lawyer,history}'=before #> '{lawyer,history}','Duplicate summary cannot overwrite canonical history';
 execute 'reset role';update quarrel_private.lawyer_debates set summary_until=clock_timestamp()-interval '1 second' where lawyer_debates.room_id=fixture_room;
 execute 'set local role authenticated';s:=public.get_quarrel_room();assert s #>> '{lawyer,currentSubtopic}'='2','Saved summary advances to next subtopic';
 execute 'reset role';update quarrel_private.lawyer_debates set turn_deadline=clock_timestamp()-interval '5 minutes' where lawyer_debates.room_id=fixture_room;
 execute 'set local role authenticated';perform public.get_quarrel_room();j:=public.claim_quarrel_lawyer_work_v2(k);
 -- Summary failure produces a truthful transcript fallback and can advance.
 perform public.fail_quarrel_lawyer_work((j->>'id')::uuid,(j->>'claimToken')::uuid,k,'timeout');
 execute 'reset role';update quarrel_private.lawyer_debates set summary_until=clock_timestamp()-interval '1 second' where lawyer_debates.room_id=fixture_room;
 execute 'set local role authenticated';s:=public.get_quarrel_room();j:=public.claim_quarrel_lawyer_work_v2(k);
 assert j->>'kind'='jury' and j::text not like '%PRIVATE-%' and j::text not like '%UNPUBLISHED-DRAFT%' and j::text not like '%rawText%','Jury public-only context excludes private drafts and consultations';
 assert s #>> '{lawyer,turnDeadline}' is null,'Jury processing consumes no clock';
 old_j:=j;s:=public.fail_quarrel_lawyer_work((j->>'id')::uuid,(j->>'claimToken')::uuid,k,'provider_unavailable');
 assert s #>> '{lawyer,phase}'='jury' and s #> '{lawyer,verdict}'='null'::jsonb,'Failure never generates fake verdict';
 assert s #>> '{lawyer,juryStatus,state}'='retry_wait','Temporary failure schedules bounded backoff';
 assert public.claim_quarrel_lawyer_work_v2(k) is null,'Backoff prevents immediate duplicate provider call';
 for attempt in 2..3 loop
  execute 'reset role';update quarrel_private.lawyer_messages set retry_at=clock_timestamp()-interval '1 second' where id=(old_j->>'id')::uuid;
  execute 'set local role authenticated';j:=public.claim_quarrel_lawyer_work_v2(k);
  assert j->>'id'=old_j->>'id' and j->>'claimToken'<>old_j->>'claimToken','Retries retain canonical job and renew attempt token';
  s:=public.fail_quarrel_lawyer_work((j->>'id')::uuid,(j->>'claimToken')::uuid,k,'provider_unavailable');
 end loop;
 assert s #>> '{lawyer,juryStatus,state}'='retry_required' and s #>> '{lawyer,needsWork}'='false','Three failures stop automatic requests';
 perform public.retry_quarrel_lawyer_jury(debate_id);j:=public.claim_quarrel_lawyer_work_v2(k);
 s:=public.fail_quarrel_lawyer_work((j->>'id')::uuid,(j->>'claimToken')::uuid,k,'quota_exhausted');
 assert s #>> '{lawyer,juryStatus,state}'='retry_required' and s #>> '{lawyer,needsWork}'='false','Daily quota failure avoids blind automatic retries';
 denied:=false;begin perform public.retry_quarrel_lawyer_jury(debate_id);exception when sqlstate 'P0001' then assert sqlerrm='JURY_RETRY_RATE_LIMITED';denied:=true;end;assert denied,'Manual retries have a server cooldown';
 execute 'reset role';update quarrel_private.lawyer_messages set last_retry_at=clock_timestamp()-interval '61 seconds' where id=(j->>'id')::uuid;
 execute 'set local role authenticated';perform public.retry_quarrel_lawyer_jury(debate_id);j:=public.claim_quarrel_lawyer_work_v2(k);
 denied:=false;begin perform public.finish_quarrel_lawyer_work_v2((old_j->>'id')::uuid,'{}',k,(old_j->>'claimToken')::uuid);exception when sqlstate 'P0001' then assert sqlerrm='STALE_LAWYER_CLAIM';denied:=true;end;assert denied,'Late first attempt cannot finish a later lease';
 denied:=false;begin perform public.finish_quarrel_lawyer_work((j->>'id')::uuid,'{}',k);exception when sqlstate 'P0001' then assert sqlerrm='STALE_LAWYER_CLAIM';denied:=true;end;assert denied,'Old tokenless API cannot bypass strict completion';
 verdict:=jsonb_build_object('outcome','split','decision','tie','topic','Should lectures be mandatory?','positionA','Attendance supports participation.','positionB','Students need flexibility.',
 'reasoning','The public arguments support different learning preferences without comparative evidence.',
 'strongestArguments',jsonb_build_object('A','Attending class permits questions.','B','Independent study permits scheduling flexibility.'),
 'weaknesses',jsonb_build_object('A',jsonb_build_array('No comparative learning evidence was supplied.'),'B',jsonb_build_array('No comparative learning evidence was supplied.')),
 'perSubtopic',jsonb_build_array(jsonb_build_object('ordinal',1,'text','Question opportunities and scheduling flexibility were discussed.'),jsonb_build_object('ordinal',2,'text','Neither side added a presentation.')),'compromise',null);
 result:=jsonb_build_object('kind','jury','source','ai','text','The public record supports competing preferences.','verdict',verdict);
 denied:=false;begin perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,jsonb_set(result,'{verdict}',verdict-'compromise'),k,(j->>'claimToken')::uuid);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Missing nullable structured field is rejected';
 denied:=false;begin perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,jsonb_set(result,'{source}','"fallback"'),k,(j->>'claimToken')::uuid);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Fallback source cannot fabricate a verdict';
 denied:=false;begin perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,jsonb_set(result,'{verdict,topic}','"Forged topic"'),k,(j->>'claimToken')::uuid);exception when sqlstate 'P0001' then assert sqlerrm='INVALID_LAWYER_RESPONSE';denied:=true;end;assert denied,'Model cannot replace authoritative debate topic';
 foreach outcome in array array['A','B','tie','inconclusive'] loop
  begin
   s:=public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,jsonb_set(jsonb_set(result,'{verdict,decision}',to_jsonb(outcome)),'{verdict,outcome}',to_jsonb(case when outcome in('A','B') then outcome else 'split' end)),k,(j->>'claimToken')::uuid);
   assert s #>> '{lawyer,verdict,decision}'=outcome,'All four result decisions are supported';
   raise exception using errcode='P9999',message='ROLLBACK_SYNTHETIC_OUTCOME';
  exception when sqlstate 'P9999' then null;end;
 end loop;
 s:=public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,result,k,(j->>'claimToken')::uuid);
 assert s #>> '{lawyer,phase}'='complete' and jsonb_array_length(s #> '{lawyer,verdict,subtopicSummaries}')=2,'Canonical verdict includes exact saved summaries';
 before:=s #> '{lawyer,verdict}';perform public.finish_quarrel_lawyer_work_v2((j->>'id')::uuid,jsonb_set(result,'{verdict,decision}','"A"'),k,(j->>'claimToken')::uuid);
 assert public.get_quarrel_room() #> '{lawyer,verdict}'=before,'Duplicate finish cannot change verdict';
 history:=public.get_quarrel_lawyer_results(debate_id);
 assert history::text not like '%PRIVATE-%' and history::text not like '%UNPUBLISHED-DRAFT%' and history::text not like '%rawText%' and history::text not like '%requested_by%','Historical public record excludes all private data';
 assert (select count(*) from jsonb_array_elements(history->'history') m where m->>'kind'='jury_verdict')=1,'Exactly one jury message';
 assert (select count(*) from jsonb_array_elements(history->'history') m where m->>'kind'='judge_summary')=2,'Exactly one summary per subtopic';
 s:=public.acknowledge_quarrel_lawyer_results(debate_id);stamp:=(s #>> '{acknowledgements,B}')::timestamptz;
 assert stamp is not null and s #> '{acknowledgements,A}'='null'::jsonb,'Acknowledgement is independent and not agreement';
 assert (public.acknowledge_quarrel_lawyer_results(debate_id) #>> '{acknowledgements,B}')::timestamptz=stamp,'Repeated acknowledgement preserves timestamp';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 assert public.list_quarrel_lawyer_results(fixture_room)='[]'::jsonb,'Outsider cannot enumerate results';
 denied:=false;begin perform public.get_quarrel_lawyer_results(debate_id);exception when sqlstate 'P0001' then assert sqlerrm='RESULTS_NOT_FOUND';denied:=true;end;assert denied,'Outsider cannot read another debate';
 denied:=false;begin perform public.acknowledge_quarrel_lawyer_results(debate_id);exception when sqlstate 'P0001' then assert sqlerrm='RESULTS_NOT_FOUND';denied:=true;end;assert denied,'Outsider cannot acknowledge results';
 perform set_config('request.jwt.claim.sub',a::text,true);s:=public.request_quarrel_lawyer_rematch(debate_id);
 assert s #>> '{lawyer,phase}'='complete' and s #>> '{lawyer,debateId}'=debate_id::text,'One player cannot force a rematch';
 perform public.request_quarrel_lawyer_rematch(debate_id);
 perform set_config('request.jwt.claim.sub',b::text,true);s:=public.request_quarrel_lawyer_rematch(debate_id);new_id:=(s #>> '{lawyer,debateId}')::uuid;
 assert new_id<>debate_id and s #>> '{lawyer,phase}'='setup','Both approvals create a separate debate session';
 assert s->>'themeId'='courtroom' and s->>'id'=fixture_room::text,'Rematch preserves room and theme';
 assert s #> '{lawyer,history}'='[]'::jsonb and s #> '{lawyer,consultations}'='[]'::jsonb and s #> '{lawyer,subtopics}'='[]'::jsonb and s #> '{lawyer,verdict}'='null'::jsonb,'New session contains no old argument, consultation, clock or jury state';
 assert s #> '{lawyer,positionA}'='null'::jsonb and s #> '{lawyer,positionB}'='null'::jsonb and s->>'bothReady'='false','New positions and readiness required';
 assert public.request_quarrel_lawyer_rematch(debate_id) #>> '{lawyer,debateId}'=new_id::text,'Simultaneous/repeated approvals create only one rematch';
 assert public.get_quarrel_lawyer_results(debate_id)->'verdict'=before,'Earlier verdict remains available after rematch';
 denied:=false;begin perform public.set_quarrel_lawyer_position('Stale old browser',revision);exception when sqlstate 'P0001' then assert sqlerrm='STALE_REVISION';denied:=true;end;assert denied,'Old session revisions cannot edit rematch';
 perform public.leave_quarrel_room(fixture_room);
 assert public.get_quarrel_lawyer_results(debate_id)->'verdict'=before,'Original participant retains results access after leaving';
 execute 'reset role';
 assert (select count(*) from quarrel_private.lawyer_sessions where lawyer_sessions.room_id=fixture_room)=2,'One original session and one rematch retained';
end;$$;
$stage6a$,'Stage6A canonical results, public-only evidence, retries, fencing, acknowledgements, rematches and archives');
select * from finish();
rollback;
