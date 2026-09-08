"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { useOnlineStatus } from "@/components/ui/use-online-status";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/relative-time";
import { pageLabelForRoute, tripIdFromRoute } from "@/lib/feedback-context";
import {
  enqueue,
  flushQueue,
  newClientKey,
  readQueue,
  removeFromQueue,
  type QueuedFeedbackNote,
} from "@/lib/feedback-queue";
import {
  getCurrentTrip,
  getCurrentTripServerSnapshot,
  subscribeToCurrentTrip,
} from "@/lib/feedback-trip-store";
import {
  createFeedbackNote,
  deleteFeedbackNote,
  listFeedbackNotes,
  type FeedbackNoteView,
} from "@/server/actions/feedback";

/** A note in the log: either landed on the server, or still queued locally. */
type LogEntry =
  | { kind: "sent"; note: FeedbackNoteView }
  | { kind: "pending"; note: QueuedFeedbackNote };

const EMPTY_LOG = "No feedback yet. Tell me what's annoying.";
const OFFLINE_SAVED = "Saved — it'll send when you're back online.";
const SEND_FAILED = "Couldn't send that just yet — it's saved and will retry.";
const DELETE_FAILED = "Couldn't remove that feedback just yet.";

/** Copy for a closed note's badge. An OPEN note wears no badge. */
const STATUS_LABEL: Record<FeedbackNoteView["status"], string | null> = {
  OPEN: null,
  DONE: "Done",
  WONTFIX: "Won't fix",
};

/**
 * Where a note was written, for the meta line above its body.
 *
 * Prefers the Trip name: the page label alone ("Budget") is ambiguous once
 * there are several trips, and the label is what the exported inbox groups by
 * anyway. Notes written outside a trip fall back to the page label.
 */
function whereWritten(note: {
  tripName: string | null;
  pageLabel: string;
}): string {
  return note.tripName ?? note.pageLabel;
}

/**
 * The floating Feedback panel — a remark about TEEPEE itself, from any screen.
 *
 * Bottom-**left** is deliberate: `components/ui/toast.tsx` owns the bottom
 * right and reserves 4rem of bottom padding on mobile.
 *
 * The panel reads as a log: every traveller's notes oldest-first, with anything
 * still queued on this device beneath them. Losing a written note is the
 * failure this whole feature exists to prevent, so an online send queues the
 * note *before* it goes out and only dequeues once the server confirms.
 *
 * `currentUserId` is optional because only the app shell knows who is signed
 * in; without it the panel is read-and-write but never offers to delete.
 */
