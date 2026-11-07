-- Stage 2: invite-only rooms. No debate state or public room directory.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists quarrel_private;
revoke all on schema quarrel_private from public, anon, authenticated;
grant usage on schema quarrel_private to authenticated;

create table public.quarrel_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table public.quarrel_players (
  room_id uuid not null references public.quarrel_rooms(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  slot text not null check (slot in ('A', 'B')),
  display_name text not null check (char_length(display_name) between 1 and 32 and display_name = btrim(display_name)),
  ready boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (room_id, slot)
);

alter table public.quarrel_rooms enable row level security;
alter table public.quarrel_players enable row level security;
-- Explicit revocation also covers projects with permissive default grants.
revoke all on public.quarrel_rooms, public.quarrel_players from public, anon, authenticated;
grant select on public.quarrel_rooms, public.quarrel_players to authenticated;

-- Definer helper avoids recursive player RLS. It only returns the caller's room.
create function quarrel_private.current_room_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.room_id from public.quarrel_players p
  join public.quarrel_rooms r on r.id = p.room_id
  where p.user_id = auth.uid() and r.expires_at > now();
$$;
revoke all on function quarrel_private.current_room_id() from public, anon, authenticated;
grant execute on function quarrel_private.current_room_id() to authenticated;

create policy "Members read their room" on public.quarrel_rooms for select to authenticated
using (id = (select quarrel_private.current_room_id()));
create policy "Members read both player slots" on public.quarrel_players for select to authenticated
using (room_id = (select quarrel_private.current_room_id()));

create function public.get_quarrel_room() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_room public.quarrel_rooms;
  v_slot text;
  v_players jsonb;
  v_both_ready boolean;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select r.* into v_room
    from public.quarrel_rooms r join public.quarrel_players p on p.room_id = r.id
    where p.user_id = v_uid;
  if not found then return null; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;
  select slot into v_slot from public.quarrel_players where user_id = v_uid;
  select jsonb_agg(jsonb_build_object(
      'slot', p.slot, 'name', p.display_name, 'ready', p.ready,
      'connected', p.last_seen > now() - interval '35 seconds'
    ) order by p.slot),
    count(*) = 2 and bool_and(p.ready and p.last_seen > now() - interval '35 seconds')
    into v_players, v_both_ready
    from public.quarrel_players p where p.room_id = v_room.id;
  return jsonb_build_object('id', v_room.id, 'code', v_room.code,
    'expiresAt', v_room.expires_at, 'you', v_slot, 'players', v_players,
    'bothReady', v_both_ready);
end;
$$;

-- Serialize operations for the same authenticated session, including simultaneous
-- create/join requests. Room row locks separately serialize competing joiners.
create function quarrel_private.prepare_player(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 32
    or p_name ~ '[[:cntrl:]]' then raise exception 'INVALID_NAME'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  delete from public.quarrel_players p using public.quarrel_rooms r
    where p.user_id = v_uid and p.room_id = r.id and r.expires_at <= now();
  return v_uid;
end;
$$;
revoke all on function quarrel_private.prepare_player(text) from public, anon, authenticated;

create function public.create_quarrel_room(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := quarrel_private.prepare_player(p_name);
  v_id uuid;
  v_code text;
  v_random bytea;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if exists(select 1 from public.quarrel_players where user_id = v_uid) then
    return public.get_quarrel_room();
  end if;
  -- Each of 32 symbols has equal probability; unique index handles collisions.
  loop
    v_random := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_random, i) & 31) + 1, 1);
    end loop;
    insert into public.quarrel_rooms(code) values (v_code)
      on conflict (code) do nothing returning id into v_id;
    exit when v_id is not null;
  end loop;
  insert into public.quarrel_players(room_id, user_id, slot, display_name)
    values (v_id, v_uid, 'A', btrim(p_name));
  return public.get_quarrel_room();
end;
$$;

create function public.join_quarrel_room(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := quarrel_private.prepare_player(p_name);
  v_room public.quarrel_rooms;
  v_existing uuid;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'INVALID_CODE';
  end if;
  select room_id into v_existing from public.quarrel_players where user_id = v_uid;
  select * into v_room from public.quarrel_rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;
  if v_existing = v_room.id then
    update public.quarrel_players set last_seen = now() where user_id = v_uid;
    return public.get_quarrel_room();
  end if;
  if v_existing is not null then raise exception 'ALREADY_IN_ROOM'; end if;
  if exists(select 1 from public.quarrel_players where room_id = v_room.id and slot = 'B') then
    raise exception 'ROOM_FULL';
  end if;
  insert into public.quarrel_players(room_id, user_id, slot, display_name)
    values(v_room.id, v_uid, 'B', btrim(p_name));
  return public.get_quarrel_room();
end;
$$;

create function public.set_quarrel_ready(p_ready boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_ready is null then raise exception 'INVALID_READY'; end if;
  perform public.get_quarrel_room(); -- Also checks expiry before mutation.
  update public.quarrel_players set ready = p_ready, last_seen = now()
    where user_id = auth.uid();
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return public.get_quarrel_room();
end;
$$;

create function public.heartbeat_quarrel_room() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  perform public.get_quarrel_room();
  update public.quarrel_players set last_seen = now() where user_id = auth.uid();
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return public.get_quarrel_room();
end;
$$;

revoke all on function public.get_quarrel_room(), public.create_quarrel_room(text),
  public.join_quarrel_room(text, text), public.set_quarrel_ready(boolean),
  public.heartbeat_quarrel_room() from public, anon, authenticated;
grant execute on function public.get_quarrel_room(), public.create_quarrel_room(text),
  public.join_quarrel_room(text, text), public.set_quarrel_ready(boolean),
  public.heartbeat_quarrel_room() to authenticated;

-- Postgres Changes checks SELECT RLS for each subscriber. No public Broadcast
-- or client-reported Presence is used to authorize identity or readiness.
alter publication supabase_realtime add table public.quarrel_players;
-- IMPORTANT: this migration targets a dedicated quarrel Supabase project.
-- Supabase cannot apply RLS to deleted rows. Suppress DELETE (and TRUNCATE)
-- events at the publication so expired-member cleanup cannot disclose room
-- UUID/slot metadata to outsider subscriptions. This setting is publication-wide:
-- do not apply it to a shared project whose other apps require delete events.
alter publication supabase_realtime set (publish = 'insert, update');
