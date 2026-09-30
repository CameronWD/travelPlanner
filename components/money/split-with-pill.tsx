import Link from "next/link";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { tripPath } from "@/lib/trip-path";
import type { TravellerLike } from "@/lib/traveller";

export interface SplitWithPillProps {
  slug: string;
  members: TravellerLike[];
}

/** Money's "Split with N" — only makes sense once there's someone to split with. */
export function SplitWithPill({ slug, members }: SplitWithPillProps) {
  if (members.length < 2) return null;

  return (
    <Link
      href={tripPath(slug, "/settings#travellers")}
      aria-label={`Split with ${members.length}`}
      className="pressable inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border bg-card pl-4 pr-1.5 text-sm font-extrabold text-card-foreground"
    >
      Split with {members.length}
      <span className="flex -space-x-2">
        {members.slice(0, 3).map((m) => (
          <TravellerAvatar key={m.id} traveller={m} size={32} ring />
        ))}
      </span>
    </Link>
  );
}
