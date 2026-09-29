import { cn } from "@/lib/cn";
import { JournalEditor } from "@/components/trip/journal-editor";
import { JournalEntryView } from "@/components/trip/journal-entry-view";
import { JournalCompose } from "@/components/trip/day/journal-compose";
import type { DayViewData } from "@/lib/day-view-loader";

/**
 * The Day view's Journal card (spec decision 6): on a future date the honest
 * "Opens on the day" copy and no editor; on the day and after, co-Travellers'
 * entries (read-only) above the viewer's own autosaving editor. An empty card
 * (spec 2026-09-29 D6) stays compact: a one-line prompt via `JournalCompose`,
 * opening the full editor only once the Traveller chooses to write.
 */
export function JournalCard({
  tripId,
  date,
  dateLabel,
  journal,
  className,
}: {
  tripId: string;
  date: string;
  dateLabel: string;
  journal: DayViewData["journal"];
  className?: string;
}) {
  // Empty = the day is open, no co-Traveller has written, and the viewer's own
  // entry has no words and no photo (spec 2026-09-29 D6).
  const mine = journal.mine;
  const empty =
    journal.open &&
    journal.others.length === 0 &&
    mine != null &&
    mine.body.trim() === "" &&
    mine.photo == null &&
    (mine.extraPhotos?.length ?? 0) === 0;
  return (
    <section
      data-journal
      aria-labelledby="journal-heading"
      className={cn("flex flex-col gap-3 rounded-3xl border-2 border-border bg-card px-[22px] py-[18px] shadow-hard-3", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="journal-heading" className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
          Journal
        </h2>
        {!journal.open ? <span className="text-[13px] font-semibold text-muted-foreground">Opens on the day</span> : null}
      </div>
      {!journal.open ? (
        <p className="text-sm font-medium text-muted-foreground">Come back on {dateLabel} to jot down a memory.</p>
      ) : null}
      {journal.others.map((o) => (
        <JournalEntryView key={o.authorId} body={o.body} updatedAt={o.updatedAt} author={o.author} photos={o.photos} framed={false} />
      ))}
      {journal.open && mine ? (
        empty ? (
          <JournalCompose
            tripId={tripId}
            date={date}
            initialBody={mine.body}
            updatedAt={mine.updatedAt}
            photo={mine.photo}
            extraPhotos={mine.extraPhotos}
            hiddenFromShares={mine.hiddenFromShares}
            framed={false}
          />
        ) : (
          <JournalEditor
            tripId={tripId}
            date={date}
            initialBody={mine.body}
            updatedAt={mine.updatedAt}
            photo={mine.photo}
            extraPhotos={mine.extraPhotos}
            hiddenFromShares={mine.hiddenFromShares}
            framed={false}
          />
        )
      ) : null}
    </section>
  );
}
