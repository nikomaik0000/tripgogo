begin;

-- Move one scheduled TravelItem between Trip dates while preserving every
-- other item's relative order. The caller supplies both the drag-start order
-- snapshots and the complete desired lists; stale or incomplete writes fail
-- before any row is changed.
create or replace function public.tg_move_travel_item_between_dates(
  p_trip_id uuid,
  p_item_id uuid,
  p_source_date date,
  p_target_date date,
  p_source_snapshot text,
  p_target_snapshot text,
  p_source_ordered_ids uuid[],
  p_target_ordered_ids uuid[]
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
  v_source_current_ids uuid[];
  v_target_current_ids uuid[];
  v_expected_source_ids uuid[];
  v_target_without_item uuid[];
  v_updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_trip_id is null or p_item_id is null then
    raise exception 'Trip and TravelItem IDs are required';
  end if;
  if p_source_date is null or p_target_date is null then
    raise exception 'Source and target dates are required';
  end if;
  if p_source_date = p_target_date then
    raise exception 'Source and target dates must be different';
  end if;
  if p_source_snapshot is null or p_target_snapshot is null
     or p_source_ordered_ids is null or p_target_ordered_ids is null then
    raise exception 'Complete source and target order data is required';
  end if;

  -- All cross-date moves lock the parent first, then child rows by UUID. This
  -- gives concurrent moves one consistent lock order and keeps authorization,
  -- range validation, stale checks, and updates in one database transaction.
  select trip.mode, trip.start_date, trip.end_date
  into v_mode, v_start_date, v_end_date
  from public.tg_trips trip
  where trip.id = p_trip_id
  for update;

  if not found then raise exception 'Trip not found'; end if;
  if not public.tg_can_edit_trip(p_trip_id) then
    raise exception 'Trip edit permission is required';
  end if;
  if v_mode is distinct from 'trip' then
    raise exception 'Cross-date item moves require a Trip';
  end if;
  if v_start_date is null
     or v_end_date is null
     or p_source_date < v_start_date
     or p_source_date > v_end_date
     or p_target_date < v_start_date
     or p_target_date > v_end_date then
    raise exception 'Source and target dates must be within the Trip date range';
  end if;

  perform 1
  from public.tg_travel_items item
  where item.trip_id = p_trip_id
    and item.date in (p_source_date, p_target_date)
  order by item.id
  for update;

  if not exists (
    select 1
    from public.tg_travel_items item
    where item.id = p_item_id
      and item.trip_id = p_trip_id
      and item.date = p_source_date
  ) then
    raise exception 'TravelItem is not in the expected Trip source date';
  end if;

  select coalesce(
    array_agg(item.id order by item.sort_order, item.created_at, item.id),
    array[]::uuid[]
  )
  into v_source_current_ids
  from public.tg_travel_items item
  where item.trip_id = p_trip_id and item.date = p_source_date;

  select coalesce(
    array_agg(item.id order by item.sort_order, item.created_at, item.id),
    array[]::uuid[]
  )
  into v_target_current_ids
  from public.tg_travel_items item
  where item.trip_id = p_trip_id and item.date = p_target_date;

  -- The ordered ID string is a minimal per-column ordering version. It also
  -- detects inserts, deletes, and cross-date moves that occurred after drag
  -- start, without adding a version table or column.
  if array_to_string(v_source_current_ids, ',') is distinct from p_source_snapshot
     or array_to_string(v_target_current_ids, ',') is distinct from p_target_snapshot then
    raise exception 'Itinerary order changed; reload before moving this item';
  end if;

  if cardinality(p_source_ordered_ids) <> (
       select count(distinct ids.id) from unnest(p_source_ordered_ids) as ids(id)
     )
     or cardinality(p_target_ordered_ids) <> (
       select count(distinct ids.id) from unnest(p_target_ordered_ids) as ids(id)
     ) then
    raise exception 'Ordered item IDs must be unique';
  end if;

  if p_item_id = any(p_source_ordered_ids)
     or not (p_item_id = any(p_target_ordered_ids))
     or exists (
       select 1
       from unnest(p_source_ordered_ids) as source_ids(id)
       join unnest(p_target_ordered_ids) as target_ids(id) using (id)
     ) then
    raise exception 'Moved TravelItem must appear exactly once in the target date';
  end if;

  v_expected_source_ids := array_remove(v_source_current_ids, p_item_id);
  v_target_without_item := array_remove(p_target_ordered_ids, p_item_id);

  if p_source_ordered_ids is distinct from v_expected_source_ids then
    raise exception 'Source ordered IDs must preserve every remaining source item';
  end if;
  if v_target_without_item is distinct from v_target_current_ids
     or cardinality(p_target_ordered_ids) <> cardinality(v_target_current_ids) + 1 then
    raise exception 'Target ordered IDs must insert the item without reordering other items';
  end if;

  with desired as (
    select source_ids.id, p_source_date as date, (source_ids.position - 1)::integer as sort_order
    from unnest(p_source_ordered_ids) with ordinality as source_ids(id, position)
    union all
    select target_ids.id, p_target_date as date, (target_ids.position - 1)::integer as sort_order
    from unnest(p_target_ordered_ids) with ordinality as target_ids(id, position)
  )
  update public.tg_travel_items item
  set date = desired.date,
      sort_order = desired.sort_order
  from desired
  where item.id = desired.id
    and item.trip_id = p_trip_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> cardinality(p_source_ordered_ids) + cardinality(p_target_ordered_ids) then
    raise exception 'Cross-date move did not update the complete source and target groups';
  end if;
end;
$$;

revoke all on function public.tg_move_travel_item_between_dates(
  uuid, uuid, date, date, text, text, uuid[], uuid[]
) from public;
grant execute on function public.tg_move_travel_item_between_dates(
  uuid, uuid, date, date, text, text, uuid[], uuid[]
) to authenticated;

commit;
