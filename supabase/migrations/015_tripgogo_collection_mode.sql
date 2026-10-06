-- ============================================================
-- TRIP GOGO — collection mode
-- Additive extension of Trips and shared TravelItems. Existing Trips remain
-- mode = 'trip'; no rows are moved or rewritten into a second item model.
-- Requires 004_tripgogo_schema_rls.sql through 014_tripgogo_platform_admin.sql.
-- ============================================================

begin;

alter table public.tg_trips
  add column if not exists mode text not null default 'trip';

alter table public.tg_trips
  alter column start_date drop not null,
  alter column end_date drop not null;

alter table public.tg_trips
  drop constraint if exists tg_trips_date_range_check;

alter table public.tg_trips
  add constraint tg_trips_mode_check check (mode in ('trip', 'collection')),
  add constraint tg_trips_mode_dates_check check (
    (mode = 'trip' and start_date is not null and end_date is not null and end_date >= start_date)
    or (mode = 'collection' and start_date is null and end_date is null)
  );

alter table public.tg_travel_items
  add column if not exists status text,
  add column if not exists rating numeric(2,1),
  add column if not exists completed_date date,
  add column if not exists experience_note text,
  add column if not exists consumed_items text;

alter table public.tg_travel_items
  add constraint tg_travel_items_status_check check (status is null or status in ('planned', 'completed')),
  add constraint tg_travel_items_rating_check check (
    rating is null or (rating >= 0 and rating <= 5 and rating * 2 = trunc(rating * 2))
  );

-- Collection items always have a status; ordinary Trip items retain NULL.
create or replace function public.tg_validate_collection_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
begin
  select mode into v_mode from public.tg_trips where id = new.trip_id;
  if v_mode = 'collection' then
    if new.status is null then
      raise exception 'Collection items require a status';
    end if;
    if new.date is not null then
      raise exception 'Collection items cannot have an itinerary date';
    end if;
  elsif new.status is not null then
    raise exception 'Trip items cannot have a collection status';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_travel_items_validate_collection on public.tg_travel_items;
create trigger tg_travel_items_validate_collection
  before insert or update of trip_id, date, status on public.tg_travel_items
  for each row execute function public.tg_validate_collection_item();

revoke all on function public.tg_validate_collection_item() from public;

-- Preserve the current duplicate RPC contract while copying the new mode and
-- collection metadata. Flights/hotels/transportation remain empty in a
-- collection by design, while existing Trips continue to copy all details.
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
  if v_user_id is null or not public.tg_can_edit_trip(p_trip_id) then
    raise exception 'Trip edit permission is required';
  end if;

  insert into public.tg_trips (id, owner_id, name, mode, start_date, end_date, is_public)
  select v_new_trip_id, v_user_id, name || ' - 複製', mode, start_date, end_date, is_public
  from public.tg_trips where id = p_trip_id;

  if not found then raise exception 'Trip not found'; end if;

  insert into public.tg_travel_items (
    id, trip_id, created_by, type, category, area, date, name, google_maps_url,
    extra_link_1, extra_link_2, business_hours, note, status, rating,
    completed_date, experience_note, consumed_items, sort_order, image_path,
    image_fit, duplicate_source_item_id
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, type, category, area, date, name,
    google_maps_url, extra_link_1, extra_link_2, business_hours, note, status, rating,
    completed_date, experience_note, consumed_items, sort_order, null, image_fit, id
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

commit;
