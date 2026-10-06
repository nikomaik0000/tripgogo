begin;

-- TRIP GOGO — outer Trip / Collection management permissions
-- Platform Admins create new top-level records. Existing owners and Platform
-- Admins manage metadata, duplicate, and delete; Editors retain content access.

drop policy if exists "tg_trips_authenticated_create" on public.tg_trips;
drop policy if exists "tg_trips_admin_create" on public.tg_trips;
create policy "tg_trips_admin_create" on public.tg_trips
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.tg_is_platform_admin()
  );

drop policy if exists "tg_trips_members_update" on public.tg_trips;
drop policy if exists "tg_trips_managers_update" on public.tg_trips;
create policy "tg_trips_managers_update" on public.tg_trips
  for update to authenticated
  using (public.tg_can_manage_trip(id))
  with check (public.tg_can_manage_trip(id));

-- Keep the Collection-aware duplicate contract introduced by migration 015,
-- but require owner-or-Platform-Admin management permission for the source.
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
