import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { TgFlightRow, TgHotelStayRow, TgProfileRow, TgTravelItemRow, TgTripInvitationRow, TgTripMemberRow, TgTripRow } from "@/lib/database.types";
import { mapFlight, mapHotelStay, mapItem, mapTrip } from "@/lib/travel-mappers";
import type { Flight, HotelStay, TravelItem, Trip, TripEditor, TripInvitation, TripRole } from "@/lib/types";

function result<T>(data: T | null, error: PostgrestError | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase did not return the requested data");
  return data;
}

export const travelRepository = {
  async getTrips() {
    const { data, error } = await createClient().from("tg_trips").select("*").order("start_date");
    return result(data, error).map((row: unknown) => mapTrip(row as TgTripRow));
  },

  async getTrip(tripId: string) {
    const { data, error } = await createClient().from("tg_trips").select("*").eq("id", tripId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapTrip(data as TgTripRow) : undefined;
  },

  async getTripRole(tripId: string): Promise<TripRole | undefined> {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return undefined;
    const { data, error } = await supabase.from("tg_trip_members").select("role").eq("trip_id", tripId).eq("user_id", authData.user.id).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.role as TripRole | undefined;
  },

  async getTripRoles() {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return new Map<string, TripRole>();
    const { data, error } = await supabase.from("tg_trip_members").select("trip_id, role").eq("user_id", authData.user.id);
    return new Map<string, TripRole>(result(data, error).map((row: { trip_id: string; role: string }) => [row.trip_id, row.role as TripRole]));
  },

  async getTripEditors(tripId: string): Promise<TripEditor[]> {
    const supabase = createClient();
    const { data: memberData, error: memberError } = await supabase.from("tg_trip_members")
      .select("user_id, created_at").eq("trip_id", tripId).eq("role", "editor").order("created_at");
    const members = result(memberData, memberError) as Pick<TgTripMemberRow, "user_id" | "created_at">[];
    if (members.length === 0) return [];
    const { data: profileData, error: profileError } = await supabase.from("tg_profiles")
      .select("id, email, display_name").in("id", members.map((member) => member.user_id));
    const profiles = new Map((result(profileData, profileError) as Pick<TgProfileRow, "id" | "email" | "display_name">[])
      .map((profile) => [profile.id, profile]));
    return members.flatMap((member) => {
      const profile = profiles.get(member.user_id);
      return profile ? [{ userId: member.user_id, email: profile.email, displayName: profile.display_name ?? undefined, createdAt: member.created_at }] : [];
    });
  },

  async getTripPendingInvitations(tripId: string): Promise<TripInvitation[]> {
    const { data, error } = await createClient().from("tg_trip_invitations").select("*")
      .eq("trip_id", tripId).is("accepted_at", null).order("created_at");
    return (result(data, error) as TgTripInvitationRow[]).map(mapInvitation);
  },

  async getMyPendingInvitations(): Promise<TripInvitation[]> {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);
    const email = authData.user?.email?.trim().toLowerCase();
    if (!email) return [];
    const { data, error } = await supabase.from("tg_trip_invitations").select("*")
      .eq("email", email).is("accepted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at");
    const invitations = (result(data, error) as TgTripInvitationRow[]).map(mapInvitation);
    if (invitations.length === 0) return [];
    const { data: tripData, error: tripError } = await supabase.from("tg_trips").select("id, name")
      .in("id", invitations.map((invitation) => invitation.tripId));
    const names = new Map<string, string>(result(tripData, tripError).map((trip: { id: string; name: string }) => [trip.id, trip.name]));
    return invitations.map((invitation) => ({ ...invitation, tripName: names.get(invitation.tripId) }));
  },

  async inviteTripEditor(tripId: string, email: string) {
    const { error } = await createClient().rpc("tg_invite_trip_member", {
      p_trip_id: tripId, p_email: email, p_expires_at: null,
    });
    if (error) throw new Error(error.message);
  },

  async acceptTripInvitation(invitationId: string) {
    const { data, error } = await createClient().rpc("tg_accept_trip_invitation", { p_invitation_id: invitationId });
    return result(data, error) as string;
  },

  async revokeTripInvitation(invitationId: string) {
    const { error } = await createClient().rpc("tg_revoke_trip_invitation", { p_invitation_id: invitationId });
    if (error) throw new Error(error.message);
  },

  async removeTripEditor(tripId: string, userId: string) {
    const { error } = await createClient().rpc("tg_remove_trip_editor", { p_trip_id: tripId, p_user_id: userId });
    if (error) throw new Error(error.message);
  },

  async saveTrip(input: Pick<Trip, "name" | "startDate" | "endDate"> & { id?: string; ownerId?: string; isPublic?: boolean }) {
    const supabase = createClient();
    if (input.id) {
      const { data, error } = await supabase.from("tg_trips").update({
        name: input.name, start_date: input.startDate, end_date: input.endDate,
      }).eq("id", input.id).select().single();
      return mapTrip(result(data, error) as TgTripRow);
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("請先登入再新增旅行");
    const { data, error } = await supabase.from("tg_trips").insert({
      owner_id: authData.user.id, name: input.name, start_date: input.startDate, end_date: input.endDate,
      is_public: input.isPublic ?? true,
    }).select().single();
    return mapTrip(result(data, error) as TgTripRow);
  },

  async setTripVisibility(tripId: string, isPublic: boolean) {
    const { error } = await createClient().rpc("tg_set_trip_visibility", {
      p_trip_id: tripId, p_is_public: isPublic,
    });
    if (error) throw new Error(error.message);
  },

  async duplicateTrip(tripId: string) {
    const { data, error } = await createClient().rpc("tg_duplicate_trip", { p_trip_id: tripId });
    return result(data, error) as string;
  },

  async deleteTrip(tripId: string) {
    const { error } = await createClient().from("tg_trips").delete().eq("id", tripId);
    if (error) throw new Error(error.message);
  },

  async getItems(tripId: string) {
    const { data, error } = await createClient().from("tg_travel_items").select("*").eq("trip_id", tripId).order("sort_order");
    return result(data, error).map((row: unknown) => mapItem(row as TgTravelItemRow));
  },

  async saveItem(input: Omit<TravelItem, "id" | "createdAt" | "updatedAt" | "order"> & { id?: string }) {
    const supabase = createClient();
    let sortOrder: number | undefined;
    if (input.id) {
      const { data: existing, error } = await supabase.from("tg_travel_items").select("date, sort_order").eq("id", input.id).single();
      if (error) throw new Error(error.message);
      if (existing.date === input.date) sortOrder = existing.sort_order;
    }
    if (sortOrder === undefined) {
      let lastQuery = supabase.from("tg_travel_items").select("sort_order").eq("trip_id", input.tripId);
      lastQuery = input.date ? lastQuery.eq("date", input.date) : lastQuery.is("date", null);
      const { data: last, error } = await lastQuery.order("sort_order", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      sortOrder = (last?.sort_order ?? -1) + 1;
    }
    const values = {
      trip_id: input.tripId, type: input.type, category: input.category, area: input.area,
      date: input.date, name: input.name, google_maps_url: input.googleMapsUrl,
      extra_link_1: input.extraLink1 ?? null, extra_link_2: input.extraLink2 ?? null,
      business_hours: input.businessHours ?? null, note: input.note, sort_order: sortOrder,
    };
    if (input.id) {
      const { data, error } = await supabase.from("tg_travel_items").update(values).eq("id", input.id).select().single();
      return mapItem(result(data, error) as TgTravelItemRow);
    }
    const { data, error } = await supabase.from("tg_travel_items").insert(values).select().single();
    return mapItem(result(data, error) as TgTravelItemRow);
  },

  async deleteItem(itemId: string) {
    const { error } = await createClient().from("tg_travel_items").delete().eq("id", itemId);
    if (error) throw new Error(error.message);
  },

  async reorderItems(tripId: string, date: string, orderedIds: string[]) {
    const { error } = await createClient().rpc("tg_reorder_travel_items", {
      p_trip_id: tripId, p_date: date, p_ordered_ids: orderedIds,
    });
    if (error) throw new Error(error.message);
  },

  async getFlights(tripId: string) {
    const { data, error } = await createClient().from("tg_flights").select("*").eq("trip_id", tripId)
      .order("departure_date").order("departure_time");
    return result(data, error).map((row: unknown) => mapFlight(row as TgFlightRow));
  },

  async saveFlight(input: Omit<Flight, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const values = {
      trip_id: input.tripId, airline: input.airline, flight_number: input.flightNumber,
      departure_place: input.departurePlace, arrival_place: input.arrivalPlace,
      departure_date: input.departureDate, departure_time: input.departureTime,
      arrival_date: input.arrivalDate, arrival_time: input.arrivalTime,
      link: input.link ?? null, note: input.note ?? null,
    };
    const query = input.id
      ? createClient().from("tg_flights").update(values).eq("id", input.id)
      : createClient().from("tg_flights").insert(values);
    const { data, error } = await query.select().single();
    return mapFlight(result(data, error) as TgFlightRow);
  },

  async deleteFlight(flightId: string) {
    const { error } = await createClient().from("tg_flights").delete().eq("id", flightId);
    if (error) throw new Error(error.message);
  },

  async getHotelStays(tripId: string) {
    const { data, error } = await createClient().from("tg_hotel_stays").select("*").eq("trip_id", tripId).order("check_in_date");
    return result(data, error).map((row: unknown) => mapHotelStay(row as TgHotelStayRow));
  },

  async saveHotelStay(input: Omit<HotelStay, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const values = {
      trip_id: input.tripId, name: input.name, check_in_date: input.checkInDate,
      check_out_date: input.checkOutDate, check_in_time: input.checkInTime ?? null,
      check_out_time: input.checkOutTime ?? null, address: input.address ?? null,
      phone: input.phone ?? null, google_maps_url: input.googleMapsUrl ?? null,
      link: input.link ?? null, note: input.note ?? null,
    };
    const query = input.id
      ? createClient().from("tg_hotel_stays").update(values).eq("id", input.id)
      : createClient().from("tg_hotel_stays").insert(values);
    const { data, error } = await query.select().single();
    return mapHotelStay(result(data, error) as TgHotelStayRow);
  },

  async deleteHotelStay(stayId: string) {
    const { error } = await createClient().from("tg_hotel_stays").delete().eq("id", stayId);
    if (error) throw new Error(error.message);
  },
};

function mapInvitation(row: TgTripInvitationRow): TripInvitation {
  return {
    id: row.id,
    tripId: row.trip_id,
    email: row.email,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
  };
}
