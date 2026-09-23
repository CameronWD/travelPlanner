import { ListSkeleton } from "@/components/ui/skeletons";

/** Loading state for the Checklists page. */
export default function ChecklistsLoading() {
  return <ListSkeleton label="Loading checklists" />;
}
