export type TravelItemType = "place" | "food";
export type TripRole = "owner" | "editor";

export interface TripEditor {
  userId: string;
  email: string;
  displayName?: string;
  createdAt: string;
}

export interface TripInvitation {
  id: string;
  tripId: string;
  tripName?: string;
  email: string;
  createdAt: string;
  expiresAt?: string;
}

export interface Trip {
  id: string;
  ownerId?: string;
  name: string;
  startDate: string;
  endDate: string;
  isPublic: boolean;
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

export type TransportationType = "rental_car" | "rail";

interface TransportationBase {
  id: string;
  tripId: string;
  type: TransportationType;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  departurePlace: string;
  arrivalPlace: string;
  reservationNumber?: string;
  cost?: string;
  link?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RentalCarTransportation extends TransportationBase {
  type: "rental_car";
  company: string;
  vehicleModel: string;
  address?: string;
  googleMapsUrl?: string;
}

export interface RailTransportation extends TransportationBase {
  type: "rail";
  routeName: string;
  trainNumber?: string;
  seat?: string;
  carriage?: string;
  ticket?: string;
}

export type Transportation = RentalCarTransportation | RailTransportation;
export type TransportationInput =
  | Omit<RentalCarTransportation, "id" | "tripId" | "createdAt" | "updatedAt">
  | Omit<RailTransportation, "id" | "tripId" | "createdAt" | "updatedAt">;
