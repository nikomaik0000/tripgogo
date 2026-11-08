begin;

-- Extend the existing safe TravelItem update transaction to Collection mode.
-- This migration keeps the Trip contract intact and adds no replace, delete,
-- backup, Storage, or cleanup behavior.
create or replace function public.tg_prepare_travel_items_update(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
begin
  if auth.uid() is null or not public.tg_can_edit_trip(p_trip_id) then
    raise exception 'Trip or Collection edit permission is required';
  end if;

  select trip.mode into v_mode
  from public.tg_trips trip
  where trip.id = p_trip_id;

  if not found then raise exception 'Trip or Collection not found'; end if;
  if v_mode not in ('trip', 'collection') then raise exception 'Unsupported workspace mode'; end if;

  return jsonb_build_object(
    'snapshotToken', public.tg_travel_items_snapshot_token(p_trip_id),
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.date, item.sort_order, item.created_at, item.id)
      from public.tg_travel_items item
      where item.trip_id = p_trip_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.tg_prepare_travel_items_update(uuid) from public;
grant execute on function public.tg_prepare_travel_items_update(uuid) to authenticated;

create or replace function public.tg_update_travel_items(
  p_trip_id uuid,
  p_snapshot_token text,
  p_request_id uuid,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_mode text;
  v_start_date date;
  v_end_date date;
  v_existing_result jsonb;
  v_operation jsonb;
  v_action text;
  v_index integer;
  v_item_id uuid;
  v_patch jsonb;
  v_item public.tg_travel_items%rowtype;
  v_new_date date;
  v_completed_date date;
  v_sort_order integer;
  v_add_result jsonb;
  v_success_count integer := 0;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if p_request_id is null then raise exception 'Request ID is required'; end if;
  if p_snapshot_token is null or btrim(p_snapshot_token) = '' then raise exception 'Snapshot token is required'; end if;
  if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations) = 0 then
    raise exception 'At least one confirmed operation is required';
  end if;

  select request.result into v_existing_result
  from public.tg_itinerary_update_requests request
  where request.id = p_request_id
    and request.trip_id = p_trip_id
    and request.user_id = v_user_id;
  if found then return v_existing_result; end if;

  if exists (select 1 from public.tg_itinerary_update_requests request where request.id = p_request_id) then
    raise exception 'Request ID is already in use';
  end if;
  if not public.tg_can_edit_trip(p_trip_id) then
    raise exception 'Trip or Collection edit permission is required';
  end if;

  select trip.mode, trip.start_date, trip.end_date
  into v_mode, v_start_date, v_end_date
  from public.tg_trips trip
  where trip.id = p_trip_id
  for update;

  if not found then raise exception 'Trip or Collection not found'; end if;
  if v_mode not in ('trip', 'collection') then raise exception 'Unsupported workspace mode'; end if;

  -- A concurrent retry with the same request ID may have completed while this
  -- transaction waited for the workspace lock.
  select request.result into v_existing_result
  from public.tg_itinerary_update_requests request
  where request.id = p_request_id
    and request.trip_id = p_trip_id
    and request.user_id = v_user_id;
  if found then return v_existing_result; end if;

  perform 1
  from public.tg_travel_items item
  where item.trip_id = p_trip_id
  order by item.id
  for update;

  if public.tg_travel_items_snapshot_token(p_trip_id) is distinct from p_snapshot_token then
    raise exception 'The workspace changed after preview; parse and preview again';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) operation
    where jsonb_typeof(operation) is distinct from 'object'
      or operation ->> 'action' not in ('add', 'update')
      or coalesce(operation ->> 'index', '') !~ '^[0-9]+$'
  ) then
    raise exception 'Operations contain an invalid action or source index';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_operations) operation where operation ->> 'action' = 'update'
  ) <> (
    select count(distinct operation ->> 'itemId')
    from jsonb_array_elements(p_operations) operation
    where operation ->> 'action' = 'update'
  ) then
    raise exception 'An existing item may only be updated once per request';
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_action := v_operation ->> 'action';
    v_index := (v_operation ->> 'index')::integer;

    if v_action = 'add' then
      if jsonb_typeof(v_operation -> 'item') is distinct from 'object' then
        raise exception 'Add operation % requires an item', v_index;
      end if;
      v_add_result := public.tg_import_travel_items(p_trip_id, jsonb_build_array(v_operation -> 'item'));
      if coalesce((v_add_result ->> 'failureCount')::integer, 0) <> 0 then
        raise exception 'Add operation % failed: %', v_index, v_add_result -> 'failures' -> 0 ->> 'message';
      end if;
      v_success_count := v_success_count + 1;
      continue;
    end if;

    begin
      v_item_id := (v_operation ->> 'itemId')::uuid;
    exception when others then
      raise exception 'Update operation % has an invalid item ID', v_index;
    end;
    v_patch := v_operation -> 'patch';
    if jsonb_typeof(v_patch) is distinct from 'object' or v_patch = '{}'::jsonb then
      raise exception 'Update operation % requires a non-empty patch', v_index;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_patch) field(key)
      where field.key not in (
        'type', 'category', 'area', 'date', 'name', 'googleMapsUrl', 'link1', 'link2',
        'businessHours', 'closedDaysText', 'closedRuleType', 'closedRuleValues', 'note',
        'priceList', 'priceCheckedAt', 'priceSource', 'status', 'rating', 'completedDate',
        'consumedItems', 'experienceNote'
      )
    ) then
      raise exception 'Update operation % contains an unsupported field', v_index;
    end if;
    if exists (
      select 1 from jsonb_each(v_patch) field(key, value)
      where field.key in (
        'type', 'category', 'area', 'date', 'name', 'googleMapsUrl', 'link1', 'link2',
        'businessHours', 'closedDaysText', 'closedRuleType', 'note', 'priceList',
        'priceCheckedAt', 'priceSource', 'status', 'completedDate', 'consumedItems',
        'experienceNote'
      )
        and jsonb_typeof(field.value) not in ('string', 'null')
    ) then
      raise exception 'Update operation % text fields must contain strings or null', v_index;
    end if;

    select item.* into v_item
    from public.tg_travel_items item
    where item.id = v_item_id and item.trip_id = p_trip_id
    for update;
    if not found then raise exception 'Update target % is not part of this workspace', v_index; end if;

    if v_patch ? 'type' and (jsonb_typeof(v_patch -> 'type') <> 'string' or v_patch ->> 'type' not in ('place', 'food')) then
      raise exception 'Update operation % has an invalid type', v_index;
    end if;
    if v_patch ? 'name' and (jsonb_typeof(v_patch -> 'name') <> 'string' or btrim(v_patch ->> 'name') = '') then
      raise exception 'Update operation % has an invalid name', v_index;
    end if;

    if v_mode = 'trip' then
      if (v_patch ? 'status') or (v_patch ? 'completedDate') then
        raise exception 'Update operation % contains Collection-only fields', v_index;
      end if;
      if v_patch ? 'date' then
        if jsonb_typeof(v_patch -> 'date') <> 'string' or (v_patch ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'Update operation % has an invalid date', v_index;
        end if;
        begin
          v_new_date := (v_patch ->> 'date')::date;
        exception when others then
          raise exception 'Update operation % has an invalid date', v_index;
        end;
        if to_char(v_new_date, 'YYYY-MM-DD') <> v_patch ->> 'date'
           or v_new_date < v_start_date or v_new_date > v_end_date then
          raise exception 'Update operation % date must be within the Trip date range', v_index;
        end if;
      else
        v_new_date := v_item.date;
      end if;
    else
      if v_item.date is not null then
        raise exception 'Collection item % has an unexpected itinerary date', v_index;
      end if;
      if v_patch ? 'date' then
        raise exception 'Collection item % date must remain null; use completedDate for the visit date', v_index;
      end if;
      v_new_date := null;
      if v_patch ? 'status'
         and (jsonb_typeof(v_patch -> 'status') <> 'string' or v_patch ->> 'status' not in ('planned', 'completed')) then
        raise exception 'Update operation % has an invalid Collection status', v_index;
      end if;
      if v_patch ? 'completedDate' and jsonb_typeof(v_patch -> 'completedDate') <> 'null' then
        if jsonb_typeof(v_patch -> 'completedDate') <> 'string'
           or (v_patch ->> 'completedDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'Update operation % has an invalid completed date', v_index;
        end if;
        begin
          v_completed_date := (v_patch ->> 'completedDate')::date;
        exception when others then
          raise exception 'Update operation % has an invalid completed date', v_index;
        end;
        if to_char(v_completed_date, 'YYYY-MM-DD') <> v_patch ->> 'completedDate' then
          raise exception 'Update operation % has an invalid completed date', v_index;
        end if;
      end if;
    end if;

    if v_patch ? 'rating'
       and jsonb_typeof(v_patch -> 'rating') not in ('number', 'null') then
      raise exception 'Update operation % has an invalid rating', v_index;
    end if;
    if v_patch ? 'rating' and jsonb_typeof(v_patch -> 'rating') = 'number'
       and ((v_patch ->> 'rating')::numeric < 0 or (v_patch ->> 'rating')::numeric > 100) then
      raise exception 'Update operation % rating must be between 0 and 100', v_index;
    end if;
    if v_patch ? 'closedRuleType' and jsonb_typeof(v_patch -> 'closedRuleType') <> 'null'
       and (jsonb_typeof(v_patch -> 'closedRuleType') <> 'string'
         or v_patch ->> 'closedRuleType' not in ('weekday', 'monthly_date', 'specific_date', 'irregular')) then
      raise exception 'Update operation % has an invalid closed-day rule', v_index;
    end if;
    if v_patch ? 'closedRuleValues' and jsonb_typeof(v_patch -> 'closedRuleValues') not in ('array', 'null') then
      raise exception 'Update operation % has invalid closed-day values', v_index;
    end if;
    if v_patch ? 'priceCheckedAt' and jsonb_typeof(v_patch -> 'priceCheckedAt') <> 'null' then
      if jsonb_typeof(v_patch -> 'priceCheckedAt') <> 'string'
         or (v_patch ->> 'priceCheckedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Update operation % has an invalid price check date', v_index;
      end if;
      begin
        perform (v_patch ->> 'priceCheckedAt')::date;
      exception when others then
        raise exception 'Update operation % has an invalid price check date', v_index;
      end;
    end if;

    if v_mode = 'trip' and v_new_date is distinct from v_item.date then
      select coalesce(max(item.sort_order), -1) + 1 into v_sort_order
      from public.tg_travel_items item
      where item.trip_id = p_trip_id and item.date = v_new_date;
    else
      v_sort_order := v_item.sort_order;
    end if;

    update public.tg_travel_items item
    set
      type = case when v_patch ? 'type' then v_patch ->> 'type' else item.type end,
      category = case when v_patch ? 'category' then coalesce(v_patch ->> 'category', '') else item.category end,
      area = case when v_patch ? 'area' then coalesce(v_patch ->> 'area', '') else item.area end,
      date = v_new_date,
      name = case when v_patch ? 'name' then btrim(v_patch ->> 'name') else item.name end,
      google_maps_url = case when v_patch ? 'googleMapsUrl' then coalesce(v_patch ->> 'googleMapsUrl', '') else item.google_maps_url end,
      extra_link_1 = case when v_patch ? 'link1' then nullif(v_patch ->> 'link1', '') else item.extra_link_1 end,
      extra_link_2 = case when v_patch ? 'link2' then nullif(v_patch ->> 'link2', '') else item.extra_link_2 end,
      business_hours = case when v_patch ? 'businessHours' then nullif(v_patch ->> 'businessHours', '') else item.business_hours end,
      closed_days_text = case when v_patch ? 'closedDaysText' then nullif(v_patch ->> 'closedDaysText', '') else item.closed_days_text end,
      closed_rule_type = case when v_patch ? 'closedRuleType' then nullif(v_patch ->> 'closedRuleType', '') else item.closed_rule_type end,
      closed_rule_values = case when v_patch ? 'closedRuleValues' then v_patch -> 'closedRuleValues' else item.closed_rule_values end,
      note = case when v_patch ? 'note' then coalesce(v_patch ->> 'note', '') else item.note end,
      price_list = case when v_patch ? 'priceList' then nullif(v_patch ->> 'priceList', '') else item.price_list end,
      price_checked_at = case when v_patch ? 'priceCheckedAt' then nullif(v_patch ->> 'priceCheckedAt', '')::date else item.price_checked_at end,
      price_source = case when v_patch ? 'priceSource' then nullif(v_patch ->> 'priceSource', '') else item.price_source end,
      status = case when v_patch ? 'status' then v_patch ->> 'status' else item.status end,
      rating = case when v_patch ? 'rating' then nullif(v_patch ->> 'rating', '')::numeric else item.rating end,
      completed_date = case when v_patch ? 'completedDate' then nullif(v_patch ->> 'completedDate', '')::date else item.completed_date end,
      consumed_items = case when v_patch ? 'consumedItems' then nullif(v_patch ->> 'consumedItems', '') else item.consumed_items end,
      experience_note = case when v_patch ? 'experienceNote' then nullif(v_patch ->> 'experienceNote', '') else item.experience_note end,
      sort_order = v_sort_order
    where item.id = v_item_id;

    v_success_count := v_success_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'successCount', v_success_count,
    'failureCount', 0,
    'failures', '[]'::jsonb
  );

  insert into public.tg_itinerary_update_requests (id, trip_id, user_id, snapshot_token, result)
  values (p_request_id, p_trip_id, v_user_id, p_snapshot_token, v_result);

  return v_result;
end;
$$;

revoke all on function public.tg_update_travel_items(uuid, text, uuid, jsonb) from public;
grant execute on function public.tg_update_travel_items(uuid, text, uuid, jsonb) to authenticated;

commit;
