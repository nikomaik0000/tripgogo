-- ============================================================
-- TRIP GOGO — optional TravelItem images
-- Requires 004_tripgogo_schema_rls.sql through
--          009_tripgogo_reorder_travel_items.sql.
-- ============================================================

begin;

alter table public.tg_travel_items
  add column if not exists image_path text,
  add column if not exists image_fit text not null default 'cover',
  add column if not exists duplicate_source_item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tg_travel_items_image_path_check'
  ) then
    alter table public.tg_travel_items
      add constraint tg_travel_items_image_path_check check (
        image_path is null
        or (
          btrim(image_path) <> ''
          and image_path like trip_id::text || '/%'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tg_travel_items_image_fit_check'
  ) then
    alter table public.tg_travel_items
      add constraint tg_travel_items_image_fit_check check (image_fit in ('cover', 'contain'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tg_travel_items_duplicate_source_check'
  ) then
    alter table public.tg_travel_items
      add constraint tg_travel_items_duplicate_source_check check (
        duplicate_source_item_id is null or duplicate_source_item_id <> id
      );
  end if;
end;
$$;

create unique index if not exists tg_travel_items_image_path_unique_idx
  on public.tg_travel_items (image_path)
  where image_path is not null;

create unique index if not exists tg_travel_items_duplicate_source_unique_idx
  on public.tg_travel_items (trip_id, duplicate_source_item_id)
  where duplicate_source_item_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tg-travel-item-images',
  'tg-travel-item-images',
  false,
  2097152,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tg_travel_item_images_visibility_read" on storage.objects;
create policy "tg_travel_item_images_visibility_read" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'tg-travel-item-images'
    and exists (
      select 1
      from public.tg_travel_items item
      where item.image_path = name
        and public.tg_can_read_trip(item.trip_id)
    )
  );

-- Storage remove requires both SELECT and DELETE. This member-scoped SELECT
-- also lets an uploader clean a newly-created orphan before it has a DB
-- reference, while the public/read-only policy above still requires one.
drop policy if exists "tg_travel_item_images_members_read_trip_folder" on storage.objects;
create policy "tg_travel_item_images_members_read_trip_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tg-travel-item-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "tg_travel_item_images_members_create" on storage.objects;
create policy "tg_travel_item_images_members_create" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tg-travel-item-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "tg_travel_item_images_members_delete_unreferenced" on storage.objects;
create policy "tg_travel_item_images_members_delete_unreferenced" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tg-travel-item-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_is_trip_member(((storage.foldername(name))[1])::uuid)
    and not exists (
      select 1 from public.tg_travel_items item where item.image_path = name
    )
  );

-- Keep the existing UUID return contract. The private lineage column gives
-- the client a reliable source/destination item mapping while each copied
-- image receives an independent Storage path after this transaction commits.
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
    extra_link_1, extra_link_2, business_hours, note, sort_order, image_path,
    image_fit, duplicate_source_item_id
  ) select gen_random_uuid(), v_new_trip_id, v_user_id, type, category, area, date, name,
    google_maps_url, extra_link_1, extra_link_2, business_hours, note, sort_order,
    null, image_fit, id
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
