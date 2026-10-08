begin;

-- TRIP GOGO — permission-aware GPT JSON batch import for one Trip or Collection.
-- Validation errors are isolated per item so successful rows can be reported
-- alongside failures. The client still blocks confirmation while preview errors
-- exist; this function is the authoritative final validation boundary.

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
  v_sort_order integer;
  v_success_count integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
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

  if not found then
    raise exception 'Trip or Collection not found';
  end if;

  for v_row, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(p_items) with ordinality
  loop
    begin
      if jsonb_typeof(v_row) is distinct from 'object' then
        raise exception 'Each item must be a JSON object';
      end if;
      if exists (
        select 1
        from jsonb_object_keys(v_row) as field(key)
        where field.key not in (
          'type', 'category', 'area', 'name', 'date', 'businessHours',
          'googleMapsUrl', 'link1', 'link2', 'note', 'status', 'rating',
          'completedDate', 'consumedItems', 'experienceNote'
        )
      ) then
        raise exception 'Item contains an unsupported field';
      end if;
      if exists (
        select 1
        from jsonb_each(v_row) as field(key, value)
        where field.key in (
          'type', 'category', 'area', 'name', 'date', 'businessHours',
          'googleMapsUrl', 'link1', 'link2', 'note', 'status',
          'completedDate', 'consumedItems', 'experienceNote'
        )
          and jsonb_typeof(field.value) not in ('string', 'null')
      ) then
        raise exception 'Text fields must contain strings or null';
      end if;

      v_type := v_row ->> 'type';
      v_name := btrim(coalesce(v_row ->> 'name', ''));
      if v_type is null or v_type not in ('place', 'food') then
        raise exception 'type must be place or food';
      end if;
      if v_name = '' then
        raise exception 'name is required';
      end if;
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
        if v_status not in ('planned', 'completed') then
          raise exception 'status must be planned or completed';
        end if;
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

      select coalesce(max(item.sort_order), -1) + 1
      into v_sort_order
      from public.tg_travel_items item
      where item.trip_id = p_trip_id
        and item.date is not distinct from v_date;

      insert into public.tg_travel_items (
        trip_id, created_by, type, category, area, date, name, google_maps_url,
        extra_link_1, extra_link_2, business_hours, note, status, rating,
        completed_date, experience_note, consumed_items, image_path, image_fit,
        sort_order
      ) values (
        p_trip_id, v_user_id, v_type, btrim(coalesce(v_row ->> 'category', '')),
        btrim(coalesce(v_row ->> 'area', '')), v_date, v_name,
        btrim(coalesce(v_row ->> 'googleMapsUrl', '')),
        nullif(btrim(coalesce(v_row ->> 'link1', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'link2', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'businessHours', '')), ''),
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
