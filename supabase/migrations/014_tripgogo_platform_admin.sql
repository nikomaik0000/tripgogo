-- ============================================================
-- TRIP GOGO — Platform Admin authorization
-- Requires 004_tripgogo_schema_rls.sql through
--          013_tripgogo_travel_item_image_jpeg_fallback.sql.
--
-- Platform Admin is an authorization capability, not Trip ownership or
-- membership. tg_is_trip_owner() and tg_is_trip_member() intentionally keep
-- their original identity semantics.
-- ============================================================

begin;

alter table public.tg_profiles
  add column if not exists platform_role text not null default 'user';

update public.tg_profiles set platform_role = 'user' where platform_role is null;
alter table public.tg_profiles alter column platform_role set default 'user';
alter table public.tg_profiles alter column platform_role set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tg_profiles_platform_role_check'
  ) then
    alter table public.tg_profiles
      add constraint tg_profiles_platform_role_check
      check (platform_role in ('user', 'admin'));
  end if;
end;
$$;

-- Browser clients may update their own ordinary profile fields, but role
-- assignment stays restricted to SQL Editor or another trusted server-side
-- administrative path.
revoke update on public.tg_profiles from authenticated;
grant update (email, display_name) on public.tg_profiles to authenticated;

create or replace function public.tg_protect_platform_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.platform_role is distinct from old.platform_role
     and auth.uid() is not null then
    raise exception 'Platform role can only be changed through a trusted administrative path';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_profiles_protect_platform_role on public.tg_profiles;
create trigger tg_profiles_protect_platform_role
  before update of platform_role on public.tg_profiles
  for each row execute function public.tg_protect_platform_role();

revoke all on function public.tg_protect_platform_role() from public;

-- ------------------------------------------------------------
-- Authorization helpers
-- ------------------------------------------------------------

create or replace function public.tg_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.tg_profiles profile
      where profile.id = auth.uid()
        and profile.platform_role = 'admin'
    );
$$;

create or replace function public.tg_can_edit_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and (
      public.tg_is_platform_admin()
      or exists (
        select 1
        from public.tg_trip_members member
        where member.trip_id = p_trip_id
          and member.user_id = auth.uid()
      )
    );
$$;

create or replace function public.tg_can_manage_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and (
      public.tg_is_platform_admin()
      or exists (
        select 1
        from public.tg_trips trip
        where trip.id = p_trip_id
          and trip.owner_id = auth.uid()
      )
    );
$$;