export function FeedbackLauncher({
  currentUserId,
}: {
  currentUserId?: string;
}) {
  const pathname = usePathname();
  const online = useOnlineStatus();
  const trip = React.useSyncExternalStore(
    subscribeToCurrentTrip,
    getCurrentTrip,
    getCurrentTripServerSnapshot,
  );

  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [sent, setSent] = React.useState<FeedbackNoteView[]>([]);
  const [pending, setPending] = React.useState<QueuedFeedbackNote[]>([]);
  const [isSending, setIsSending] = React.useState(false);

  const pageLabel = pageLabelForRoute(pathname);

  const refresh = React.useCallback(async () => {
    const result = await listFeedbackNotes();
    if (result.success) setSent(result.notes);
  }, []);

  const flush = React.useCallback(async () => {
    const result = await flushQueue(async (note) => {
      // QueuedFeedbackNote is shaped as the action's input on purpose (ADR
      // 0041), so a queued note can be replayed exactly as it was written.
      const res = await createFeedbackNote(note);
      return res.success;
    });
    if (result.sent > 0 && open) await refresh();
  }, [open, refresh]);

  // Hydrate the queue after mount (localStorage does not exist on the server)
  // and drain it on mount and whenever the connection comes back.
  React.useEffect(() => {
    // Async IIFE — state lands asynchronously rather than synchronously in the
    // effect body (react-hooks/set-state-in-effect).
    void (async () => {
      if (online) await flush();
      setPending(readQueue());
    })();
  }, [online, flush]);

  // The log is only worth fetching while the panel is on screen.
  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      await refresh();
    })();
  }, [open, refresh]);

  const entries = React.useMemo<LogEntry[]>(() => {
    const landed = [...sent]
      .sort((a, b) => a.authoredAt.localeCompare(b.authoredAt))
      .map((note): LogEntry => ({ kind: "sent", note }));
    const queued = pending.map((note): LogEntry => ({ kind: "pending", note }));
    return [...landed, ...queued];
  }, [sent, pending]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || isSending) return;

    const note: QueuedFeedbackNote = {
      clientKey: newClientKey(),
      body: trimmed,
      route: pathname,
      pageLabel,
      tripId: trip?.tripId ?? tripIdFromRoute(pathname),
      tripName: trip?.tripName ?? null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent.slice(0, 512),
      authoredAt: new Date().toISOString(),
    };

    if (!online) {
      setPending(enqueue(note));
      setBody("");
      toast({ title: OFFLINE_SAVED });
      return;
    }

    setIsSending(true);
    // Queue first: a crash, a closed tab or a dead connection mid-send must
    // never lose what was written. It is dequeued only once the server says so.
    setPending(enqueue(note));
    try {
      const result = await createFeedbackNote(note);
      if (result.success) {
        setPending(removeFromQueue(note.clientKey));
        setSent((prev) => [...prev, result.note]);
        setBody("");
      } else {
        setPending(readQueue());
        toast({ variant: "destructive", title: SEND_FAILED });
      }
    } catch {
      setPending(readQueue());
      toast({ variant: "destructive", title: SEND_FAILED });
    } finally {
      setIsSending(false);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteFeedbackNote(id);
    if (result.success) {
      setSent((prev) => prev.filter((n) => n.id !== id));
    } else {
      toast({ variant: "destructive", title: DELETE_FAILED });
    }
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label="Leave feedback about TEEPEE"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 size-11 rounded-full shadow-lg"
      >
        <MessageSquarePlus className="size-5" aria-hidden />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Feedback</SheetTitle>
            <SheetDescription>{`You're on ${pageLabel}`}</SheetDescription>
          </SheetHeader>

          {entries.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{EMPTY_LOG}</p>
          ) : (
            <ul className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto pr-1">
              {entries.map((entry) =>
                entry.kind === "sent" ? (
                  <SentEntry
                    key={entry.note.id}
                    note={entry.note}
                    canDelete={
                      currentUserId !== undefined &&
                      entry.note.authorId === currentUserId
                    }
                    onDelete={handleDelete}
                  />
                ) : (
                  <PendingEntry key={entry.note.clientKey} note={entry.note} />
                ),
              )}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's on your mind?"
              aria-label="Your feedback about TEEPEE"
              rows={3}
            />
            <Button
              type="button"
              size="sm"
              className="self-end"
              loading={isSending}
              disabled={isSending || body.trim().length === 0}
              onClick={() => void handleSend()}
            >
              Send
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SentEntry({
  note,
  canDelete,
  onDelete,
}: {
  note: FeedbackNoteView;
  canDelete: boolean;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const statusLabel = STATUS_LABEL[note.status];
  const closed = statusLabel !== null;

  return (
    <li className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {note.authorName} · {whereWritten(note)} ·{" "}
          {relativeTime(new Date(note.authoredAt))}
        </p>
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm text-foreground",
            closed && "text-muted-foreground line-through decoration-1",
          )}
        >
          {note.body}
        </p>
      </div>
      {statusLabel ? <Badge variant="muted">{statusLabel}</Badge> : null}
      {canDelete ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Delete "${note.body.slice(0, 30)}"`}
          onClick={() => void onDelete(note.id)}
        >
          <Trash2 aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}

function PendingEntry({ note }: { note: QueuedFeedbackNote }) {
  return (
    <li className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {whereWritten(note)} · {relativeTime(new Date(note.authoredAt))}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {note.body}
        </p>
      </div>
      <Badge variant="muted">Pending</Badge>
    </li>
  );
}
