export type TgTripRow = {
  id: string; owner_id: string; name: string; mode: "trip" | "collection"; start_date: string | null; end_date: string | null;
  is_public: boolean; created_at: string; updated_at: string;
};

export type TgTripMemberRow = {
  trip_id: string; user_id: string; role: "owner" | "editor";
  invited_by: string | null; created_at: string;
};

export type TgTripInvitationRow = {
  id: string; trip_id: string; email: string; role: "editor"; invited_by: string;
  accepted_by: string | null; accepted_at: string | null; created_at: string;
  expires_at: string | null;
};

export type PlatformRole = "user" | "admin";

export type TgProfileRow = {
  id: string; email: string; display_name: string | null; platform_role: PlatformRole;
  created_at: string; updated_at: string;
};

export type TgTravelItemRow = {
  id: string; trip_id: string; created_by: string | null; type: "place" | "food";
  category: string; area: string; date: string | null; name: string; google_maps_url: string;
  extra_link_1: string | null; extra_link_2: string | null; business_hours: string | null;
  note: string; status: "planned" | "completed" | null; rating: number | null;
  completed_date: string | null; experience_note: string | null; consumed_items: string | null;
  image_path: string | null; image_fit: "cover" | "contain";
  duplicate_source_item_id: string | null; sort_order: number; created_at: string; updated_at: string;
};

export type TgTripResourceRow = {
  id: string; trip_id: string; created_by: string | null;
  category: "transportation" | "coupon" | "note"; title: string;
  note: string | null; external_url: string | null; image_path: string | null;
  created_at: string; updated_at: string;
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

export type TgTransportationRow = {
  id: string; trip_id: string; created_by: string | null; type: "rental_car" | "rail";
  company: string | null; vehicle_model: string | null; route_name: string | null;
  start_date: string; start_time: string; end_date: string; end_time: string;
  departure_place: string; arrival_place: string; train_number: string | null;
  seat: string | null; carriage: string | null; ticket: string | null;
  reservation_number: string | null; cost: string | null; address: string | null;
  link: string | null; google_maps_url: string | null; note: string | null;
  created_at: string; updated_at: string;
};
