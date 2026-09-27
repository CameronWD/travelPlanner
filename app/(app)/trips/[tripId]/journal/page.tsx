import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatLongDate, formatDayLabel } from "@/lib/dates";
import { loadJournalWindow } from "@/lib/journal-window-loader";
import { journalWritableDates } from "@/lib/journal-window";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { JournalEntryView } from "@/components/trip/journal-entry-view";
import { JournalEditor } from "@/components/trip/journal-editor";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import type { AttachmentView } from "@/components/trip/attachment-list";

export const metadata: Metadata = { title: "Journal" };

/**
 * Kit day-card grid: one reading-width column on phones, two from md (each
 * column stays well under 80ch). Exported for tests.
 */
export const JOURNAL_READING_WIDTH_CLASS =
  "mx-auto grid w-full max-w-3xl grid-cols-1 items-start gap-3 md:max-w-none md:grid-cols-2 md:gap-[18px]";

export default async function JournalPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { user } = await requireTripAccess(tripId);

  // Spec K: the Journal opens on the Trip's first arrived day and never
  // closes — loadJournalWindow (Task 6) computes start/end + the Trip's own
  // "today" the same way the day view and Home do.
  const window = await loadJournalWindow(tripId);
  const writable = journalWritableDates(window);

  // Before day 1: nothing has arrived yet, so there's nothing to write or
  // read — a dated Trip gets a specific "come back on day 1" empty state
  // rather than the generic one below.
  if (window.startDate && writable.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        tone="lilac"
        title={`Opens on day 1 — ${formatDayLabel(window.startDate)}`}
        description="Come back once your trip gets underway to start writing."
      />
    );
  }

  // Fetch all journal entries ordered by date (trip order — reversed below
  // for newest-arrived-day-first). Entries are per-Traveller (ARCH-DAT-6): a
  // date may hold several, one per author, so this always returns every
  // author's entry for every date.
  const entries = await db.journalEntry.findMany({
    where: { tripId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      body: true,
      updatedAt: true,
      hiddenFromShares: true,
      authorId: true,
      author: { select: TRAVELLER_SELECT },
    },
  });

  // Fetch all journal photos for this trip in one query, keyed by
  // targetId (date) and, within a date, by uploadedById (spec K: a photo
  // sits with its own author's note, not in a separate shared strip).
  // `uploadedBy` is selected so an author who has only ever added a photo —
  // no note, no JournalEntry row — can still be attributed (uploadedById
  // always exists on an Attachment; this is that photo's "home").
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
      uploadedById: true,
      createdAt: true,
      uploadedBy: { select: TRAVELLER_SELECT },
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

  // Build a map: date → entries (every Traveller's entry for that date, not
  // just one — ARCH-DAT-6).
  const entriesByDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const existing = entriesByDate.get(entry.date) ?? [];
    existing.push(entry);
    entriesByDate.set(entry.date, existing);
  }

  // The full timeline: every arrived day (spec K ruling — lets you write
  // ANY arrived day, not only ones someone has already written on) union
  // any date that happens to carry data outside that window (legacy rows
  // from before the window was enforced). Newest-arrived-day first.
  const writableSet = new Set(writable);
  const dataDates = new Set<string>([...entries.map((e) => e.date), ...photosByDate.keys()]);
  const sortedDates = Array.from(new Set([...writable, ...dataDates])).sort().reverse();

  if (sortedDates.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        tone="lilac"
        title="No journal entries yet"
        description="Capture the trip as you go — notes and photos, day by day."
      />
    );
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
          const canWriteThisDate = writableSet.has(date);

          // Group this day's photos by author, so each Traveller's photo(s)
          // ride with their own note (spec K), not in a shared strip.
          const photosByAuthor = new Map<string, typeof dayPhotos>();
          for (const photo of dayPhotos) {
            const existing = photosByAuthor.get(photo.uploadedById) ?? [];
            existing.push(photo);
            photosByAuthor.set(photo.uploadedById, existing);
          }

          // Every author who wrote a note or added a photo, plus the
          // viewer's own slot whenever the day is still writable — even
          // with nothing in it yet, so any arrived day can be written from
          // here. The viewer's id goes first when present.
          const authorIds: string[] = [];
          if (canWriteThisDate) authorIds.push(user.id);
          for (const entry of dayEntries) {
            if (!authorIds.includes(entry.authorId)) authorIds.push(entry.authorId);
          }
          for (const authorId of photosByAuthor.keys()) {
            if (!authorIds.includes(authorId)) authorIds.push(authorId);
          }

          const avatarTravellers = Array.from(
            new Map(dayEntries.map((e) => [e.author.id, e.author] as const)).values(),
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
                {avatarTravellers.length > 0 ? (
                  <div className="flex shrink-0 -space-x-2" aria-hidden="true">
                    {avatarTravellers.map((a) => (
                      <TravellerAvatar key={a.id} traveller={a} size={32} />
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Every Traveller's note + photo(s) for this date, side by
                  side (spec K) — the viewer's own is editable in place
                  (reuses JournalEditor), even when blank. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {authorIds.map((authorId) => {
                  const entry = dayEntries.find((e) => e.authorId === authorId) ?? null;
                  const authorPhotos = photosByAuthor.get(authorId) ?? [];

                  if (authorId === user.id && canWriteThisDate) {
                    return (
                      <JournalEditor
                        key={authorId}
                        tripId={tripId}
                        date={date}
                        initialBody={entry?.body ?? ""}
                        updatedAt={entry?.updatedAt ?? null}
                        photo={authorPhotos[0] ?? null}
                        hiddenFromShares={entry?.hiddenFromShares ?? false}
                        framed={false}
                      />
                    );
                  }

                  const traveller: TravellerLike | null =
                    entry?.author ?? authorPhotos[0]?.uploadedBy ?? null;
                  const asAttachmentViews: AttachmentView[] = authorPhotos;

                  return (
                    <JournalEntryView
                      key={authorId}
                      body={entry?.body ?? ""}
                      updatedAt={entry?.updatedAt ?? authorPhotos[0]?.createdAt ?? new Date(0)}
                      author={traveller}
                      photos={asAttachmentViews}
                      framed={false}
                    />
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
