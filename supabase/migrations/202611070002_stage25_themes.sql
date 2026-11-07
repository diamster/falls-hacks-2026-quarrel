-- Stage 2.5: presentation state only. The room remains two-player and no debate
-- start/turn/AI API is introduced. A future authorized start transition can set
-- theme_locked in the same transaction as its other start checks.
alter table public.quarrel_rooms
  add column theme_id text not null default 'jungle'
    constraint quarrel_rooms_theme_id_check check (theme_id in ('jungle', 'superhero', 'detective', 'courtroom')),
  add column theme_locked boolean not null default false;

create or replace function public.get_quarrel_room() returns jsonb
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
    'bothReady', v_both_ready, 'themeId', v_room.theme_id,
    'themeLocked', v_room.theme_locked, 'mode', 'solo', 'capacity', 2);
end;
$$;

create function public.set_quarrel_theme(p_theme_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_slot text;
  v_room public.quarrel_rooms;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if p_theme_id is null or p_theme_id not in ('jungle', 'superhero', 'detective', 'courtroom') then
    raise exception 'INVALID_THEME';
  end if;
  select room_id, slot into v_room_id, v_slot from public.quarrel_players where user_id = v_uid;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  -- Lock the room so a future start transition cannot race this write. No client
  -- can set the lock or claim another identity through this RPC.
  select * into v_room from public.quarrel_rooms where id = v_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;
  if v_slot <> 'A' then raise exception 'HOST_ONLY'; end if;
  if v_room.theme_locked then raise exception 'THEME_LOCKED'; end if;
  update public.quarrel_rooms set theme_id = p_theme_id where id = v_room.id;
  -- Readiness is deliberately unchanged: both-ready is a lobby confirmation,
  -- not a debate-start transition in Stage 2.5.
  return public.get_quarrel_room();
end;
$$;

revoke all on function public.set_quarrel_theme(text) from public, anon, authenticated;
grant execute on function public.set_quarrel_theme(text) to authenticated;

-- Existing membership SELECT RLS applies to room changes. No new read or table
-- mutation grants are needed. The publication remains insert/update only.
alter publication supabase_realtime add table public.quarrel_rooms;
