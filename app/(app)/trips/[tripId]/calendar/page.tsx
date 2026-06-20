import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function CalendarPage() {
  return (
    <EmptyState
      icon={CalendarDays}
      title="Calendar coming soon"
      description="Day-by-day view of your trip with all activities and transport in one place."
    />
  );
}
