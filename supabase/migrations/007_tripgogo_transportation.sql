-- ============================================================
-- TRIP GOGO — transportation details for Trip outlines
-- Requires 004_tripgogo_schema_rls.sql through
--          006_tripgogo_trip_visibility.sql.
-- Only creates or changes tg_* objects.
-- ============================================================

begin;

create table if not exists public.tg_transportations (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.tg_trips(id) on delete cascade,
  created_by          uuid references auth.users(id) on delete set null,
  type                text not null,
  company             text,
  vehicle_model       text,
  route_name          text,
  start_date          date not null,
  start_time          time not null,
  end_date            date not null,
  end_time            time not null,
  departure_place     text not null,
  arrival_place       text not null,
  train_number        text,
  seat                text,
  carriage            text,
  ticket              text,
  reservation_number  text,
  cost                text,
  address             text,
  link                text,
  google_maps_url     text,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tg_transportations_type_check check (type in ('rental_car', 'rail')),
  constraint tg_transportations_places_check check (btrim(departure_place) <> '' and btrim(arrival_place) <> ''),
  constraint tg_transportations_time_range_check check ((end_date + end_time) >= (start_date + start_time)),
  constraint tg_transportations_required_fields_check check (
    (type = 'rental_car' and btrim(coalesce(company, '')) <> '' and btrim(coalesce(vehicle_model, '')) <> '')
    or (type = 'rail' and btrim(coalesce(route_name, '')) <> '')
  )
);

create index if not exists tg_transportations_trip_start_idx
  on public.tg_transportations (trip_id, start_date, start_time, created_at);

drop trigger if exists tg_transportations_set_updated_at on public.tg_transportations;
create trigger tg_transportations_set_updated_at before update on public.tg_transportations
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_transportations_enforce_creator on public.tg_transportations;
create trigger tg_transportations_enforce_creator before insert or update on public.tg_transportations
  for each row execute function public.tg_enforce_child_creator();

alter table public.tg_transportations enable row level security;

create policy "tg_transportations_visibility_read" on public.tg_transportations
  for select to anon, authenticated
  using (public.tg_can_read_trip(trip_id));

create policy "tg_transportations_members_create" on public.tg_transportations
  for insert to authenticated
  with check (public.tg_is_trip_member(trip_id) and created_by = auth.uid());

create policy "tg_transportations_members_update" on public.tg_transportations
  for update to authenticated
  using (public.tg_is_trip_member(trip_id))
  with check (public.tg_is_trip_member(trip_id));

create policy "tg_transportations_members_delete" on public.tg_transportations
  for delete to authenticated
  using (public.tg_is_trip_member(trip_id));

grant select on public.tg_transportations to anon, authenticated;
grant select, insert, update, delete on public.tg_transportations to authenticated;

-- Keep Trip duplication complete after transportation is introduced.
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
  if v_user_id is null or not public.tg_is_trip_member(p_trip_id) then
    raise exception 'Trip edit permission is required';
  end if;

  insert into public.tg_trips (id, owner_id, name, start_date, end_date, is_public)
  select v_new_trip_id, v_user_id, name || ' - 複製', start_date, end_date, is_public
  from public.tg_trips where id = p_trip_id;

  if not found then raise exception 'Trip not found'; end if;

  insert into public.tg_travel_items (
    id, trip_id, created_by, type, category, area, date, name, google_maps_url,
    extra_link_1, extra_link_2, business_hours, note, sort_order
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, type, category, area, date, name,
    google_maps_url, extra_link_1, extra_link_2, business_hours, note, sort_order
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

  return v_new_trip_id;
end;
$$;

revoke all on function public.tg_duplicate_trip(uuid) from public;
grant execute on function public.tg_duplicate_trip(uuid) to authenticated;

commit;
