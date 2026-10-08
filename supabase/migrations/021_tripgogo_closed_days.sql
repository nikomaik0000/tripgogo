begin;

-- TRIP GOGO — structured closed-day metadata shared by Trip and Collection items.
-- Existing rows remain unchanged because every new column is nullable.
alter table public.tg_travel_items
  add column if not exists closed_days_text text,
  add column if not exists closed_rule_type text,
  add column if not exists closed_rule_values jsonb;

alter table public.tg_travel_items
  drop constraint if exists tg_travel_items_closed_rule_type_check,
  drop constraint if exists tg_travel_items_closed_rule_values_check;

alter table public.tg_travel_items
  add constraint tg_travel_items_closed_rule_type_check check (
    closed_rule_type is null
    or closed_rule_type in ('weekday', 'monthly_date', 'specific_date', 'irregular')
  ),
  add constraint tg_travel_items_closed_rule_values_check check (
    closed_rule_values is null or jsonb_typeof(closed_rule_values) = 'array'
  );

-- Preserve migration 017's owner-or-Platform-Admin duplicate permission and
-- all existing Trip, Collection, resource, image-lineage, and metadata behavior.
create or replace function public.tg_duplicate_trip(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_trip_id uuid := gen_random_uuid();
begin
  if v_user_id is null or not public.tg_can_manage_trip(p_trip_id) then
    raise exception 'Only the Trip owner or a Platform Admin can duplicate this Trip';
  end if;

  insert into public.tg_trips (id, owner_id, name, mode, start_date, end_date, is_public)
  select v_new_trip_id, v_user_id, name || ' - 複製', mode, start_date, end_date, is_public
  from public.tg_trips where id = p_trip_id;

  if not found then raise exception 'Trip not found'; end if;

  insert into public.tg_travel_items (
    id, trip_id, created_by, type, category, area, date, name, google_maps_url,
    extra_link_1, extra_link_2, business_hours, closed_days_text, closed_rule_type,
    closed_rule_values, note, status, rating, completed_date, experience_note,
    consumed_items, sort_order, image_path, image_fit, duplicate_source_item_id
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, type, category, area, date, name,
    google_maps_url, extra_link_1, extra_link_2, business_hours, closed_days_text,
    closed_rule_type, closed_rule_values, note, status, rating, completed_date,
    experience_note, consumed_items, sort_order, null, image_fit, id
  from public.tg_travel_items where trip_id = p_trip_id;

  insert into public.tg_flights (
    id, trip_id, created_by, airline, flight_number, departure_place, arrival_place,
    departure_date, departure_time, arrival_date, arrival_time, link, note
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, airline, flight_number,
    departure_place, arrival_place, departure_date, departure_time, arrival_date,
    arrival_time, link, note from public.tg_flights where trip_id = p_trip_id;

  insert into public.tg_hotel_stays (
    id, trip_id, created_by, name, check_in_date, check_out_date, check_in_time,
    check_out_time, address, phone, google_maps_url, link, note
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, name, check_in_date,
    check_out_date, check_in_time, check_out_time, address, phone, google_maps_url,
    link, note from public.tg_hotel_stays where trip_id = p_trip_id;

  insert into public.tg_transportations (
    id, trip_id, created_by, type, company, vehicle_model, route_name, start_date,
    start_time, end_date, end_time, departure_place, arrival_place, train_number,
    seat, carriage, ticket, reservation_number, cost, address, link, google_maps_url, note
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, type, company, vehicle_model,
    route_name, start_date, start_time, end_date, end_time, departure_place,
    arrival_place, train_number, seat, carriage, ticket, reservation_number, cost,
    address, link, google_maps_url, note
  from public.tg_transportations where trip_id = p_trip_id;

  insert into public.tg_trip_resources (
    id, trip_id, created_by, category, title, note, external_url, image_path
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, category, title, note,
    external_url, image_path
  from public.tg_trip_resources where trip_id = p_trip_id;

  return v_new_trip_id;
end;
$$;

revoke all on function public.tg_duplicate_trip(uuid) from public;
grant execute on function public.tg_duplicate_trip(uuid) to authenticated;

-- Preserve migration 018's permission, target-date, same-type ordering, and
-- independent-image semantics while copying closed-day metadata.
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

  if not found then raise exception 'Collection item not found'; end if;
  if not public.tg_can_edit_trip(v_source.trip_id) then
    raise exception 'Collection edit permission is required';
  end if;

  select trip.mode into v_source_mode
  from public.tg_trips trip
  where trip.id = v_source.trip_id;

  if v_source_mode is distinct from 'collection' then
    raise exception 'Source item must belong to a Collection';
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

-- Preserve migration 019's per-row isolation, permission checks, workspace
-- semantics, and ordering while validating and inserting closed-day metadata.
create or replace function public.tg_import_travel_items(
  p_trip_id uuid,
  p_items jsonb
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
  v_row jsonb;
  v_index integer;
  v_type text;
  v_name text;
  v_date date;
  v_status text;
  v_rating numeric(5,2);
  v_completed_date date;
  v_closed_days_text text;
  v_closed_rule_type text;
  v_closed_rule_values jsonb;
  v_rule_value jsonb;
  v_rule_date date;
  v_sort_order integer;
  v_success_count integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not public.tg_can_edit_trip(p_trip_id) then
    raise exception 'Trip edit permission is required';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Import payload must be a non-empty JSON array';
  end if;

  select trip.mode, trip.start_date, trip.end_date
  into v_mode, v_start_date, v_end_date
  from public.tg_trips trip
  where trip.id = p_trip_id
  for update;

  if not found then raise exception 'Trip or Collection not found'; end if;

  for v_row, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(p_items) with ordinality
  loop
    begin
      if jsonb_typeof(v_row) is distinct from 'object' then
        raise exception 'Each item must be a JSON object';
      end if;
      if exists (
        select 1 from jsonb_object_keys(v_row) as field(key)
        where field.key not in (
          'type', 'category', 'area', 'name', 'date', 'businessHours',
          'closedDaysText', 'closedRuleType', 'closedRuleValues',
          'googleMapsUrl', 'link1', 'link2', 'note', 'status', 'rating',
          'completedDate', 'consumedItems', 'experienceNote'
        )
      ) then
        raise exception 'Item contains an unsupported field';
      end if;
      if exists (
        select 1 from jsonb_each(v_row) as field(key, value)
        where field.key in (
          'type', 'category', 'area', 'name', 'date', 'businessHours',
          'closedDaysText', 'closedRuleType', 'googleMapsUrl', 'link1', 'link2',
          'note', 'status', 'completedDate', 'consumedItems', 'experienceNote'
        )
          and jsonb_typeof(field.value) not in ('string', 'null')
      ) then
        raise exception 'Text fields must contain strings or null';
      end if;

      v_type := v_row ->> 'type';
      v_name := btrim(coalesce(v_row ->> 'name', ''));
      if v_type is null or v_type not in ('place', 'food') then raise exception 'type must be place or food'; end if;
      if v_name = '' then raise exception 'name is required'; end if;
      if v_type = 'place' and btrim(coalesce(v_row ->> 'consumedItems', '')) <> '' then
        raise exception 'consumedItems is only available for food';
      end if;

      if v_row ? 'rating' and jsonb_typeof(v_row -> 'rating') not in ('number', 'null') then
        raise exception 'rating must be a number or null';
      end if;
      v_rating := nullif(v_row ->> 'rating', '')::numeric(5,2);
      if v_rating is not null and (v_rating < 0 or v_rating > 100) then
        raise exception 'rating must be between 0 and 100';
      end if;

      v_closed_days_text := nullif(btrim(coalesce(v_row ->> 'closedDaysText', '')), '');
      v_closed_rule_type := nullif(btrim(coalesce(v_row ->> 'closedRuleType', '')), '');
      if v_closed_rule_type is not null
         and v_closed_rule_type not in ('weekday', 'monthly_date', 'specific_date', 'irregular') then
        raise exception 'closedRuleType is unsupported';
      end if;

      if v_row ? 'closedRuleValues' and jsonb_typeof(v_row -> 'closedRuleValues') <> 'null' then
        if jsonb_typeof(v_row -> 'closedRuleValues') <> 'array' then
          raise exception 'closedRuleValues must be an array or null';
        end if;
        v_closed_rule_values := v_row -> 'closedRuleValues';
      else
        v_closed_rule_values := null;
      end if;

      if v_closed_rule_type is null then
        if v_closed_rule_values is not null and jsonb_array_length(v_closed_rule_values) > 0 then
          raise exception 'closedRuleValues requires closedRuleType';
        end if;
        v_closed_rule_values := null;
      elsif v_closed_rule_type = 'irregular' then
        if v_closed_rule_values is not null and jsonb_array_length(v_closed_rule_values) > 0 then
          raise exception 'irregular closedRuleValues must be empty';
        end if;
        v_closed_rule_values := '[]'::jsonb;
        v_closed_days_text := coalesce(v_closed_days_text, '不定休');
      else
        if v_closed_rule_values is null or jsonb_array_length(v_closed_rule_values) = 0 then
          raise exception 'structured closedRuleValues must be a non-empty array';
        end if;
        if (select count(*) from jsonb_array_elements(v_closed_rule_values))
           <> (select count(distinct value) from jsonb_array_elements(v_closed_rule_values)) then
          raise exception 'closedRuleValues must not contain duplicates';
        end if;

        if v_closed_rule_type in ('weekday', 'monthly_date') then
          if exists (select 1 from jsonb_array_elements(v_closed_rule_values) value where jsonb_typeof(value) <> 'number') then
            raise exception 'numeric closedRuleValues must contain numbers';
          end if;
          if exists (
            select 1 from jsonb_array_elements(v_closed_rule_values) value
            where (value #>> '{}')::numeric <> trunc((value #>> '{}')::numeric)
               or (v_closed_rule_type = 'weekday' and (value #>> '{}')::integer not between 0 and 6)
               or (v_closed_rule_type = 'monthly_date' and (value #>> '{}')::integer not between 1 and 31)
          ) then
            raise exception 'numeric closedRuleValues are out of range';
          end if;
          if v_closed_days_text is null and v_closed_rule_type = 'weekday' then
            select '週' || string_agg(
              case (value #>> '{}')::integer
                when 0 then '日' when 1 then '一' when 2 then '二' when 3 then '三'
                when 4 then '四' when 5 then '五' when 6 then '六'
              end,
              '、' order by case (value #>> '{}')::integer when 0 then 7 else (value #>> '{}')::integer end
            ) into v_closed_days_text
            from jsonb_array_elements(v_closed_rule_values) value;
          elsif v_closed_days_text is null then
            select '每月' || string_agg((value #>> '{}')::integer::text, '、' order by (value #>> '{}')::integer) || '日'
            into v_closed_days_text
            from jsonb_array_elements(v_closed_rule_values) value;
          end if;
        else
          if exists (select 1 from jsonb_array_elements(v_closed_rule_values) value where jsonb_typeof(value) <> 'string') then
            raise exception 'specific_date closedRuleValues must contain strings';
          end if;
          for v_rule_value in select value from jsonb_array_elements(v_closed_rule_values)
          loop
            if (v_rule_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
              raise exception 'specific_date values must use YYYY-MM-DD';
            end if;
            begin
              v_rule_date := (v_rule_value #>> '{}')::date;
            exception when others then
              raise exception 'specific_date values must be real dates';
            end;
            if to_char(v_rule_date, 'YYYY-MM-DD') <> (v_rule_value #>> '{}') then
              raise exception 'specific_date values must be real dates';
            end if;
          end loop;
          if v_closed_days_text is null then
            select string_agg(
              extract(month from value_date)::integer::text || '/' || extract(day from value_date)::integer::text,
              '、' order by value_date
            ) into v_closed_days_text
            from (
              select (value #>> '{}')::date as value_date
              from jsonb_array_elements(v_closed_rule_values) value
              order by (value #>> '{}')::date
              limit 2
            ) visible_dates;
            if jsonb_array_length(v_closed_rule_values) > 2 then
              v_closed_days_text := v_closed_days_text || '…';
            end if;
          end if;
        end if;
      end if;

      if v_mode = 'trip' then
        if coalesce(v_row ->> 'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'Trip items require date in YYYY-MM-DD format';
        end if;
        v_date := (v_row ->> 'date')::date;
        if v_start_date is null or v_end_date is null or v_date < v_start_date or v_date > v_end_date then
          raise exception 'date must be within the Trip date range';
        end if;
        v_status := null;
        v_completed_date := null;
      elsif v_mode = 'collection' then
        v_date := null;
        v_status := coalesce(nullif(v_row ->> 'status', ''), 'planned');
        if v_status not in ('planned', 'completed') then raise exception 'status must be planned or completed'; end if;
        if nullif(v_row ->> 'completedDate', '') is not null then
          if (v_row ->> 'completedDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
            raise exception 'completedDate must use YYYY-MM-DD format';
          end if;
          v_completed_date := (v_row ->> 'completedDate')::date;
        else
          v_completed_date := null;
        end if;
      else
        raise exception 'Unsupported workspace mode';
      end if;

      select coalesce(max(item.sort_order), -1) + 1 into v_sort_order
      from public.tg_travel_items item
      where item.trip_id = p_trip_id
        and item.date is not distinct from v_date;

      insert into public.tg_travel_items (
        trip_id, created_by, type, category, area, date, name, google_maps_url,
        extra_link_1, extra_link_2, business_hours, closed_days_text, closed_rule_type,
        closed_rule_values, note, status, rating, completed_date, experience_note,
        consumed_items, image_path, image_fit, sort_order
      ) values (
        p_trip_id, v_user_id, v_type, btrim(coalesce(v_row ->> 'category', '')),
        btrim(coalesce(v_row ->> 'area', '')), v_date, v_name,
        btrim(coalesce(v_row ->> 'googleMapsUrl', '')),
        nullif(btrim(coalesce(v_row ->> 'link1', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'link2', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'businessHours', '')), ''),
        v_closed_days_text, v_closed_rule_type, v_closed_rule_values,
        btrim(coalesce(v_row ->> 'note', '')), v_status, v_rating,
        v_completed_date,
        nullif(btrim(coalesce(v_row ->> 'experienceNote', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'consumedItems', '')), ''),
        null, 'cover', v_sort_order
      );

      v_success_count := v_success_count + 1;
    exception when others then
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'successCount', v_success_count,
    'failureCount', jsonb_array_length(v_failures),
    'failures', v_failures
  );
end;
$$;

revoke all on function public.tg_import_travel_items(uuid, jsonb) from public;
grant execute on function public.tg_import_travel_items(uuid, jsonb) to authenticated;

commit;
