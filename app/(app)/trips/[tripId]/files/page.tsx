import { FolderOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function FilesPage() {
  return (
    <EmptyState
      icon={FolderOpen}
      title="Files coming soon"
      description="Attach booking confirmations, tickets, and documents to keep everything in one place."
    />
  );
}
