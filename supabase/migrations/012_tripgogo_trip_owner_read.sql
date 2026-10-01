-- ============================================================
-- TRAVEL GOGO — Trip owner read access during INSERT RETURNING
-- Requires 004_tripgogo_schema_rls.sql and
--          006_tripgogo_trip_visibility.sql.
--
-- Supabase createTrip uses INSERT ... RETURNING. PostgreSQL checks
-- SELECT policies for the proposed row before the owner-membership
-- AFTER INSERT trigger can make the new Trip visible via membership.
-- This policy lets an authenticated owner read their own proposed row
-- without changing INSERT or anonymous access.
-- ============================================================

begin;

drop policy if exists "tg_trips_owner_read" on public.tg_trips;
create policy "tg_trips_owner_read" on public.tg_trips
  for select to authenticated
  using (owner_id = auth.uid());

commit;
