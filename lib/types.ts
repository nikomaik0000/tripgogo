export type TravelItemType = "place" | "food";
export type TripRole = "owner" | "editor";

export interface Trip {
  id: string;
  ownerId?: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelItem {
  id: string;
  tripId: string;
  createdBy?: string;
  type: TravelItemType;
  category: string;
  area: string;
  date: string | null;
  name: string;
  googleMapsUrl: string;
  extraLink1?: string;
  extraLink2?: string;
  businessHours?: string;
  note: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type TravelItemSort = "date" | "category" | "area";

export interface Flight {
  id: string;
  tripId: string;
  airline: string;
  flightNumber: string;
  departurePlace: string;
  arrivalPlace: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  link?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HotelStay {
  id: string;
  tripId: string;
  name: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  address?: string;
  phone?: string;
  googleMapsUrl?: string;
  link?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
