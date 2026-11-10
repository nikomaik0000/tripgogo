-- Run against a disposable local Supabase database after all migrations.
-- Every fixture and assertion is rolled back at the end.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'migration-027@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.tg_trips (id, owner_id, name, mode, start_date, end_date)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'RPC test', 'trip', '2030-01-01', '2030-01-10'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Other Trip', 'trip', '2030-01-01', '2030-01-10');

insert into public.tg_travel_items (id, trip_id, type, date, name, sort_order, created_at)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-01', 'A', 0, '2030-01-01 00:00:01+00'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-01', 'B', 1, '2030-01-01 00:00:02+00'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-01', 'C', 2, '2030-01-01 00:00:03+00'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-02', 'D', 0, '2030-01-01 00:00:04+00'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-02', 'E', 1, '2030-01-01 00:00:05+00'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-03', 'F', 0, '2030-01-01 00:00:06+00'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-05', 'X', 0, '2030-01-01 00:00:07+00'),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-05', 'Y', 1, '2030-01-01 00:00:08+00'),
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-06', 'Z', 0, '2030-01-01 00:00:09+00'),
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'place', '2030-01-06', 'Other Trip item', 0, '2030-01-01 00:00:10+00');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';

-- Inserts B at target index 1 and preserves A/C and D/E relative ordering.
select public.tg_move_travel_item_between_dates(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '2030-01-01', '2030-01-02',
  '30000000-0000-0000-0000-000000000001,30000000-0000-0000-0000-000000000002,30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000004,30000000-0000-0000-0000-000000000005',
  array['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003']::uuid[],
  array['30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000005']::uuid[]
);

select pg_temp.assert_true(
  (select array_agg(id order by sort_order) from public.tg_travel_items where trip_id = '20000000-0000-0000-0000-000000000001' and date = '2030-01-01')
    = array['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003']::uuid[],
  'source order should be normalized after a positioned insert'
);
select pg_temp.assert_true(
  (select array_agg(id order by sort_order) from public.tg_travel_items where trip_id = '20000000-0000-0000-0000-000000000001' and date = '2030-01-02')
    = array['30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000005']::uuid[],
  'target order should insert the moved item at the requested position'
);

-- Moves the only source item into an empty target date.
select public.tg_move_travel_item_between_dates(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000006',
  '2030-01-03', '2030-01-04',
  '30000000-0000-0000-0000-000000000006', '',
  array[]::uuid[], array['30000000-0000-0000-0000-000000000006']::uuid[]
);
select pg_temp.assert_true(
  not exists (select 1 from public.tg_travel_items where trip_id = '20000000-0000-0000-0000-000000000001' and date = '2030-01-03'),
  'source date should be empty after moving its final item'
);
select pg_temp.assert_true(
  (select sort_order = 0 and date = '2030-01-04' from public.tg_travel_items where id = '30000000-0000-0000-0000-000000000006'),
  'empty target should receive the item at order zero'
);

-- Invalid desired lists must fail and leave both groups unchanged.
do $$
begin
  begin
    perform public.tg_move_travel_item_between_dates(
      '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007',
      '2030-01-05', '2030-01-06',
      '30000000-0000-0000-0000-000000000007,30000000-0000-0000-0000-000000000008',
      '30000000-0000-0000-0000-000000000009',
      array['30000000-0000-0000-0000-000000000008']::uuid[],
      array['30000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000007']::uuid[]
    );
    raise exception 'duplicate-ID call unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Ordered item IDs must be unique' then raise; end if;
  end;
  perform pg_temp.assert_true(
    (select date = '2030-01-05' and sort_order = 0 from public.tg_travel_items where id = '30000000-0000-0000-0000-000000000007'),
    'duplicate-ID failure must roll back the moved item'
  );
  perform pg_temp.assert_true(
    (select array_agg(id order by sort_order) from public.tg_travel_items where trip_id = '20000000-0000-0000-0000-000000000001' and date = '2030-01-06')
      = array['30000000-0000-0000-0000-000000000009']::uuid[],
    'duplicate-ID failure must roll back the complete target group'
  );
