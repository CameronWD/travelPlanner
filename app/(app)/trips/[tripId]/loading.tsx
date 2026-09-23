import { DetailSkeleton } from "@/components/ui/skeletons";

/** Loading state for the trip segment (trip home and any nested page without its own boundary). */
export default function TripLoading() {
  return <DetailSkeleton label="Loading trip" />;
}
