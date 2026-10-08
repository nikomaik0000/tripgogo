begin;

-- Keep recipient matching and pending-state rules on the database boundary.
-- Existing members must not continue to see stale invitations for a Trip or Collection.
create or replace function public.tg_get_my_pending_trip_invitations()
returns table (
  invitation_id uuid,
  trip_id uuid,
  trip_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    invitation.id as invitation_id,
    invitation.trip_id,
    trip.name as trip_name,
    invitation.created_at,
    invitation.expires_at
  from public.tg_trip_invitations invitation
  join public.tg_trips trip on trip.id = invitation.trip_id
  where auth.uid() is not null
    and lower(btrim(invitation.email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    and invitation.accepted_at is null
    and (invitation.expires_at is null or invitation.expires_at > now())
    and not exists (
      select 1
      from public.tg_trip_members member
      where member.trip_id = invitation.trip_id
        and member.user_id = auth.uid()
    )
  order by invitation.created_at;
$$;

create or replace function public.tg_reject_trip_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_invitation public.tg_trip_invitations;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Authentication with a verified email is required';
  end if;

  select * into v_invitation
  from public.tg_trip_invitations
  where id = p_invitation_id
  for update;

  if not found or v_invitation.accepted_at is not null then
    raise exception 'Invitation is unavailable';
  end if;
  if v_invitation.expires_at is not null and v_invitation.expires_at <= now() then
    raise exception 'Invitation has expired';
  end if;
  if lower(btrim(v_invitation.email)) <> v_email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  delete from public.tg_trip_invitations
  where id = p_invitation_id;

  return v_invitation.trip_id;
end;
$$;

revoke all on function public.tg_get_my_pending_trip_invitations() from public;
revoke all on function public.tg_reject_trip_invitation(uuid) from public;
grant execute on function public.tg_get_my_pending_trip_invitations() to authenticated;
grant execute on function public.tg_reject_trip_invitation(uuid) to authenticated;

commit;
