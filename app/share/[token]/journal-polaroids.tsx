import type { CSSProperties } from "react";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { avatarInput, shareTraveller, type ShareTraveller } from "@/lib/share-traveller";
import { polaroidTilt, type ShareStage } from "@/lib/share-view";
import { formatDayLabel } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { TravellerLike } from "@/lib/traveller";
import { JournalExpand } from "./journal-expand";

// ---------------------------------------------------------------------------
// "How it's going" / "How it went" — the Journal section on a Share link
// whose includeJournal dial is on (SHARE.md §8 / ADR 0051 amendment).
// Display name + avatar: the avatar shows the Traveller's photo only when
// the link's showTravellers is on (shareTraveller/avatarInput, gated by the
// `showPhoto` passed into buildJournalDays below); otherwise initials, via
// TravellerAvatar's Radix AvatarFallback — which also covers the photo
// 404-ing (the author left the trip). Photos are served through the
// link-scoped route (app/share/[token]/journal-photo/[id]/route.ts), never
// `/api/attachments/:id`, so a Share link never reaches the session-gated
// route.
// ---------------------------------------------------------------------------

export interface ShareJournalEntryRow {
  date: string;
  authorId: string;
  body: string;
  author: TravellerLike;
}

export interface ShareJournalPhotoRow {
  id: string;
  /** The date (YYYY-MM-DD) this Journal photo is for. */
  targetId: string | null;
  uploadedById: string;
  uploadedBy: TravellerLike;
}

export interface JournalPolaroidsProps {
  token: string;
  /** Arrived Trip days (any order) — re-sorted newest first below. */
  dates: string[];
  entries: ShareJournalEntryRow[];
  photos: ShareJournalPhotoRow[];
  stage: ShareStage;
  stopNameByDate: Record<string, string>;
  showTravellers: boolean;
}

interface JournalDayEntryView {
  /** Stable React list key — a date's entries are one per author. */
  authorId: string;
  authorFirstName: string;
  author: ShareTraveller;
  body: string;
  photoUrl: string | null;
}

export interface JournalDayView {
  dateISO: string;
  entries: JournalDayEntryView[];
}

export interface JournalCard {
  key: string;
  dateISO: string;
  place: string | null;
  author: ShareTraveller;
  body: string;
  photoUrl: string | null;
  tilt: number;
}

/**
 * Pure: shapes raw entry/photo rows into per-day, per-author view models.
 *
 * `entries` and `photos` are trusted to already exclude anything
 * `hiddenFromShares` — that filtering happens in the `where` of the two
 * queries in `app/share/[token]/page.tsx`, not here (ADR 0051 amendment:
 * "such an entry (note and photo) is never selected for any link" — never
 * selected, not merely never rendered). This function does no hidden-ness
 * filtering of its own.
 *
 * - Newest day first.
 * - A photo with no entry row at all still surfaces its author, same union
 *   `lib/journal-loader.ts`'s `loadTodaysJournal` uses for Today's Journal
 *   on Home.
 * - A day with nothing to show (no entry, no photo) is dropped rather than
 *   rendered empty.
 * - `opts.showPhoto` gates the avatar photo (and focal point) exactly as
 *   `shareTraveller` does — off unless the link's showTravellers dial is on.
 */
