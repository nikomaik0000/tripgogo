begin;

-- TRIP GOGO — allow an editable Collection or Trip Place/Food item to be
-- copied into another editable Trip. The legacy function name and signature
-- remain stable for existing clients.
create or replace function public.tg_add_collection_item_to_trip(
  p_source_item_id uuid,
  p_target_trip_id uuid,
  p_target_date date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.tg_travel_items%rowtype;
  v_source_mode text;
  v_target_mode text;
  v_target_start date;
  v_target_end date;
  v_last_same_type_order integer;
  v_insert_order integer;
  v_destination_item_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select item.* into v_source
  from public.tg_travel_items item
  where item.id = p_source_item_id;

  if not found then raise exception 'Source item not found'; end if;
  if not public.tg_can_edit_trip(v_source.trip_id) then
    raise exception 'Source edit permission is required';
  end if;

  select trip.mode into v_source_mode
  from public.tg_trips trip
  where trip.id = v_source.trip_id;

  if v_source_mode is null or v_source_mode not in ('collection', 'trip') then
    raise exception 'Source item must belong to a Collection or Trip';
  end if;
  if v_source_mode = 'trip' and v_source.trip_id = p_target_trip_id then
    raise exception 'Source and target Trips must be different';
  end if;
  if not public.tg_can_edit_trip(p_target_trip_id) then
    raise exception 'Target Trip edit permission is required';
  end if;

  select trip.mode, trip.start_date, trip.end_date
  into v_target_mode, v_target_start, v_target_end
  from public.tg_trips trip
  where trip.id = p_target_trip_id
  for update;

  if not found then raise exception 'Target Trip not found'; end if;
  if v_target_mode is distinct from 'trip' then raise exception 'Target must be a Trip'; end if;
  if p_target_date is null
     or v_target_start is null
     or v_target_end is null
     or p_target_date < v_target_start
     or p_target_date > v_target_end then
    raise exception 'Target date must be within the Trip date range';
  end if;

  select max(item.sort_order) into v_last_same_type_order
  from public.tg_travel_items item
  where item.trip_id = p_target_trip_id
    and item.date = p_target_date
    and item.type = v_source.type;

  if v_last_same_type_order is null then
    select coalesce(max(item.sort_order), -1) + 1 into v_insert_order
    from public.tg_travel_items item
    where item.trip_id = p_target_trip_id
      and item.date = p_target_date;
  else
    v_insert_order := v_last_same_type_order + 1;
    update public.tg_travel_items item
    set sort_order = item.sort_order + 1
    where item.trip_id = p_target_trip_id
      and item.date = p_target_date
      and item.sort_order >= v_insert_order;
  end if;

  insert into public.tg_travel_items (
    id, trip_id, created_by, type, category, area, date, name, google_maps_url,
    extra_link_1, extra_link_2, business_hours, closed_days_text, closed_rule_type,
    closed_rule_values, note, status, rating, completed_date, experience_note,
    consumed_items, sort_order, image_path, image_fit, duplicate_source_item_id
  ) values (
    v_destination_item_id, p_target_trip_id, v_user_id, v_source.type,
    v_source.category, v_source.area, p_target_date, v_source.name,
    v_source.google_maps_url, v_source.extra_link_1, v_source.extra_link_2,
    v_source.business_hours, v_source.closed_days_text, v_source.closed_rule_type,
    v_source.closed_rule_values, v_source.note, null, v_source.rating, null,
    v_source.experience_note, v_source.consumed_items, v_insert_order, null,
    v_source.image_fit, null
  );

  return v_destination_item_id;
end;
$$;

revoke all on function public.tg_add_collection_item_to_trip(uuid, uuid, date) from public;
grant execute on function public.tg_add_collection_item_to_trip(uuid, uuid, date) to authenticated;

commit;
