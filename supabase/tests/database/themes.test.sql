-- Real database theme authorization and persistence; fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, aud, role, is_anonymous, created_at, updated_at) values
  ('a4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', true, now(), now()),
  ('b5555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', true, now(), now()),
  ('c6666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', true, now(), now());
create temporary table theme_test_room(snapshot jsonb);
grant select, insert, update on theme_test_room to authenticated;

select ok(not has_function_privilege('anon', 'public.set_quarrel_theme(text)', 'EXECUTE'), 'Public callers cannot change a theme');
select ok(not has_table_privilege('authenticated', 'public.quarrel_rooms', 'UPDATE'), 'Members cannot bypass RPC validation or write the future theme lock');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quarrel_rooms'), 'Room changes are in the Realtime publication');
select ok((select pubinsert and pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname = 'supabase_realtime'), 'Theme publication retains delete/truncate privacy protection');

set local role authenticated;
set local request.jwt.claim.sub = '';
select throws_ok($$select public.set_quarrel_theme('superhero')$$, 'P0001', 'UNAUTHORIZED', 'Theme mutation requires a verified identity');
set local request.jwt.claim.sub = 'a4444444-4444-4444-8444-444444444444';
insert into theme_test_room values(public.create_quarrel_room('Theme host'));
select is((select snapshot->>'themeId' from theme_test_room), 'courtroom', 'New room defaults to Courtroom');
select is((select snapshot->>'themeLocked' from theme_test_room), 'false', 'New room theme starts unlocked');
select is((select snapshot->>'mode' from theme_test_room), 'solo', 'Only solo mode is playable');
select is((select snapshot->>'capacity' from theme_test_room), '2', 'Current capacity remains exactly two');
select is(public.set_quarrel_theme('superhero')->>'themeId', 'superhero', 'Host can select Superhero before the other player joins');
select is(public.set_quarrel_ready(true) #>> '{players,0,ready}', 'true', 'Readiness still works after changing theme');

set local request.jwt.claim.sub = 'b5555555-5555-4555-8555-555555555555';
select is((select count(*)::int from public.quarrel_rooms), 0, 'Unjoined player cannot read room theme');
update theme_test_room set snapshot = public.join_quarrel_room(snapshot->>'code', 'Theme guest');
select is((select snapshot->>'themeId' from theme_test_room), 'superhero', 'Joining player receives the selected theme');
select is((select snapshot->>'you' from theme_test_room), 'B', 'Joining player remains slot B');
select throws_ok($$select public.set_quarrel_theme('detective')$$, 'P0001', 'HOST_ONLY', 'Player B cannot change the theme');
select throws_ok($$update public.quarrel_rooms set theme_id = 'detective'$$, '42501', 'permission denied for table quarrel_rooms', 'Player B cannot write theme directly');
select is(public.set_quarrel_ready(true)->>'bothReady', 'true', 'Both-ready still works');

set local request.jwt.claim.sub = 'a4444444-4444-4444-8444-444444444444';
select is(public.set_quarrel_theme('detective')->>'themeId', 'detective', 'Host can select Detective');
select is(public.set_quarrel_theme('courtroom')->>'themeId', 'courtroom', 'Host can select Courtroom');
select is(public.set_quarrel_theme('jungle')->>'themeId', 'jungle', 'Host can select Jungle');
select is(public.get_quarrel_room()->>'bothReady', 'true', 'Theme changes preserve readiness and a ready lobby is not locked');
select is((select count(*)::int from public.quarrel_players), 2, 'Theme changes preserve the two current player rows');
select is(public.get_quarrel_room() #>> '{players,0,name}', 'Theme host', 'Host name is preserved');
select is(public.get_quarrel_room() #>> '{players,1,name}', 'Theme guest', 'Guest name is preserved');
select throws_ok($$select public.set_quarrel_theme('untrusted')$$, 'P0001', 'INVALID_THEME', 'Unknown theme ID rejected by the database');
select throws_ok($$select public.set_quarrel_theme(null)$$, 'P0001', 'INVALID_THEME', 'Null theme ID rejected');
select throws_ok($$select public.set_quarrel_theme('Jungle')$$, 'P0001', 'INVALID_THEME', 'Only canonical theme IDs accepted');
select is(public.get_quarrel_room()->>'themeId', 'jungle', 'Invalid requests leave a valid theme intact');

set local request.jwt.claim.sub = 'c6666666-6666-4666-8666-666666666666';
select throws_ok($$select public.set_quarrel_theme('courtroom')$$, 'P0001', 'ROOM_NOT_FOUND', 'Non-member cannot change any room theme');
select is((select count(*)::int from public.quarrel_rooms), 0, 'Outsider cannot read the selected theme through its table');
select throws_ok($$select public.join_quarrel_room((select snapshot->>'code' from theme_test_room), 'Third player')$$, 'P0001', 'ROOM_FULL', 'Theme support does not permit a third player');

-- Only the test administrator sets the future lock. Stage 2.5 intentionally has
-- no start, lock, unlock, verdict or representative-selection endpoint.
reset role;
update public.quarrel_rooms set theme_locked = true where id = (select (snapshot->>'id')::uuid from theme_test_room);
set local role authenticated;
set local request.jwt.claim.sub = 'a4444444-4444-4444-8444-444444444444';
select is(public.get_quarrel_room()->>'themeLocked', 'true', 'Future lock is included in the member snapshot');
select throws_ok($$select public.set_quarrel_theme('superhero')$$, 'P0001', 'THEME_LOCKED', 'Host cannot change a locked theme');
select throws_ok($$update public.quarrel_rooms set theme_locked = false$$, '42501', 'permission denied for table quarrel_rooms', 'Host cannot directly clear the lock');
select is(public.get_quarrel_room()->>'themeId', 'jungle', 'Rejected locked mutation preserves the selected theme');

reset role;
update public.quarrel_rooms set expires_at = now() - interval '1 second' where id = (select (snapshot->>'id')::uuid from theme_test_room);
set local role authenticated;
select throws_ok($$select public.set_quarrel_theme('superhero')$$, 'P0001', 'ROOM_EXPIRED', 'Expired-room theme mutation is rejected');
reset role;
select * from finish();
rollback;
