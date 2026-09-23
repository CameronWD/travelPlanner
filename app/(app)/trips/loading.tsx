import { ListSkeleton } from "@/components/ui/skeletons";

/** Loading state for the trips list. */
export default function TripsLoading() {
  return <ListSkeleton label="Loading trips" />;
}
