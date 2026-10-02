-- ============================================================
-- TRIP GOGO — TravelItem JPEG compression fallback
-- Requires 010_tripgogo_travel_item_images.sql.
--
-- Keep the bucket private and all existing Storage policies intact. This
-- migration only extends the processed-image MIME contract for browsers that
-- cannot encode Canvas output as WebP.
-- ============================================================

begin;

do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'tg-travel-item-images'
  ) then
    raise exception 'Storage bucket tg-travel-item-images does not exist';
  end if;
end;
$$;

update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg']
where id = 'tg-travel-item-images';

commit;
