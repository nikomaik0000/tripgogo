export type TgTripRow = {
  id: string; owner_id: string; name: string; start_date: string; end_date: string;
  created_at: string; updated_at: string;
};

export type TgTravelItemRow = {
  id: string; trip_id: string; created_by: string | null; type: "place" | "food";
  category: string; area: string; date: string | null; name: string; google_maps_url: string;
  extra_link_1: string | null; extra_link_2: string | null; business_hours: string | null;
  note: string; sort_order: number; created_at: string; updated_at: string;
};

export type TgFlightRow = {
  id: string; trip_id: string; created_by: string | null; airline: string; flight_number: string;
  departure_place: string; arrival_place: string; departure_date: string; departure_time: string;
  arrival_date: string; arrival_time: string; link: string | null; note: string | null;
  created_at: string; updated_at: string;
};

export type TgHotelStayRow = {
  id: string; trip_id: string; created_by: string | null; name: string; check_in_date: string;
  check_out_date: string; check_in_time: string | null; check_out_time: string | null;
  address: string | null; phone: string | null; google_maps_url: string | null; link: string | null;
  note: string | null; created_at: string; updated_at: string;
};
