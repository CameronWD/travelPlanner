import { Sun } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function TodayPage() {
  return (
    <EmptyState
      icon={Sun}
      title="Today coming soon"
      description="Your on-the-go view: what's happening today, local time, maps, and quick actions."
    />
  );
}
