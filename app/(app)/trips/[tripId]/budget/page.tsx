import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function BudgetPage() {
  return (
    <EmptyState
      icon={Wallet}
      title="Budget coming soon"
      description="Track estimated and actual costs across the trip, split by person and category."
    />
  );
}
