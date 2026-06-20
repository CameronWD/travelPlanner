import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function SummaryPage() {
  return (
    <EmptyState
      icon={BarChart3}
      title="Summary coming soon"
      description="Route map, spending breakdown, and a shareable trip report."
    />
  );
}
