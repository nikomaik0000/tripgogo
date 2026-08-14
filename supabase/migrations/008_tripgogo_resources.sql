-- ============================================================
-- TRIP GOGO — Trip resources and private resource images
-- Requires 004_tripgogo_schema_rls.sql through
--          007_tripgogo_transportation.sql.
-- ============================================================

begin;

create table if not exists public.tg_trip_resources (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.tg_trips(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  category    text not null,
  title       text not null,
  note        text,
  external_url text,
  image_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tg_trip_resources_category_check check (category in ('transportation', 'coupon', 'note')),
  constraint tg_trip_resources_title_check check (btrim(title) <> ''),
  constraint tg_trip_resources_external_url_check check (external_url is null or btrim(external_url) <> ''),
  constraint tg_trip_resources_image_path_check check (image_path is null or btrim(image_path) <> '')
);

create index if not exists tg_trip_resources_trip_created_idx
  on public.tg_trip_resources (trip_id, created_at desc);
create index if not exists tg_trip_resources_image_path_idx
  on public.tg_trip_resources (image_path) where image_path is not null;

drop trigger if exists tg_trip_resources_set_updated_at on public.tg_trip_resources;
create trigger tg_trip_resources_set_updated_at before update on public.tg_trip_resources
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_trip_resources_enforce_creator on public.tg_trip_resources;
create trigger tg_trip_resources_enforce_creator before insert or update on public.tg_trip_resources
  for each row execute function public.tg_enforce_child_creator();

alter table public.tg_trip_resources enable row level security;

create policy "tg_trip_resources_visibility_read" on public.tg_trip_resources
  for select to anon, authenticated
  using (public.tg_can_read_trip(trip_id));

create policy "tg_trip_resources_members_create" on public.tg_trip_resources
  for insert to authenticated
  with check (public.tg_is_trip_member(trip_id) and created_by = auth.uid());

create policy "tg_trip_resources_members_update" on public.tg_trip_resources
  for update to authenticated
  using (public.tg_is_trip_member(trip_id))
  with check (public.tg_is_trip_member(trip_id));

create policy "tg_trip_resources_members_delete" on public.tg_trip_resources
  for delete to authenticated
  using (public.tg_is_trip_member(trip_id));

grant select on public.tg_trip_resources to anon, authenticated;
grant select, insert, update, delete on public.tg_trip_resources to authenticated;

-- Images stay private. SELECT is granted only while at least one readable
-- Resource references the object. Objects are immutable and intentionally
-- have no UPDATE/DELETE policy in Phase 1 because duplicated Resources may
-- share the same image.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tg-trip-resources',
  'tg-trip-resources',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "tg_resource_images_visibility_read" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'tg-trip-resources'
    and exists (
      select 1
      from public.tg_trip_resources resource
      where resource.image_path = name
        and public.tg_can_read_trip(resource.trip_id)
    )
  );

create policy "tg_resource_images_members_create" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tg-trip-resources'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_is_trip_member(((storage.foldername(name))[1])::uuid)
  );

-- Keep Trip duplication complete. Resource image_path is deliberately shared;
-- immutable objects and reference-aware SELECT prevent one copy from breaking
-- another, while physical image duplication remains a future cleanup design.
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
