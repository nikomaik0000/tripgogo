import type { TgFlightRow, TgHotelStayRow, TgTravelItemRow, TgTripRow } from "@/lib/database.types";
import type { Flight, HotelStay, TravelItem, Trip } from "@/lib/types";

export const mapTrip = (row: TgTripRow): Trip => ({
  id: row.id, ownerId: row.owner_id, name: row.name, startDate: row.start_date,
  endDate: row.end_date, createdAt: row.created_at, updatedAt: row.updated_at,
});

export const mapItem = (row: TgTravelItemRow): TravelItem => ({
  id: row.id, tripId: row.trip_id, createdBy: row.created_by ?? undefined, type: row.type,
  category: row.category, area: row.area, date: row.date, name: row.name,
  googleMapsUrl: row.google_maps_url, extraLink1: row.extra_link_1 ?? undefined,
  extraLink2: row.extra_link_2 ?? undefined, businessHours: row.business_hours ?? undefined,
  note: row.note, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at,
});

export const mapFlight = (row: TgFlightRow): Flight => ({
  id: row.id, tripId: row.trip_id, airline: row.airline, flightNumber: row.flight_number,
  departurePlace: row.departure_place, arrivalPlace: row.arrival_place,
  departureDate: row.departure_date, departureTime: row.departure_time.slice(0, 5),
  arrivalDate: row.arrival_date, arrivalTime: row.arrival_time.slice(0, 5),
  link: row.link ?? undefined, note: row.note ?? undefined,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export const mapHotelStay = (row: TgHotelStayRow): HotelStay => ({
  id: row.id, tripId: row.trip_id, name: row.name, checkInDate: row.check_in_date,
  checkOutDate: row.check_out_date, checkInTime: row.check_in_time?.slice(0, 5),
  checkOutTime: row.check_out_time?.slice(0, 5), address: row.address ?? undefined,
  phone: row.phone ?? undefined, googleMapsUrl: row.google_maps_url ?? undefined,
  link: row.link ?? undefined, note: row.note ?? undefined,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
