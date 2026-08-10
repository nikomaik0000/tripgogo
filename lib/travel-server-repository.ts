import { createClient } from "@/lib/supabase/server";
import type { TgFlightRow, TgHotelStayRow, TgTravelItemRow, TgTripRow } from "@/lib/database.types";
import { mapFlight, mapHotelStay, mapItem, mapTrip } from "@/lib/travel-mappers";

function ensure<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase did not return the requested data");
  return data;
}

export const travelServerRepository = {
  async getTrips() {
    const { data, error } = await (await createClient()).from("tg_trips").select("*").order("start_date");
    return ensure(data, error).map((row) => mapTrip(row as TgTripRow));
  },
  async getTripBundle(tripId: string) {
    const supabase = await createClient();
    const [tripResult, itemsResult, flightsResult, hotelsResult] = await Promise.all([
      supabase.from("tg_trips").select("*").eq("id", tripId).maybeSingle(),
      supabase.from("tg_travel_items").select("*").eq("trip_id", tripId).order("sort_order"),
      supabase.from("tg_flights").select("*").eq("trip_id", tripId).order("departure_date").order("departure_time"),
      supabase.from("tg_hotel_stays").select("*").eq("trip_id", tripId).order("check_in_date"),
    ]);
    if (tripResult.error) throw new Error(tripResult.error.message);
    return {
      trip: tripResult.data ? mapTrip(tripResult.data as TgTripRow) : undefined,
      items: ensure(itemsResult.data, itemsResult.error).map((row) => mapItem(row as TgTravelItemRow)),
      flights: ensure(flightsResult.data, flightsResult.error).map((row) => mapFlight(row as TgFlightRow)),
      hotelStays: ensure(hotelsResult.data, hotelsResult.error).map((row) => mapHotelStay(row as TgHotelStayRow)),
    };
  },
};
