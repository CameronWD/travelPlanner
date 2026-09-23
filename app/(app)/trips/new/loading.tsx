import { FormSkeleton } from "@/components/ui/skeletons";

/** Loading state for the new-trip form. */
export default function NewTripLoading() {
  return <FormSkeleton label="Loading new trip form" />;
}
