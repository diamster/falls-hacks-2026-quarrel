-- Run against the local stack with: npx supabase test db
-- Everything, including test identities and room rows, rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, aud, role, is_anonymous, created_at, updated_at) values
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', true, now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', true, now(), now()),
  ('c3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', true, now(), now());
create temporary table test_room(snapshot jsonb);
grant select, insert, update on test_room to authenticated;

select ok((select relrowsecurity from pg_class where oid = 'public.quarrel_rooms'::regclass), 'Room RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quarrel_players'::regclass), 'Player RLS is enabled');
select ok((select pubinsert and pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname = 'supabase_realtime'), 'Realtime publishes only RLS-checkable insert/update events');
select ok(not has_table_privilege('anon', 'public.quarrel_rooms', 'SELECT'), 'Unauthenticated clients cannot list rooms');
select ok(not has_function_privilege('anon', 'public.join_quarrel_room(text,text)', 'EXECUTE'), 'Unauthenticated clients cannot call join');
select ok(not has_table_privilege('authenticated', 'public.quarrel_players', 'UPDATE'), 'No direct player updates');
select ok(not has_table_privilege('authenticated', 'public.quarrel_rooms', 'INSERT'), 'No direct room inserts');

set local role authenticated;
set local request.jwt.claim.sub = '';
select throws_ok($$select public.get_quarrel_room()$$, 'P0001', 'UNAUTHORIZED', 'Missing session identity is rejected');
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select is(public.get_quarrel_room(), null::jsonb, 'New session has no room');
select throws_ok($$select public.create_quarrel_room(' ')$$, 'P0001', 'INVALID_NAME', 'Whitespace name rejected');
select throws_ok($$select public.create_quarrel_room(repeat('a', 33))$$, 'P0001', 'INVALID_NAME', 'Long name rejected');
select throws_ok($$select public.create_quarrel_room(E'Line\nBreak')$$, 'P0001', 'INVALID_NAME', 'Control characters rejected');
insert into test_room values(public.create_quarrel_room('  Alex  '));
select matches((select snapshot->>'code' from test_room), '^[A-HJ-NP-Z2-9]{6}$', 'Code is six unambiguous characters');
select is((select snapshot->>'you' from test_room), 'A', 'Creator is player A');
select is((select snapshot #>> '{players,0,name}' from test_room), 'Alex', 'Display name is trimmed');
select is((select jsonb_array_length(snapshot->'players') from test_room), 1, 'Room begins with one slot');
select is((select snapshot->>'bothReady' from test_room), 'false', 'One player cannot start');
select is(public.create_quarrel_room('Different name')->>'id', (select snapshot->>'id' from test_room), 'Retry does not create another room');
select is((select count(*)::integer from public.quarrel_rooms), 1, 'Member sees only own room');
select ok(not ((select snapshot->'players'->0 from test_room) ? 'user_id'), 'Snapshot does not expose auth IDs');
select is(public.set_quarrel_ready(true) #>> '{players,0,ready}', 'true', 'A can set own readiness');

set local request.jwt.claim.sub = 'b2222222-2222-4222-8222-222222222222';
select is((select count(*)::integer from public.quarrel_rooms), 0, 'Outsider cannot see private rooms');
select is((select count(*)::integer from public.quarrel_players), 0, 'Outsider cannot see private names or readiness');
select throws_ok($$select public.join_quarrel_room('bad', 'Bea')$$, 'P0001', 'INVALID_CODE', 'Malformed code rejected');
select throws_ok($$select public.join_quarrel_room('ZZZZZZ', 'Bea')$$, 'P0001', 'ROOM_NOT_FOUND', 'Nonexistent code rejected');
update test_room set snapshot = public.join_quarrel_room(snapshot->>'code', 'Bea');
select is((select snapshot->>'you' from test_room), 'B', 'Joiner is player B');
select is((select jsonb_array_length(snapshot->'players') from test_room), 2, 'Joined room has exactly two slots');
select is((select snapshot #>> '{players,0,name}' from test_room), 'Alex', 'Joiner sees creator name');
select is((select snapshot #>> '{players,0,ready}' from test_room), 'true', 'Joiner sees creator readiness');
select is(public.join_quarrel_room((select snapshot->>'code' from test_room), 'Changed')->>'you', 'B', 'Session recovers its existing slot');
select is(public.get_quarrel_room() #>> '{players,1,name}', 'Bea', 'Joining again does not replace the established name');
select is(public.set_quarrel_ready(true)->>'bothReady', 'true', 'Both ready produces confirmation');
select throws_ok($$update public.quarrel_players set ready = false where slot = 'A'$$,
  '42501', 'permission denied for table quarrel_players', 'B cannot update A directly');
select throws_ok($$select public.set_quarrel_ready(null)$$, 'P0001', 'INVALID_READY', 'Null readiness rejected');
select is(public.set_quarrel_ready(false) #>> '{players,0,ready}', 'true', 'Changing B never changes A readiness');
select is(public.get_quarrel_room() #>> '{players,1,ready}', 'false', 'Only B becomes unready');
select is(public.heartbeat_quarrel_room() #>> '{players,1,connected}', 'true', 'Authenticated heartbeat updates own connection');

set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';
select throws_ok($$select public.join_quarrel_room((select snapshot->>'code' from test_room), 'Cy')$$,
  'P0001', 'ROOM_FULL', 'Third player rejected');
select is((select count(*)::integer from public.quarrel_players), 0, 'Rejected third player still cannot inspect participants');
select throws_ok($$select public.set_quarrel_ready(true)$$, 'P0001', 'ROOM_NOT_FOUND', 'Outsider cannot change readiness');
select throws_ok($$select public.heartbeat_quarrel_room()$$, 'P0001', 'ROOM_NOT_FOUND', 'Outsider cannot forge a heartbeat');

reset role;
update public.quarrel_players set last_seen = now() - interval '36 seconds'
  where user_id = 'a1111111-1111-4111-8111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub = 'b2222222-2222-4222-8222-222222222222';
select is(public.get_quarrel_room() #>> '{players,0,connected}', 'false', 'Stale heartbeat marks A disconnected');
select is(public.set_quarrel_ready(true)->>'bothReady', 'false', 'Disconnected ready player cannot confirm start');
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select is(public.heartbeat_quarrel_room()->>'bothReady', 'true', 'Recovered session restores connection');

reset role;
update public.quarrel_rooms set expires_at = now() - interval '1 second'
  where id = (select (snapshot->>'id')::uuid from test_room);
set local role authenticated;
select throws_ok($$select public.get_quarrel_room()$$, 'P0001', 'ROOM_EXPIRED', 'Expired room cannot be read through RPC');
select is((select count(*)::integer from public.quarrel_rooms), 0, 'RLS hides expired room');
select throws_ok($$select public.set_quarrel_ready(false)$$, 'P0001', 'ROOM_EXPIRED', 'Expired room cannot be mutated');
select isnt(public.create_quarrel_room('Alex')->>'id', (select snapshot->>'id' from test_room), 'Player may start fresh after expiry');

reset role;
select * from finish();
rollback;
