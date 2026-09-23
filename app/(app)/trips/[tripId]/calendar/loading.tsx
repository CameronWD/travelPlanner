import { CalendarSkeleton } from "@/components/ui/skeletons";

/** Loading state for the Calendar page. */
export default function CalendarLoading() {
  return <CalendarSkeleton label="Loading days" />;
}
