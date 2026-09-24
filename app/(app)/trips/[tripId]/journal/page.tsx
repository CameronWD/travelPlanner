import Link from "next/link";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatLongDate } from "@/lib/dates";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AttachmentLink } from "@/components/trip/attachment-link";
import { JournalEntryView } from "@/components/trip/journal-entry-view";

/**
 * Kit day-card grid: one reading-width column on phones, two from md (each
 * column stays well under 80ch). Exported for tests.
 */
export const JOURNAL_READING_WIDTH_CLASS =
  "mx-auto grid w-full max-w-3xl grid-cols-1 items-start gap-3 md:max-w-none md:grid-cols-2 md:gap-[18px]";

/** Kit photo grid: up to three across; a lone photo gets the tall tile. */
const PHOTO_COLS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

/** First two initials of a name, for the avatar fallback. */
function initials(name: string | null): string {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  // Fetch all journal entries ordered by date (trip order — oldest first).
  // Entries are per-Traveller (ARCH-DAT-6): a date may hold several, one per
  // author, so this always returns every author's entry for every date.
  const entries = await db.journalEntry.findMany({
    where: { tripId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      body: true,
      updatedAt: true,
      author: { select: { id: true, name: true, image: true } },
    },
  });

  // Fetch all journal photos for this trip in one query, keyed by targetId (date)
  const photos = await db.attachment.findMany({
    where: { tripId, targetType: "JOURNAL" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      targetId: true,
      filename: true,
      mime: true,
      size: true,
      url: true,
    },
  });

  // Build a map: date → photos
  const photosByDate = new Map<string, typeof photos>();
  for (const photo of photos) {
    if (!photo.targetId) continue;
    const existing = photosByDate.get(photo.targetId) ?? [];
    existing.push(photo);
    photosByDate.set(photo.targetId, existing);
  }

  if (entries.length === 0 && photos.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        tone="lilac"
        title="No journal entries yet"
        description="Capture the trip as you go — notes and photos, day by day."
      />
    );
  }

  // Collect all unique dates that have either an entry or photos
  const allDates = new Set<string>([
    ...entries.map((e) => e.date),
    ...Array.from(photosByDate.keys()),
  ]);
  const sortedDates = Array.from(allDates).sort();

  // Build a map: date → entries (every Traveller's entry for that date, not
  // just one — ARCH-DAT-6).
  const entriesByDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const existing = entriesByDate.get(entry.date) ?? [];
    existing.push(entry);
    entriesByDate.set(entry.date, existing);
  }

  const entryCount = entries.length === 1 ? "1 entry" : `${entries.length} entries`;
  const photoCount =
    photos.length === 0 ? null : photos.length === 1 ? "1 photo" : `${photos.length} photos`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header — kit: display title + "N entries · N photos" */}
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-foreground sm:text-4xl">
          Journal
        </h2>
        <p className="text-xs font-semibold text-muted-foreground">
          {photoCount ? `${entryCount} · ${photoCount}` : entryCount}
        </p>
      </div>

      <div className={JOURNAL_READING_WIDTH_CLASS}>
        {sortedDates.map((date, i) => {
          const dayEntries = entriesByDate.get(date) ?? [];
          const dayPhotos = photosByDate.get(date) ?? [];
          const authors = Array.from(
            new Map(dayEntries.map((e) => [e.author.id, e.author])).values(),
          );

          return (
            <Card
              key={date}
              data-slot="journal-day"
              shadow={i === 0 ? 3 : 2}
              className="flex flex-col gap-3 p-3.5 sm:p-[18px]"
            >
              {/* Date heading — links to the day view; who wrote, right */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
                  <Link
                    href={`/trips/${tripId}/day/${date}`}
                    className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    {formatLongDate(date)}
                  </Link>
                </h3>
                {authors.length > 0 ? (
                  <div className="flex shrink-0 -space-x-2" aria-hidden="true">
                    {authors.map((a) => (
                      <Avatar key={a.id} className="size-[30px]">
                        <AvatarFallback className="text-[11px]">{initials(a.name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Photo grid */}
              {dayPhotos.length > 0 ? (
                <div className={`grid gap-2 ${PHOTO_COLS[Math.min(dayPhotos.length, 3)]}`}>
                  {dayPhotos.map((photo) => (
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
                        className={`${dayPhotos.length === 1 ? "h-[180px]" : "h-[110px]"} w-full rounded-md border-2 border-border object-cover transition-opacity hover:opacity-80`}
                      />
                    </AttachmentLink>
                  ))}
                </div>
              ) : null}

              {/* Body — every Traveller's entry for this date */}
              {dayEntries.length > 0 ? (
                <div className="flex flex-col divide-y divide-border-soft">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                      <JournalEntryView
                        body={entry.body}
                        updatedAt={entry.updatedAt}
                        authorName={entry.author.name}
                        framed={false}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
