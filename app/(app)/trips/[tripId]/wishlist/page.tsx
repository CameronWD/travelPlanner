import { Heart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function WishlistPage() {
  return (
    <EmptyState
      icon={Heart}
      title="Wishlist coming soon"
      description="Collect ideas and things you'd love to do — vote on them together before committing."
    />
  );
}
