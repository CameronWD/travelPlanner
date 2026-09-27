import { relativeTime } from "@/lib/relative-time";
import { Card } from "@/components/ui/card";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { travellerName, type TravellerLike } from "@/lib/traveller";
import { AttachmentLink } from "@/components/trip/attachment-link";
import type { AttachmentView } from "@/components/trip/attachment-list";

// ---------------------------------------------------------------------------
// Read-only rendering of one Traveller's journal entry — attribution, their
// own photo(s) (spec K: note + photo side by side), and relative time.
// Shared between the day page (other Travellers' entries) and the
// trip-wide Journal page (every entry, every date).
// ---------------------------------------------------------------------------

export interface JournalEntryViewProps {
  body: string;
  updatedAt: Date;
  author: TravellerLike | null;
  /** This author's own Journal photo(s) for the date — normally one (spec
   * K), but a legacy day may still carry several for one author; all are
   * shown, unchanged. */
  photos?: AttachmentView[];
  /**
   * Kit Card shell (default, day page). Pass `false` when the entry sits
   * inside the Journal page's day Card, so cards don't nest.
   */
  framed?: boolean;
}

export function JournalEntryView({
  body,
  updatedAt,
  author,
  photos = [],
  framed = true,
}: JournalEntryViewProps) {
  const time = (
    <time dateTime={updatedAt.toISOString()} title={updatedAt.toLocaleString()}>
      {relativeTime(updatedAt)}
    </time>
  );

  const inner = (
    <>
      {body ? (
        <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground text-pretty">
          {body}
        </p>
      ) : null}
      {photos.length > 0 ? (
        <div className={`mt-2 grid gap-2 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {photos.map((photo) => (
            <AttachmentLink
              key={photo.id}
              href={photo.url}
              mime={photo.mime}
              label={`View photo ${photo.filename}`}
              className="block rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.filename}
                className={`${photos.length === 1 ? "h-[140px]" : "h-24"} w-full rounded-md border-2 border-border object-cover transition-opacity hover:opacity-80`}
              />
            </AttachmentLink>
          ))}
        </div>
      ) : null}
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
