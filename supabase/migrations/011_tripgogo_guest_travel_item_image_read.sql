-- ============================================================
-- TRIP GOGO — visibility-aware TravelItem image reads
-- Requires 006_tripgogo_trip_visibility.sql and
--          010_tripgogo_travel_item_images.sql.
--
-- Keep the bucket private. This helper only authorizes a read when
-- the object is referenced by a TravelItem whose Trip is readable by
-- the current visitor. Upload and deletion policies are unchanged.
-- ============================================================

begin;

create or replace function public.tg_can_read_travel_item_image(p_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_path is not null
    and exists (
      select 1
      from public.tg_travel_items item
      where item.image_path = p_path
        and public.tg_can_read_trip(item.trip_id)
    );
$$;

revoke all on function public.tg_can_read_travel_item_image(text) from public;
grant execute on function public.tg_can_read_travel_item_image(text) to anon, authenticated;

drop policy if exists "tg_travel_item_images_visibility_read" on storage.objects;
create policy "tg_travel_item_images_visibility_read" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'tg-travel-item-images'
    and public.tg_can_read_travel_item_image(name)
  );

commit;
