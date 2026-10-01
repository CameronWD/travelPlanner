import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/relative-time";
import type { FeedbackReviewView } from "@/server/actions/feedback";

export interface FeedbackReviewPanelProps {
  notes: FeedbackReviewView[];
  /** The server's instant (CD-05), same as the page's other panels. */
  now: Date;
}

/**
 * Needs-review Feedback notes, read-only (spec 2026-10-02 §D; CONTEXT.md
 * "Admin queue"). No Accept, no Decline, no Delete: the two scripts stay the
 * only writers of Feedback status (ADR 0040), so the id is shown for the
 * command to be typed. A Server Component — nothing here needs state, unlike
 * the panels beside it.
 */
export function FeedbackReviewPanel({ notes, now }: FeedbackReviewPanelProps) {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No Feedback notes waiting for review.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {notes.map((note) => (
        <li key={note.id}>
          <Card radius="md" shadow={1} className="flex flex-col gap-2 p-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="text-sm font-medium text-foreground">{note.authorName}</span>
              <span>{note.pageLabel}</span>
              {note.tripName ? <span>{note.tripName}</span> : null}
              {note.siteChip ? <Badge variant="muted">{note.siteChip}</Badge> : null}
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>{relativeTime(new Date(note.authoredAt), now)}</span>
              <code className="select-all font-mono">{note.id}</code>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
