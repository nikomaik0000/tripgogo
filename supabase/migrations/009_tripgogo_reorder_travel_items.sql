-- Restore the atomic TravelItem reorder RPC without replacing later RPC definitions.

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
  if auth.uid() is null or not public.tg_is_trip_member(p_trip_id) then
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

revoke all on function public.tg_reorder_travel_items(uuid, date, uuid[]) from public;
grant execute on function public.tg_reorder_travel_items(uuid, date, uuid[]) to authenticated;
