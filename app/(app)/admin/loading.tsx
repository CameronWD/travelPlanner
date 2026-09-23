import { FormSkeleton } from "@/components/ui/skeletons";

/** Loading state for the Admin console (access requests, allowlist, error reports). */
export default function AdminLoading() {
  return <FormSkeleton label="Loading admin" />;
}
