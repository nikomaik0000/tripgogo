begin;

-- Move or swap complete Trip day groups atomically. Existing item rows and
-- metadata are preserved; only date and, for move, destination sort order change.
create or replace function public.tg_move_or_swap_trip_day_items(
  p_trip_id uuid,
  p_source_date date,
  p_target_date date,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
  v_start_date date;
  v_end_date date;
  v_source_count integer;
  v_target_max_order integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if not public.tg_can_edit_trip(p_trip_id) then
    raise exception 'Trip edit permission is required';
  end if;
  if p_operation is null or p_operation not in ('move', 'swap') then
    raise exception 'Operation must be move or swap';
  end if;
  if p_source_date is null or p_target_date is null then
    raise exception 'Source and target dates are required';
  end if;
  if p_source_date = p_target_date then
    raise exception 'Source and target dates must be different';
  end if;

  select trip.mode, trip.start_date, trip.end_date
  into v_mode, v_start_date, v_end_date
  from public.tg_trips trip
  where trip.id = p_trip_id
  for update;

  if not found then raise exception 'Trip not found'; end if;
  if v_mode is distinct from 'trip' then raise exception 'Day operations require a Trip'; end if;
  if v_start_date is null
     or v_end_date is null
     or p_source_date < v_start_date
     or p_source_date > v_end_date
     or p_target_date < v_start_date
     or p_target_date > v_end_date then
    raise exception 'Source and target dates must be within the Trip date range';
  end if;

  -- Lock both date groups in a stable row order before counting or reordering.
  perform 1
  from public.tg_travel_items item
  where item.trip_id = p_trip_id
    and item.date in (p_source_date, p_target_date)
  order by item.id
  for update;

  select count(*) into v_source_count
  from public.tg_travel_items item
  where item.trip_id = p_trip_id
    and item.date = p_source_date;

  if v_source_count = 0 then
    raise exception 'Source date has no TravelItems';
  end if;

  if p_operation = 'swap' then
    update public.tg_travel_items item
    set date = case item.date
      when p_source_date then p_target_date
      when p_target_date then p_source_date
    end
    where item.trip_id = p_trip_id
      and item.date in (p_source_date, p_target_date);
  else
    select coalesce(max(item.sort_order), -1)
    into v_target_max_order
    from public.tg_travel_items item
    where item.trip_id = p_trip_id
      and item.date = p_target_date;

    with source_items as (
      select
        item.id,
        row_number() over (
          order by item.sort_order, item.created_at, item.id
        )::integer as source_position
      from public.tg_travel_items item
      where item.trip_id = p_trip_id
        and item.date = p_source_date
    )
    update public.tg_travel_items item
    set
      date = p_target_date,
      sort_order = v_target_max_order + source_items.source_position
    from source_items
    where item.id = source_items.id;
  end if;
end;
$$;

revoke all on function public.tg_move_or_swap_trip_day_items(uuid, date, date, text) from public;
grant execute on function public.tg_move_or_swap_trip_day_items(uuid, date, date, text) to authenticated;

commit;
