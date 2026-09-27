import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { travellerName, type TravellerLike } from "@/lib/traveller";
import { JournalEditor } from "@/components/trip/journal-editor";
import { AttachmentLink } from "@/components/trip/attachment-link";
import type { AttachmentView } from "@/components/trip/attachment-list";

// ---------------------------------------------------------------------------
// Today's journal — Travelling Home (spec K): the viewer's own entry for
// today, editable in place, plus every co-Traveller's for the same day,
// read-only. Props are server-fed by `lib/journal-loader.ts`'s
// `loadTodaysJournal` — this component itself does no data loading, so
// Task 17's desktop placement can reuse the exact same load.
// ---------------------------------------------------------------------------

export interface TodaysJournalMine {
  body: string;
  updatedAt: Date | null;
  hiddenFromShares: boolean;
}

export interface TodaysJournalOtherEntry {
  traveller: TravellerLike;
  body: string;
  photo: AttachmentView | null;
}

export interface TodaysJournalProps {
  tripId: string;
  date: string;
  mine: TodaysJournalMine | null;
  minePhoto: AttachmentView | null;
  others: TodaysJournalOtherEntry[];
  /** h3 on the phone column (default); h2 as a desktop Home tile (spec D). */
  headingLevel?: 2 | 3;
}

function OtherEntry({ entry }: { entry: TodaysJournalOtherEntry }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <TravellerAvatar traveller={entry.traveller} size={24} />
        <span>{travellerName(entry.traveller)}</span>
      </div>
      {entry.body ? (
        <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground text-pretty">
          {entry.body}
        </p>
      ) : null}
      {entry.photo ? (
        <AttachmentLink
          href={entry.photo.url}
          mime={entry.photo.mime}
          label={`View photo ${entry.photo.filename}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.photo.url}
            alt={entry.photo.filename}
            className="h-24 w-24 rounded-md border-2 border-border object-cover transition-opacity hover:opacity-80"
          />
        </AttachmentLink>
      ) : null}
    </div>
  );
}

export function TodaysJournal({ tripId, date, mine, minePhoto, others, headingLevel = 3 }: TodaysJournalProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Card className="p-4" data-testid="todays-journal">
      <div className="flex items-center gap-2">
        <BookOpen className="size-[18px] text-foreground" strokeWidth={2.5} aria-hidden />
        <Heading className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          Today&apos;s journal
        </Heading>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <JournalEditor
          tripId={tripId}
          date={date}
          initialBody={mine?.body ?? ""}
          updatedAt={mine?.updatedAt ?? null}
          photo={minePhoto}
          hiddenFromShares={mine?.hiddenFromShares ?? false}
          framed={false}
        />

        {others.length > 0 ? (
          <div className="flex flex-col gap-3 divide-y divide-border-soft [&>*:not(:first-child)]:pt-3">
            {others.map((entry) => (
              <OtherEntry key={entry.traveller.id} entry={entry} />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
