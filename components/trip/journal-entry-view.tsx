import { relativeTime } from "@/lib/relative-time";
import { Card } from "@/components/ui/card";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { travellerName, type TravellerLike } from "@/lib/traveller";

// ---------------------------------------------------------------------------
// Read-only rendering of one Traveller's journal entry — attribution +
// relative time, shared between the day page (other Travellers' entries)
// and the trip-wide Journal page (every entry, every date).
// ---------------------------------------------------------------------------

export interface JournalEntryViewProps {
  body: string;
  updatedAt: Date;
  author: TravellerLike | null;
  /**
   * Kit Card shell (default, day page). Pass `false` when the entry sits
   * inside the Journal page's day Card, so cards don't nest.
   */
  framed?: boolean;
}

export function JournalEntryView({ body, updatedAt, author, framed = true }: JournalEntryViewProps) {
  const time = (
    <time dateTime={updatedAt.toISOString()} title={updatedAt.toLocaleString()}>
      {relativeTime(updatedAt)}
    </time>
  );

  const inner = (
    <>
      <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground text-pretty">{body}</p>
      <div className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {author ? (
          <>
            <TravellerAvatar traveller={author} size={24} />
            <span>
              {travellerName(author)} · {time}
            </span>
          </>
        ) : (
          time
        )}
      </div>
    </>
  );

  if (!framed) return <div>{inner}</div>;

  return <Card className="p-3.5 sm:p-[18px]">{inner}</Card>;
}
