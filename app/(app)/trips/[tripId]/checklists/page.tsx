import { CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function ChecklistsPage() {
  return (
    <EmptyState
      icon={CheckSquare}
      title="Checklists coming soon"
      description="Packing lists, pre-departure tasks, and shared to-dos for the whole group."
    />
  );
}
