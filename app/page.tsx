import { TripList } from "@/components/trip-list";
import { travelServerRepository } from "@/lib/travel-server-repository";

export default async function HomePage() {
  const trips = await travelServerRepository.getTrips();
  return <TripList initialTrips={trips} />;
}
