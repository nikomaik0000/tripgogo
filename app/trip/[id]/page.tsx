import { TripWorkspace } from "@/components/trip-workspace";
import { travelServerRepository } from "@/lib/travel-server-repository";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await travelServerRepository.getTripBundle(id);
  return <TripWorkspace tripId={id} initialTrip={data.trip} initialItems={data.items} initialFlights={data.flights} initialHotelStays={data.hotelStays} />;
}
