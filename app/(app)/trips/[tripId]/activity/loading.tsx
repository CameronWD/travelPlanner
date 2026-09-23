import { ListSkeleton } from "@/components/ui/skeletons";

/** Loading state for the Activity feed. */
export default function ActivityLoading() {
  return <ListSkeleton label="Loading activity" />;
}
