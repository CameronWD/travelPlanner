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
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
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
              <div className="flex items-center gap-2">
                <Link
                  href={`/trips/${tripId}/day/${date}`}
                  className="font-display text-sm font-bold text-foreground hover:opacity-80"
                >
                  {formatLongDate(date)}
                </Link>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>

              {/* Body */}
              {entry ? (
                <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {entry.body}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {entry.author.name ? (
                      <>
                        <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                          {entry.author.name.charAt(0).toUpperCase()}
                        </span>
                        <span>{entry.author.name} · {relativeTime(entry.updatedAt)}</span>
                      </>
                    ) : (
                      <time dateTime={entry.updatedAt.toISOString()}>
                        {relativeTime(entry.updatedAt)}
                      </time>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Photo grid */}
              {dayPhotos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {dayPhotos.map((photo) => (
                    <a
                      key={photo.id}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View photo ${photo.filename}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.filename}
                        className="h-24 w-full rounded-xl object-cover transition-opacity hover:opacity-80"
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
