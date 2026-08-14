import { TripResourcesWorkspace } from "@/components/trip-resources-workspace";
import { travelServerRepository } from "@/lib/travel-server-repository";

export default async function TripResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await travelServerRepository.getTripBundle(id);
  return <TripResourcesWorkspace tripId={id} initialTrip={data.trip} />;
}
