import { FormSkeleton } from "@/components/ui/skeletons";

/** Loading state for the Account page (devices + trip digest settings). */
export default function AccountLoading() {
  return <FormSkeleton label="Loading account" />;
}
