import { relativeTime } from "@/lib/relative-time";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// ---------------------------------------------------------------------------
// Read-only rendering of one Traveller's journal entry — attribution +
// relative time, shared between the day page (other Travellers' entries)
// and the trip-wide Journal page (every entry, every date).
// ---------------------------------------------------------------------------

export interface JournalEntryViewProps {
  body: string;
  updatedAt: Date;
  authorName: string | null;
  /**
   * Kit Card shell (default, day page). Pass `false` when the entry sits
   * inside the Journal page's day Card, so cards don't nest.
   */
  framed?: boolean;
}

/** First two initials of a name, for the avatar fallback. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function JournalEntryView({ body, updatedAt, authorName, framed = true }: JournalEntryViewProps) {
  const time = (
    <time dateTime={updatedAt.toISOString()} title={updatedAt.toLocaleString()}>
      {relativeTime(updatedAt)}
    </time>
  );

  const inner = (
    <>
      <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground text-pretty">{body}</p>
      <div className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {authorName ? (
          <>
            <Avatar className="size-6">
              <AvatarFallback className="text-[9px]">{initials(authorName)}</AvatarFallback>
            </Avatar>
            <span>
              {authorName} · {time}
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
