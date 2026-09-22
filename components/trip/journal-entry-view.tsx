import { relativeTime } from "@/lib/relative-time";

// ---------------------------------------------------------------------------
// Read-only rendering of one Traveller's journal entry — attribution +
// relative time, shared between the day page (other Travellers' entries)
// and the trip-wide Journal page (every entry, every date).
// ---------------------------------------------------------------------------

export interface JournalEntryViewProps {
  body: string;
  updatedAt: Date;
  authorName: string | null;
}

export function JournalEntryView({ body, updatedAt, authorName }: JournalEntryViewProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{body}</p>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        {authorName ? (
          <>
            <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
              {authorName.charAt(0).toUpperCase()}
            </span>
            <span>
              {authorName} · {relativeTime(updatedAt)}
            </span>
          </>
        ) : (
          <time dateTime={updatedAt.toISOString()}>{relativeTime(updatedAt)}</time>
        )}
      </div>
    </div>
  );
}