end;
$$;

do $$
begin
  begin
    perform public.tg_move_travel_item_between_dates(
      '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007',
      '2030-01-05', '2030-01-06',
      '30000000-0000-0000-0000-000000000007,30000000-0000-0000-0000-000000000008',
      '30000000-0000-0000-0000-000000000009',
      array['30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000008']::uuid[],
      array['30000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000007']::uuid[]
    );
    raise exception 'overlapping-list call unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Moved TravelItem must appear exactly once in the target date' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.tg_move_travel_item_between_dates(
      '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007',
      '2030-01-05', '2030-01-06',
      '30000000-0000-0000-0000-000000000007,30000000-0000-0000-0000-000000000008',
      '30000000-0000-0000-0000-000000000009',
      array[]::uuid[],
      array['30000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000007']::uuid[]
    );
    raise exception 'missing-ID call unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Source ordered IDs must preserve every remaining source item' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.tg_move_travel_item_between_dates(
      '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007',
      '2030-01-05', '2030-01-06',
      '30000000-0000-0000-0000-000000000007,30000000-0000-0000-0000-000000000008',
      '30000000-0000-0000-0000-000000000009',
      array['30000000-0000-0000-0000-000000000008']::uuid[],
      array['30000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000007']::uuid[]
    );
    raise exception 'cross-Trip call unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Target ordered IDs must insert the item without reordering other items' then raise; end if;
  end;
  perform pg_temp.assert_true(
    (select date = '2030-01-05' and sort_order = 0 from public.tg_travel_items where id = '30000000-0000-0000-0000-000000000007'),
    'cross-Trip failure must leave the source unchanged'
  );
end;
$$;

-- Simulates another window reordering the source after drag start. The stale
-- snapshot must be rejected instead of overwriting the newer order.
reset role;
update public.tg_travel_items set sort_order = case id
  when '30000000-0000-0000-0000-000000000007' then 1 else 0 end
where id in ('30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000008');
set local role authenticated;

do $$
begin
  begin
    perform public.tg_move_travel_item_between_dates(
      '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007',
      '2030-01-05', '2030-01-06',
      '30000000-0000-0000-0000-000000000007,30000000-0000-0000-0000-000000000008',
      '30000000-0000-0000-0000-000000000009',
      array['30000000-0000-0000-0000-000000000008']::uuid[],
      array['30000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000007']::uuid[]
    );
    raise exception 'stale-order call unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Itinerary order changed; reload before moving this item' then raise; end if;
  end;
  perform pg_temp.assert_true(
    (select array_agg(id order by sort_order) from public.tg_travel_items where trip_id = '20000000-0000-0000-0000-000000000001' and date = '2030-01-05')
      = array['30000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000007']::uuid[],
    'stale failure must preserve the newer source order'
  );
end;
$$;

-- Simulates a concurrent insert into the target after the caller captured its
-- snapshot. The extra item must make the operation stale and remain untouched.
reset role;
insert into public.tg_travel_items (id, trip_id, type, date, name, sort_order, created_at)
values ('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 'place', '2030-01-06', 'Concurrent', 1, '2030-01-01 00:00:10+00');
set local role authenticated;

do $$
begin
  begin
    perform public.tg_move_travel_item_between_dates(
      '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007',
      '2030-01-05', '2030-01-06',
      '30000000-0000-0000-0000-000000000008,30000000-0000-0000-0000-000000000007',
      '30000000-0000-0000-0000-000000000009',
      array['30000000-0000-0000-0000-000000000008']::uuid[],
      array['30000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000007']::uuid[]
    );
    raise exception 'concurrent-change call unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Itinerary order changed; reload before moving this item' then raise; end if;
  end;
  perform pg_temp.assert_true(
    (select date = '2030-01-06' and sort_order = 1 from public.tg_travel_items where id = '30000000-0000-0000-0000-000000000010'),
    'concurrent target item must survive a rejected stale move'
  );
end;
$$;

rollback;