export function buildJournalDays(
  token: string,
  dates: string[],
  entries: ShareJournalEntryRow[],
  photos: ShareJournalPhotoRow[],
  opts: { showPhoto: boolean } = { showPhoto: false },
): JournalDayView[] {
  const sortedDates = [...new Set(dates)].sort().reverse();

  const days: JournalDayView[] = [];
  for (const date of sortedDates) {
    const dayEntries: JournalDayEntryView[] = [];
    const seenAuthors = new Set<string>();

    for (const entry of entries) {
      if (entry.date !== date) continue;
      const photo = photos.find((p) => p.targetId === date && p.uploadedById === entry.authorId);
      const author = shareTraveller(entry.author, { token, showPhoto: opts.showPhoto });
      dayEntries.push({
        authorId: entry.authorId,
        authorFirstName: author.firstName,
        author,
        body: entry.body,
        photoUrl: photo ? `/share/${token}/journal-photo/${photo.id}` : null,
      });
      seenAuthors.add(entry.authorId);
    }

    for (const photo of photos) {
      if (photo.targetId !== date) continue;
      if (seenAuthors.has(photo.uploadedById)) continue;
      const author = shareTraveller(photo.uploadedBy, { token, showPhoto: opts.showPhoto });
      dayEntries.push({
        authorId: photo.uploadedById,
        authorFirstName: author.firstName,
        author,
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

/** Flattens `buildJournalDays` into one polaroid per entry, newest day first. */
export function buildJournalCards(p: JournalPolaroidsProps): JournalCard[] {
  const days = buildJournalDays(p.token, p.dates, p.entries, p.photos, { showPhoto: p.showTravellers });
  const cards: JournalCard[] = [];
  for (const day of days) {
    for (const entry of day.entries) {
      const key = `${day.dateISO}:${entry.authorId}`;
      cards.push({
        key,
        dateISO: day.dateISO,
        place: p.stopNameByDate[day.dateISO] ?? null,
        author: entry.author,
        body: entry.body,
        photoUrl: entry.photoUrl,
        tilt: polaroidTilt(key),
      });
    }
  }
  return cards;
}

function JournalPolaroidCard({
  card,
  stage,
  eager = false,
}: {
  card: JournalCard;
  stage: ShareStage;
  eager?: boolean;
}) {
  const { dateISO, place, author, body, photoUrl, tilt } = card;
  return (
    <article
      data-slot="share-polaroid"
      // A variable, not an inline rotate, so the S9 hover in globals.css can
      // straighten the card.
      style={{ "--tp-tilt": `${tilt}deg` } as CSSProperties}
      className="rounded-xl border-2 border-border bg-card p-[9px] pb-[14px] shadow-hard-4 [rotate:var(--tp-tilt)]"
    >
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={`Photo from ${author.firstName}`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          width={400}
          height={300}
          className={cn(
            "w-full rounded-[5px] border-2 border-border object-cover",
            stage === "after" ? "aspect-square lg:aspect-[4/3]" : "aspect-[4/3]",
          )}
        />
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <TravellerAvatar traveller={avatarInput(author)} size={24} className="size-[22px]" />
        <span className="sr-only">{author.firstName}</span>
        <p className="min-w-0 truncate text-xs font-extrabold">
          {formatDayLabel(dateISO)}
          {place ? ` · ${place}` : ""}
        </p>
      </div>
      {body && (
        <p className={cn("mt-1 line-clamp-3 whitespace-pre-wrap font-medium leading-[1.4]", photoUrl ? "text-sm" : "text-base")}>
          {body}
        </p>
      )}
    </article>
  );
}

export function JournalPolaroids(p: JournalPolaroidsProps) {
  const cards = buildJournalCards(p);
  if (cards.length === 0) return null;

  const heading = (
    <>
      <h2 id="journal-heading" className="font-display text-2xl font-extrabold tracking-[-0.03em] lg:text-[28px]">
        {p.stage === "after" ? "How it went" : "How it's going"}
      </h2>
      <span className="hidden text-sm font-semibold text-muted-foreground lg:inline">From their journal</span>
    </>
  );

  return (
    <section aria-labelledby="journal-heading" data-testid="share-journal">
      <JournalExpand
        heading={heading}
        count={cards.length}
        mobileLimit={p.stage === "after" ? 4 : 2}
        mobileLayout={p.stage === "after" ? "grid" : "scroller"}
        items={cards.map((card, i) => (
          // The journal can sit above the fold on the "after" share page; its first photo is not lazy.
          <JournalPolaroidCard key={card.key} card={card} stage={p.stage} eager={i === 0} />
        ))}
      />
    </section>
  );
}
