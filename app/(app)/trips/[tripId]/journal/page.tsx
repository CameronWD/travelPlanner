import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { formatLongDate, formatDayLabel } from "@/lib/dates";
import { loadJournalWindow } from "@/lib/journal-window-loader";
import { journalWritableDates } from "@/lib/journal-window";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { JournalEntryView } from "@/components/trip/journal-entry-view";
import { JournalEditor } from "@/components/trip/journal-editor";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import { groupJournalDayByAuthor, isMeaningfulJournalEntry } from "@/lib/journal-authors";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";

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
  const [shell, slug] = await Promise.all([readTripShell(tripId), tripSlugFor(tripId)]);

  const header = (
    <PageHeader
      eyebrow={shell?.name}
      title="Journal"
      trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
    />
  );

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
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={BookOpen}
          tone="lilac"
          title={`Opens on day 1 — ${formatDayLabel(window.startDate)}`}
          description="Come back once your trip gets underway to start writing."
        />
      </div>
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

  // A blank row with no photo only carries its author's "Keep off Share
  // links" switch (spec L) — it is not an entry: it isn't counted and
  // doesn't make a date part of the timeline (final review #10).
  const meaningfulEntries = entries.filter((entry) =>
    isMeaningfulJournalEntry(
      entry,
      new Set((photosByDate.get(entry.date) ?? []).map((p) => p.uploadedById)),
    ),
  );

  // The full timeline: every arrived day (spec K ruling — lets you write
  // ANY arrived day, not only ones someone has already written on) union
  // any date that happens to carry data outside that window (legacy rows
  // from before the window was enforced). Newest-arrived-day first.
  const writableSet = new Set(writable);
  const dataDates = new Set<string>([
    ...meaningfulEntries.map((e) => e.date),
    ...photosByDate.keys(),
  ]);
  const sortedDates = Array.from(new Set([...writable, ...dataDates])).sort().reverse();

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={BookOpen}
          tone="lilac"
          title="No journal entries yet"
          description="Capture the trip as you go — notes and photos, day by day."
        />
      </div>
    );
  }

  const entryCount =
    meaningfulEntries.length === 1 ? "1 entry" : `${meaningfulEntries.length} entries`;
  const photoCount =
    photos.length === 0 ? null : photos.length === 1 ? "1 photo" : `${photos.length} photos`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={shell?.name}
        title="Journal"
        meta={photoCount ? `${entryCount} · ${photoCount}` : entryCount}
        metaOnMobile
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
      />

      <div className={JOURNAL_READING_WIDTH_CLASS}>
        {sortedDates.map((date, i) => {
          const dayEntries = entriesByDate.get(date) ?? [];
          const dayPhotos = photosByDate.get(date) ?? [];
          const canWriteThisDate = writableSet.has(date);

          // Every author who wrote a note or added a photo, each with all
          // of their photos (spec K — shared with the Day view), plus the
          // viewer's own slot whenever the day is still writable — even
          // with nothing in it yet, so any arrived day can be written from
          // here. The viewer's slot comes first.
          const slots = groupJournalDayByAuthor({
            entries: dayEntries,
            photos: dayPhotos,
            viewerId: user.id,
            includeViewerSlot: canWriteThisDate,
          });

          const avatarTravellers = Array.from(
            new Map(
              slots.flatMap((slot) => {
                // Only authors with something on the day (a blank editor
                // slot or switch-only row has no avatar).
                const a = slot.entry?.body ? slot.entry.author : slot.photos[0]?.uploadedBy;
                return a ? [[a.id, a] as const] : [];
              }),
            ).values(),
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
                    href={tripPath(slug, `/day/${date}`)}
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
                {slots.map(({ authorId, entry, photos: authorPhotos, isViewer }) => {
                  if (isViewer && canWriteThisDate) {
                    const [first = null, ...extras] = authorPhotos;
                    return (
                      <JournalEditor
                        key={authorId}
                        tripId={tripId}
                        date={date}
                        initialBody={entry?.body ?? ""}
                        updatedAt={entry?.updatedAt ?? null}
                        photo={first}
                        extraPhotos={extras}
                        hiddenFromShares={entry?.hiddenFromShares ?? false}
                        framed={false}
                      />
                    );
                  }

                  const traveller: TravellerLike | null =
                    entry?.author ?? authorPhotos[0]?.uploadedBy ?? null;

                  return (
                    <JournalEntryView
                      key={authorId}
                      body={entry?.body ?? ""}
                      updatedAt={entry?.updatedAt ?? authorPhotos[0]?.createdAt ?? new Date(0)}
                      author={traveller}
                      photos={authorPhotos}
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
