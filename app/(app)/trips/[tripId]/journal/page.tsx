import Link from "next/link";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatLongDate } from "@/lib/dates";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/relative-time";

export default async function JournalPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  // Fetch all journal entries ordered by date (trip order — oldest first)
  const entries = await db.journalEntry.findMany({
    where: { tripId },
    orderBy: { date: "asc" },
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

  // Build a map: date → entry (for fast lookup)
  const entryByDate = new Map(entries.map((e) => [e.date, e]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          Journal
        </h2>
        <p className="text-sm text-muted-foreground">
          {entries.length === 1
            ? "1 entry"
            : `${entries.length} entries`}
        </p>
      </div>

      <div className="flex flex-col gap-10">
        {sortedDates.map((date) => {
          const entry = entryByDate.get(date);
          const dayPhotos = photosByDate.get(date) ?? [];

          return (
            <article key={date} className="flex flex-col gap-4">
              {/* Date heading — links to the day view */}
              <Link
                href={`/trips/${tripId}/day/${date}`}
                className="group inline-flex items-baseline gap-2 hover:opacity-80"
              >
                <h3 className="font-display text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                  {formatLongDate(date)}
                </h3>
                <span className="text-xs text-muted-foreground">
                  View day →
                </span>
              </Link>

              {/* Body */}
              {entry ? (
                <div className="rounded-xl border border-border bg-card px-5 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {entry.body}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {entry.author.name ? (
                      <span>{entry.author.name}</span>
                    ) : null}
                    <span>·</span>
                    <time dateTime={entry.updatedAt.toISOString()}>
                      {relativeTime(entry.updatedAt)}
                    </time>
                  </div>
                </div>
              ) : null}

              {/* Photo grid */}
              {dayPhotos.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {dayPhotos.map((photo) => (
                    <a
                      key={photo.id}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View photo ${photo.filename}`}
                      className="overflow-hidden rounded-lg"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.filename}
                        className="h-28 w-28 object-cover transition-opacity hover:opacity-80 sm:h-36 sm:w-36"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
