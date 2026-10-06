-- ============================================================
-- TRIP GOGO — collection rating scale to 100
-- Requires 015_tripgogo_collection_mode.sql.
-- Existing 0–5 ratings are converted proportionally (for example 4.5 → 90)
-- before replacing the former half-point validation.
-- ============================================================

begin;

alter table public.tg_travel_items
  drop constraint if exists tg_travel_items_rating_check;

alter table public.tg_travel_items
  alter column rating type numeric(5,2) using rating::numeric(5,2);

update public.tg_travel_items
set rating = rating * 20
where rating is not null;

alter table public.tg_travel_items
  add constraint tg_travel_items_rating_check check (
    rating is null or (rating >= 0 and rating <= 100)
  );

commit;
