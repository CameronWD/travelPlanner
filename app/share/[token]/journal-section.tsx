import {
  JournalPolaroids,
  buildJournalDays,
  type ShareJournalEntryRow,
  type ShareJournalPhotoRow,
} from "./journal-polaroids";

export { buildJournalDays };

// Task 15 deletes this file once app/share/[token]/page.tsx switches to
// JournalPolaroids directly (with `stage`, `stopNameByDate` and
// `showTravellers` wired from the page's own data). Until then this keeps
// `page.tsx`'s existing call site — { token, dates, entries, photos } —
// compiling unchanged (dispatch binding: "Keep the existing data props of
// JournalSection"), rather than re-exporting JournalPolaroids directly under
// this name, which would make those three now-required props a type error
// at the one call site this shim exists to protect.
//
// Defaults chosen to reproduce the outgoing JournalSection's behaviour
// exactly: it always read "How it's going" (stage "during"), it never
// looked up a Stop name (stopNameByDate {}), and it never showed a
// Traveller's photo (showTravellers false) — display name only.
export interface JournalSectionProps {
  token: string;
  dates: string[];
  entries: ShareJournalEntryRow[];
  photos: ShareJournalPhotoRow[];
}

export function JournalSection({ token, dates, entries, photos }: JournalSectionProps) {
  return (
    <JournalPolaroids
      token={token}
      dates={dates}
      entries={entries}
      photos={photos}
      stage="during"
      stopNameByDate={{}}
      showTravellers={false}
    />
  );
}
