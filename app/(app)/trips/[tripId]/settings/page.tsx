import { Settings } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function SettingsPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Settings coming soon"
      description="Manage trip details, invite members, and configure preferences."
    />
  );
}
