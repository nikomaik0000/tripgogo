import type { Flight, HotelStay, TravelItem, Trip } from "@/lib/types";

const TRIPS_KEY = "travel-gogo:v1:trips";
const ITEMS_KEY = "travel-gogo:v1:items";
const FLIGHTS_KEY = "travel-gogo:v1:flights";
const HOTEL_STAYS_KEY = "travel-gogo:v1:hotel-stays";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function id() {
  return crypto.randomUUID();
}

export const travelRepository = {
  getTrips: () => read<Trip>(TRIPS_KEY),
  getTrip: (tripId: string) => read<Trip>(TRIPS_KEY).find((trip) => trip.id === tripId),
  saveTrip(input: Pick<Trip, "name" | "startDate" | "endDate" | "ownerId"> & { id?: string; isPublic?: boolean }) {
    const trips = read<Trip>(TRIPS_KEY);
    const existing = input.id ? trips.find((trip) => trip.id === input.id) : undefined;
    const now = new Date().toISOString();
    const trip: Trip = {
      ...input,
      id: input.id ?? id(),
      isPublic: input.isPublic ?? existing?.isPublic ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = input.id ? trips.map((value) => (value.id === input.id ? trip : value)) : [...trips, trip];
    write(TRIPS_KEY, next);
    return trip;
  },
  duplicateTrip(tripId: string) {
    const trip = this.getTrip(tripId);
    if (!trip) return;
    const copy = this.saveTrip({
      name: `${trip.name} - 複製`,
      startDate: trip.startDate,
      endDate: trip.endDate,
      ownerId: trip.ownerId,
    });
    const items = read<TravelItem>(ITEMS_KEY);
    const flights = read<Flight>(FLIGHTS_KEY);
    const hotelStays = read<HotelStay>(HOTEL_STAYS_KEY);
    const now = new Date().toISOString();
    const copies = items
      .filter((item) => item.tripId === tripId)
      .map((item) => ({ ...item, id: id(), tripId: copy.id, createdAt: now, updatedAt: now }));
    write(ITEMS_KEY, [...items, ...copies]);
    write(FLIGHTS_KEY, [...flights, ...flights.filter((flight) => flight.tripId === tripId).map((flight) => ({ ...flight, id: id(), tripId: copy.id, createdAt: now, updatedAt: now }))]);
    write(HOTEL_STAYS_KEY, [...hotelStays, ...hotelStays.filter((stay) => stay.tripId === tripId).map((stay) => ({ ...stay, id: id(), tripId: copy.id, createdAt: now, updatedAt: now }))]);
  },
  deleteTrip(tripId: string) {
    write(TRIPS_KEY, read<Trip>(TRIPS_KEY).filter((trip) => trip.id !== tripId));
    write(ITEMS_KEY, read<TravelItem>(ITEMS_KEY).filter((item) => item.tripId !== tripId));
    write(FLIGHTS_KEY, read<Flight>(FLIGHTS_KEY).filter((flight) => flight.tripId !== tripId));
    write(HOTEL_STAYS_KEY, read<HotelStay>(HOTEL_STAYS_KEY).filter((stay) => stay.tripId !== tripId));
  },
  getItems: (tripId: string) => read<TravelItem>(ITEMS_KEY).filter((item) => item.tripId === tripId),
  saveItem(input: Omit<TravelItem, "id" | "createdAt" | "updatedAt" | "order"> & { id?: string }) {
    const items = read<TravelItem>(ITEMS_KEY);
    const existing = input.id ? items.find((item) => item.id === input.id) : undefined;
    const oldGroup = existing?.date;
    const group = items.filter((item) => item.tripId === input.tripId && item.date === input.date && item.id !== input.id);
    const now = new Date().toISOString();
    const item: TravelItem = {
      ...input,
      id: input.id ?? id(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      order: existing && oldGroup === input.date ? existing.order : group.length,
    };
    let next = existing ? items.map((value) => (value.id === item.id ? item : value)) : [...items, item];
    if (existing && oldGroup !== input.date) next = normalize(next, input.tripId, oldGroup);
    write(ITEMS_KEY, next);
    return item;
  },
  deleteItem(itemId: string) {
    const items = read<TravelItem>(ITEMS_KEY);
    const item = items.find((value) => value.id === itemId);
    if (!item) return;
    write(ITEMS_KEY, normalize(items.filter((value) => value.id !== itemId), item.tripId, item.date));
  },
  reorderItems(activeId: string, overId: string) {
    if (activeId === overId) return;
    const items = read<TravelItem>(ITEMS_KEY);
    const active = items.find((item) => item.id === activeId);
    const over = items.find((item) => item.id === overId);
    if (!active || !over || !active.date || active.tripId !== over.tripId || active.date !== over.date) return;
    const group = items
      .filter((item) => item.tripId === active.tripId && item.date === active.date)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const from = group.findIndex((item) => item.id === activeId);
    const to = group.findIndex((item) => item.id === overId);
    const [moved] = group.splice(from, 1);
    group.splice(to, 0, moved);
    const orders = new Map(group.map((item, order) => [item.id, order]));
    write(ITEMS_KEY, items.map((item) => orders.has(item.id) ? { ...item, order: orders.get(item.id)! } : item));
  },
  getFlights: (tripId: string) => read<Flight>(FLIGHTS_KEY).filter((flight) => flight.tripId === tripId),
  saveFlight(input: Omit<Flight, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const flights = read<Flight>(FLIGHTS_KEY);
    const existing = input.id ? flights.find((flight) => flight.id === input.id) : undefined;
    const now = new Date().toISOString();
    const flight: Flight = { ...input, id: input.id ?? id(), createdAt: existing?.createdAt ?? now, updatedAt: now };
    write(FLIGHTS_KEY, existing ? flights.map((value) => value.id === flight.id ? flight : value) : [...flights, flight]);
    return flight;
  },
  deleteFlight(flightId: string) {
    write(FLIGHTS_KEY, read<Flight>(FLIGHTS_KEY).filter((flight) => flight.id !== flightId));
  },
  getHotelStays: (tripId: string) => read<HotelStay>(HOTEL_STAYS_KEY).filter((stay) => stay.tripId === tripId),
  saveHotelStay(input: Omit<HotelStay, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const stays = read<HotelStay>(HOTEL_STAYS_KEY);
    const existing = input.id ? stays.find((stay) => stay.id === input.id) : undefined;
    const now = new Date().toISOString();
    const stay: HotelStay = { ...input, id: input.id ?? id(), createdAt: existing?.createdAt ?? now, updatedAt: now };
    write(HOTEL_STAYS_KEY, existing ? stays.map((value) => value.id === stay.id ? stay : value) : [...stays, stay]);
    return stay;
  },
  deleteHotelStay(stayId: string) {
    write(HOTEL_STAYS_KEY, read<HotelStay>(HOTEL_STAYS_KEY).filter((stay) => stay.id !== stayId));
  },
};

function normalize(items: TravelItem[], tripId: string, date: string | null | undefined) {
  const group = items
    .filter((item) => item.tripId === tripId && item.date === date)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  const orders = new Map(group.map((item, order) => [item.id, order]));
  return items.map((item) => orders.has(item.id) ? { ...item, order: orders.get(item.id)! } : item);
}
