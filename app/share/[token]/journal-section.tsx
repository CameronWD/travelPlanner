import { Card } from "@/components/ui/card";
import { formatDayLabel } from "@/lib/dates";
import { travellerFirstName, type TravellerLike } from "@/lib/traveller";

// ---------------------------------------------------------------------------
// "How it's going" — the Journal section on a Share link whose includeJournal
// dial is on (spec L / ADR 0051 amendment). Display name only: no avatar, no
// email (TravellerLike carries more than that, but only travellerFirstName
// is ever called on it here — see lib/traveller.ts). Photos are served
// through the link-scoped route (app/share/[token]/journal-photo/[id]/route.ts),
// never `/api/attachments/:id`, so a Share link never reaches the
// session-gated route.
// ---------------------------------------------------------------------------

export interface ShareJournalEntryRow {
  date: string;
  authorId: string;
  body: string;
  hiddenFromShares: boolean;
  author: TravellerLike;
}

export interface ShareJournalPhotoRow {
  id: string;
  /** The date (YYYY-MM-DD) this Journal photo is for. */
  targetId: string | null;
  uploadedById: string;
  uploadedBy: TravellerLike;
}

export interface JournalSectionProps {
  token: string;
  /** Arrived Trip days (any order) — re-sorted newest first below. */
  dates: string[];
  entries: ShareJournalEntryRow[];
  photos: ShareJournalPhotoRow[];
}

export interface JournalDayEntryView {
  authorFirstName: string;
  body: string;
  photoUrl: string | null;
}

export interface JournalDayView {
  dateISO: string;
  entries: JournalDayEntryView[];
}

/**
 * Pure: shapes raw entry/photo rows into per-day, per-author view models.
 *
 * - Newest day first.
 * - An entry with `hiddenFromShares` is omitted entirely — never even its
 *   photo (ADR 0051 amendment: "such an entry (note and photo) is never
 *   selected for any link").
 * - A photo with no entry row at all is NOT hidden (no row means
 *   `hiddenFromShares` defaults false) and still surfaces its author, same
 *   union `lib/journal-loader.ts`'s `loadTodaysJournal` uses for Today's
 *   Journal on Home.
 * - A day with nothing left to show (every entry hidden, no photo) is
 *   dropped rather than rendered empty.
 */
export function buildJournalDays(
  token: string,
  dates: string[],
  entries: ShareJournalEntryRow[],
  photos: ShareJournalPhotoRow[],
): JournalDayView[] {
  const hiddenKeys = new Set(
    entries.filter((e) => e.hiddenFromShares).map((e) => `${e.date}|${e.authorId}`),
  );
  const sortedDates = [...new Set(dates)].sort().reverse();

  const days: JournalDayView[] = [];
  for (const date of sortedDates) {
    const dayEntries: JournalDayEntryView[] = [];
    const seenAuthors = new Set<string>();

    for (const entry of entries) {
      if (entry.date !== date || entry.hiddenFromShares) continue;
      const photo = photos.find((p) => p.targetId === date && p.uploadedById === entry.authorId);
      dayEntries.push({
        authorFirstName: travellerFirstName(entry.author),
        body: entry.body,
        photoUrl: photo ? `/share/${token}/journal-photo/${photo.id}` : null,
      });
      seenAuthors.add(entry.authorId);
    }

    for (const photo of photos) {
      if (photo.targetId !== date) continue;
      if (seenAuthors.has(photo.uploadedById)) continue;
      if (hiddenKeys.has(`${date}|${photo.uploadedById}`)) continue;
      dayEntries.push({
        authorFirstName: travellerFirstName(photo.uploadedBy),
        body: "",
        photoUrl: `/share/${token}/journal-photo/${photo.id}`,
      });
      seenAuthors.add(photo.uploadedById);
    }

    if (dayEntries.length > 0) {
      days.push({ dateISO: date, entries: dayEntries });
    }
  }
  return days;
}

export function JournalSection({ token, dates, entries, photos }: JournalSectionProps) {
  const days = buildJournalDays(token, dates, entries, photos);
  if (days.length === 0) return null;

  return (
    <section aria-labelledby="journal-heading" className="flex flex-col gap-3" data-testid="share-journal">
      <h2
        id="journal-heading"
        className="font-display text-xl font-extrabold leading-tight tracking-[-0.03em]"
      >
        How it&apos;s going
      </h2>
      <ol className="flex flex-col gap-3">
        {days.map((day) => (
          <li key={day.dateISO}>
            <Card className="p-4" data-testid="share-journal-day">
              <h3 className="font-display text-base font-extrabold tracking-[-0.02em]">
                {formatDayLabel(day.dateISO)}
              </h3>
              <div className="mt-2 flex flex-col gap-3 divide-y divide-border-soft [&>*:not(:first-child)]:pt-3">
                {day.entries.map((entry, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {entry.authorFirstName}
                    </p>
                    {entry.body && (
                      <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-foreground">
                        {entry.body}
                      </p>
                    )}
                    {entry.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.photoUrl}
                        alt={`Photo from ${entry.authorFirstName}`}
                        className="h-24 w-24 rounded-md border-2 border-border object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