create or replace function public.tg_can_read_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.tg_trips trip
    where trip.id = p_trip_id
      and (
        trip.is_public = true
        or public.tg_is_platform_admin()
        or exists (
          select 1
          from public.tg_trip_members member
          where member.trip_id = trip.id
            and member.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.tg_is_platform_admin() from public;
revoke all on function public.tg_can_edit_trip(uuid) from public;
revoke all on function public.tg_can_manage_trip(uuid) from public;
revoke all on function public.tg_can_read_trip(uuid) from public;
grant execute on function public.tg_is_platform_admin() to authenticated;
grant execute on function public.tg_can_edit_trip(uuid) to authenticated;
grant execute on function public.tg_can_manage_trip(uuid) to authenticated;
grant execute on function public.tg_can_read_trip(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Profile, Trip, membership, and invitation policies
-- ------------------------------------------------------------

drop policy if exists "tg_profiles_authenticated_read" on public.tg_profiles;
create policy "tg_profiles_authenticated_read" on public.tg_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.tg_is_platform_admin()
    or exists (
      select 1
      from public.tg_trip_members member
      where member.user_id = tg_profiles.id
        and public.tg_is_trip_owner(member.trip_id)
    )
  );

drop policy if exists "tg_trips_members_update" on public.tg_trips;
create policy "tg_trips_members_update" on public.tg_trips
  for update to authenticated
  using (public.tg_can_edit_trip(id))
  with check (public.tg_can_edit_trip(id));

drop policy if exists "tg_trips_owner_delete" on public.tg_trips;
create policy "tg_trips_owner_delete" on public.tg_trips
  for delete to authenticated
  using (public.tg_can_manage_trip(id));

drop policy if exists "tg_trip_members_read_self_or_owner" on public.tg_trip_members;
create policy "tg_trip_members_read_self_or_owner" on public.tg_trip_members
  for select to authenticated
  using (user_id = auth.uid() or public.tg_can_manage_trip(trip_id));

drop policy if exists "tg_trip_invitations_read_owner_or_invitee" on public.tg_trip_invitations;
create policy "tg_trip_invitations_read_owner_or_invitee" on public.tg_trip_invitations
  for select to authenticated
  using (
    public.tg_can_manage_trip(trip_id)
    or email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  );

-- ------------------------------------------------------------
-- Trip content write policies
-- ------------------------------------------------------------

drop policy if exists "tg_travel_items_members_create" on public.tg_travel_items;
create policy "tg_travel_items_members_create" on public.tg_travel_items
  for insert to authenticated
  with check (public.tg_can_edit_trip(trip_id) and created_by = auth.uid());

drop policy if exists "tg_travel_items_members_update" on public.tg_travel_items;
create policy "tg_travel_items_members_update" on public.tg_travel_items
  for update to authenticated
  using (public.tg_can_edit_trip(trip_id))
  with check (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_travel_items_members_delete" on public.tg_travel_items;
create policy "tg_travel_items_members_delete" on public.tg_travel_items
  for delete to authenticated using (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_flights_members_create" on public.tg_flights;
create policy "tg_flights_members_create" on public.tg_flights
  for insert to authenticated
  with check (public.tg_can_edit_trip(trip_id) and created_by = auth.uid());

drop policy if exists "tg_flights_members_update" on public.tg_flights;
create policy "tg_flights_members_update" on public.tg_flights
  for update to authenticated
  using (public.tg_can_edit_trip(trip_id))
  with check (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_flights_members_delete" on public.tg_flights;
create policy "tg_flights_members_delete" on public.tg_flights
  for delete to authenticated using (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_hotel_stays_members_create" on public.tg_hotel_stays;
create policy "tg_hotel_stays_members_create" on public.tg_hotel_stays
  for insert to authenticated
  with check (public.tg_can_edit_trip(trip_id) and created_by = auth.uid());

drop policy if exists "tg_hotel_stays_members_update" on public.tg_hotel_stays;
create policy "tg_hotel_stays_members_update" on public.tg_hotel_stays
  for update to authenticated
  using (public.tg_can_edit_trip(trip_id))
  with check (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_hotel_stays_members_delete" on public.tg_hotel_stays;
create policy "tg_hotel_stays_members_delete" on public.tg_hotel_stays
  for delete to authenticated using (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_transportations_members_create" on public.tg_transportations;
create policy "tg_transportations_members_create" on public.tg_transportations
  for insert to authenticated
  with check (public.tg_can_edit_trip(trip_id) and created_by = auth.uid());

drop policy if exists "tg_transportations_members_update" on public.tg_transportations;
create policy "tg_transportations_members_update" on public.tg_transportations
  for update to authenticated
  using (public.tg_can_edit_trip(trip_id))
  with check (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_transportations_members_delete" on public.tg_transportations;
create policy "tg_transportations_members_delete" on public.tg_transportations
  for delete to authenticated using (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_trip_resources_members_create" on public.tg_trip_resources;
create policy "tg_trip_resources_members_create" on public.tg_trip_resources
  for insert to authenticated
  with check (public.tg_can_edit_trip(trip_id) and created_by = auth.uid());

drop policy if exists "tg_trip_resources_members_update" on public.tg_trip_resources;
create policy "tg_trip_resources_members_update" on public.tg_trip_resources
  for update to authenticated
  using (public.tg_can_edit_trip(trip_id))
  with check (public.tg_can_edit_trip(trip_id));

drop policy if exists "tg_trip_resources_members_delete" on public.tg_trip_resources;
create policy "tg_trip_resources_members_delete" on public.tg_trip_resources
  for delete to authenticated using (public.tg_can_edit_trip(trip_id));

-- ------------------------------------------------------------
-- Private Storage mutation policies
-- ------------------------------------------------------------

drop policy if exists "tg_resource_images_members_create" on storage.objects;
create policy "tg_resource_images_members_create" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tg-trip-resources'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_can_edit_trip(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "tg_travel_item_images_members_read_trip_folder" on storage.objects;
create policy "tg_travel_item_images_members_read_trip_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tg-travel-item-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_can_edit_trip(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "tg_travel_item_images_members_create" on storage.objects;
create policy "tg_travel_item_images_members_create" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tg-travel-item-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_can_edit_trip(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "tg_travel_item_images_members_delete_unreferenced" on storage.objects;
create policy "tg_travel_item_images_members_delete_unreferenced" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tg-travel-item-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.tg_can_edit_trip(((storage.foldername(name))[1])::uuid)
    and not exists (
      select 1 from public.tg_travel_items item where item.image_path = name
    )
  );

-- ------------------------------------------------------------
-- Owner-or-Admin management functions
-- ------------------------------------------------------------

create or replace function public.tg_enforce_visibility_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.is_public is distinct from old.is_public
     and not public.tg_can_manage_trip(old.id) then
    raise exception 'Only the Trip owner or a Platform Admin can change visibility';
  end if;
  return new;
end;
$$;

create or replace function public.tg_set_trip_visibility(
  p_trip_id uuid,
  p_is_public boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.tg_can_manage_trip(p_trip_id) then
    raise exception 'Only the Trip owner or a Platform Admin can change visibility';
  end if;
  if p_is_public is null then
    raise exception 'Trip visibility is required';
  end if;

  update public.tg_trips
  set is_public = p_is_public
  where id = p_trip_id;

  if not found then
    raise exception 'Trip not found';
  end if;
end;
$$;

create or replace function public.tg_invite_trip_member(
  p_trip_id uuid,
  p_email text,
  p_expires_at timestamptz default null
)
returns public.tg_trip_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_invitation public.tg_trip_invitations;
begin
  if auth.uid() is null or not public.tg_can_manage_trip(p_trip_id) then
    raise exception 'Only the Trip owner or a Platform Admin can create invitations';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'A valid email address is required';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future';
  end if;
  if exists (
    select 1
    from public.tg_trip_members member
    join public.tg_profiles profile on profile.id = member.user_id
    where member.trip_id = p_trip_id and profile.email = v_email
  ) then
    raise exception 'This account is already a Trip member';
  end if;

  insert into public.tg_trip_invitations (trip_id, email, role, invited_by, expires_at)
  values (p_trip_id, v_email, 'editor', auth.uid(), p_expires_at)
  on conflict (trip_id, (lower(email))) where accepted_at is null
  do update set invited_by = excluded.invited_by,
                expires_at = excluded.expires_at,
                created_at = now()
  returning * into v_invitation;

  return v_invitation;
end;
$$;

create or replace function public.tg_revoke_trip_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id
  from public.tg_trip_invitations
  where id = p_invitation_id and accepted_at is null;
  if v_trip_id is null or not public.tg_can_manage_trip(v_trip_id) then
    raise exception 'Only the Trip owner or a Platform Admin can revoke this invitation';
  end if;
  delete from public.tg_trip_invitations where id = p_invitation_id;
end;
$$;

create or replace function public.tg_remove_trip_editor(p_trip_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.tg_can_manage_trip(p_trip_id) then
    raise exception 'Only the Trip owner or a Platform Admin can remove editors';
  end if;
  delete from public.tg_trip_members
  where trip_id = p_trip_id and user_id = p_user_id and role = 'editor';
end;
$$;

-- ------------------------------------------------------------
-- Member-or-Admin edit functions
-- ------------------------------------------------------------

create or replace function public.tg_reorder_travel_items(
  p_trip_id uuid,
  p_date date,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_count integer;
begin
  if auth.uid() is null or not public.tg_can_edit_trip(p_trip_id) then
    raise exception 'Trip edit permission is required';
  end if;
  if p_date is null or p_ordered_ids is null then
    raise exception 'A scheduled date and complete ordered ID list are required';
  end if;
  if cardinality(p_ordered_ids) <> (
    select count(distinct ids.id) from unnest(p_ordered_ids) as ids(id)
  ) then
    raise exception 'Ordered item IDs must be unique';
  end if;

  perform 1
  from public.tg_travel_items
  where trip_id = p_trip_id and date = p_date
  for update;

  select count(*) into v_expected_count
  from public.tg_travel_items
  where trip_id = p_trip_id and date = p_date;

  if v_expected_count <> cardinality(p_ordered_ids)
     or exists (
       select 1 from unnest(p_ordered_ids) as ids(id)
       where not exists (
         select 1 from public.tg_travel_items item
         where item.id = ids.id and item.trip_id = p_trip_id and item.date = p_date
       )
     ) then
    raise exception 'Ordered item IDs must exactly match the Trip date group';
  end if;

  update public.tg_travel_items item
  set sort_order = (ordered.position - 1)::integer
  from unnest(p_ordered_ids) with ordinality ordered(id, position)
  where item.id = ordered.id;
end;
$$;

-- Preserve the existing duplicate contract and behavior: owner and editor
-- memberships remain authorized exactly as before; Platform Admin is the only
-- additional authorization path. The copier owns the newly-created Trip.
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

revoke all on function public.tg_enforce_visibility_owner() from public;
revoke all on function public.tg_set_trip_visibility(uuid, boolean) from public;
revoke all on function public.tg_invite_trip_member(uuid, text, timestamptz) from public;
revoke all on function public.tg_revoke_trip_invitation(uuid) from public;
revoke all on function public.tg_remove_trip_editor(uuid, uuid) from public;
revoke all on function public.tg_reorder_travel_items(uuid, date, uuid[]) from public;
revoke all on function public.tg_duplicate_trip(uuid) from public;
grant execute on function public.tg_set_trip_visibility(uuid, boolean) to authenticated;
grant execute on function public.tg_invite_trip_member(uuid, text, timestamptz) to authenticated;
grant execute on function public.tg_revoke_trip_invitation(uuid) to authenticated;
grant execute on function public.tg_remove_trip_editor(uuid, uuid) to authenticated;
grant execute on function public.tg_reorder_travel_items(uuid, date, uuid[]) to authenticated;
grant execute on function public.tg_duplicate_trip(uuid) to authenticated;

commit;
