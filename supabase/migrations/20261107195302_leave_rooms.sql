-- Keep a departed seat and its display name as part of the debate record, while
-- freeing the same authenticated identity to create/join another room. Slots
-- remain reserved: a new person can never inherit a departed player's record.
alter table public.quarrel_players alter column user_id drop not null;

-- A room identifier is a stale-page guard, never authorization. The caller's
-- verified auth.uid() still determines membership. Optional for legacy direct
-- RPC callers; the application sends it on room-bound mutations.
create function quarrel_private.check_room_request(p_room_id uuid) returns void
language plpgsql stable set search_path = '' as $$
declare
  v_expected text := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-quarrel-room-id';
begin
  if v_expected is not null and lower(v_expected) is distinct from p_room_id::text then
    raise exception 'STALE_ROOM';
  end if;
end;
$$;
revoke all on function quarrel_private.check_room_request(uuid) from public, anon, authenticated;

create or replace function quarrel_private.lock_member_room() returns public.quarrel_rooms
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_room public.quarrel_rooms;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select room_id into v_room_id from public.quarrel_players where user_id = v_uid;
  if not found then
    perform quarrel_private.check_room_request(null);
    return null;
  end if;
  select * into v_room from public.quarrel_rooms where id = v_room_id for update;
  if not found then return null; end if;
  if not exists(select 1 from public.quarrel_players where room_id = v_room.id and user_id = v_uid) then
    perform quarrel_private.check_room_request(null);
    return null;
  end if;
  perform quarrel_private.check_room_request(v_room.id);
  if v_room.expires_at <= clock_timestamp() then raise exception 'ROOM_EXPIRED'; end if;
  insert into quarrel_private.debates(room_id) values(v_room.id) on conflict (room_id) do nothing;
  return v_room;
end;
$$;

create function public.leave_quarrel_room(p_expected_room_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_current uuid;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if p_expected_room_id is null then raise exception 'STALE_ROOM'; end if;
  -- Match create/join lock order, then serialize with the room's existing turn
  -- and judge writes. A delayed retry must never leave a newer room.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select room_id into v_current from public.quarrel_players where user_id = v_uid;
  if not found then return null; end if;
  if v_current <> p_expected_room_id then raise exception 'STALE_ROOM'; end if;
  perform 1 from public.quarrel_rooms where id = v_current for update;
  if not exists(select 1 from public.quarrel_players where room_id = v_current and user_id = v_uid) then return null; end if;
  perform quarrel_private.check_room_request(v_current);
  update public.quarrel_players set user_id = null, ready = false, last_seen = '-infinity'::timestamptz
    where room_id = v_current and user_id = v_uid;
  update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_current;
  return null;
end;
$$;
revoke all on function public.leave_quarrel_room(uuid) from public, anon, authenticated;
grant execute on function public.leave_quarrel_room(uuid) to authenticated;

-- Expired membership cleanup should retain the same historical seat, too.
create or replace function quarrel_private.prepare_player(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_expired uuid;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 32
    or p_name ~ '[[:cntrl:]]' then raise exception 'INVALID_NAME'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select r.id into v_expired from public.quarrel_rooms r
    join public.quarrel_players p on p.room_id = r.id
    where p.user_id = v_uid and r.expires_at <= clock_timestamp() for update of r;
  if found then
    update public.quarrel_players set user_id = null, ready = false, last_seen = '-infinity'::timestamptz
      where room_id = v_expired and user_id = v_uid;
    update public.quarrel_rooms set debate_version = debate_version + 1 where id = v_expired;
  end if;
  return v_uid;
end;
$$;

create or replace function public.join_quarrel_room(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := quarrel_private.prepare_player(p_name);
  v_room public.quarrel_rooms;
  v_existing uuid;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'INVALID_CODE'; end if;
  select room_id into v_existing from public.quarrel_players where user_id = v_uid;
  select * into v_room from public.quarrel_rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= clock_timestamp() then raise exception 'ROOM_EXPIRED'; end if;
  perform quarrel_private.check_room_request(v_room.id);
  -- The remaining participant can still recover and review the old record.
  if v_existing = v_room.id then
    update public.quarrel_players set last_seen = clock_timestamp() where room_id = v_room.id and user_id = v_uid;
    return public.get_quarrel_room();
  end if;
  if v_existing is not null then raise exception 'ALREADY_IN_ROOM'; end if;
  if exists(select 1 from public.quarrel_players where room_id = v_room.id and user_id is null) then
    raise exception 'ROOM_CLOSED';
  end if;
  if exists(select 1 from public.quarrel_players where room_id = v_room.id and slot = 'B') then raise exception 'ROOM_FULL'; end if;
  insert into public.quarrel_players(room_id, user_id, slot, display_name)
    values(v_room.id, v_uid, 'B', btrim(p_name));
  return public.get_quarrel_room();
end;
$$;

-- Recheck membership under the room lock; the old theme function cached a slot
-- before waiting for the lock, which is no longer safe when players can leave.
create or replace function public.set_quarrel_theme(p_theme_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quarrel_rooms; v_slot text;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_theme_id is null or p_theme_id not in ('jungle','superhero','detective','courtroom') then raise exception 'INVALID_THEME'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  select slot into v_slot from public.quarrel_players where room_id = v_room.id and user_id = auth.uid();
  if v_slot <> 'A' then raise exception 'HOST_ONLY'; end if;
  if v_room.theme_locked then raise exception 'THEME_LOCKED'; end if;
  update public.quarrel_rooms set theme_id = p_theme_id where id = v_room.id;
  return public.get_quarrel_room();
end;
$$;

create or replace function public.heartbeat_quarrel_room() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.quarrel_rooms;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  v_room := quarrel_private.lock_member_room();
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  update public.quarrel_players set last_seen = clock_timestamp()
    where room_id = v_room.id and user_id = auth.uid();
  return public.get_quarrel_room();
end;
$$;

-- Existing grants, RLS, two-slot primary key and unique non-null user identity
-- remain. Departed rows stay read-only; no DELETE events or replacements added.
