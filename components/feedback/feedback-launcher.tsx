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

/**
 * Where a draft is *about*, frozen the moment composing begins.
 *
 * The panel is non-modal from md up, so the page behind it stays navigable
 * while the box is open — a traveller can start typing on Budget, click
 * through to Plan editor, then press Send. Recording where the remark was
 * written is the entire point of the captured context (ADR 0040), so a note
 * must be stamped with wherever the user *was* when they started writing it,
 * not wherever they land before Send.
 */
type DraftContext = {
  route: string;
  pageLabel: string;
  tripId: string | null;
  tripName: string | null;
};

const EMPTY_LOG = "No feedback yet. Tell me what's annoying.";
const OFFLINE_SAVED = "Saved — it'll send when you're back online.";
const SEND_FAILED = "Couldn't send that just yet — it's saved and will retry.";
const STORAGE_FAILED =
  "Couldn't save that on this device — your words are still in the box, so try again.";
const DELETE_FAILED = "Couldn't remove that feedback just yet.";

/**
 * The breakpoint the docked panel changes shape at — it must stay in step with
 * the `docked` sheet variant's `md:` styles in components/ui/sheet.tsx.
 */
const DOCKED_FROM = "(min-width: 768px)";

/**
 * Is the panel in its docked shape — a card beside a page you can still use —
 * rather than filling the screen?
 *
 * Read once, when the panel opens; never while rendering. On the server there
 * is no `window` to ask, and the safe answer there is `false`: a page that is
 * scroll-locked for a moment longer than it needed to be is a nuisance, but a
 * full-screen opaque panel with the page still scrolling and still reachable by
 * a screen reader behind it is a bug.
 */
function isDockedViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(DOCKED_FROM).matches;
}

/** Matches the server schema's cap (lib/validations/feedback.ts). */
const BODY_MAX = 4000;
/** The count only appears once it is worth knowing — a counter you can ignore. */
const COUNT_FROM = BODY_MAX - 200;

/** A note the server refused is gone; say so rather than dropping it quietly. */
function discardedMessage(discarded: QueuedFeedbackNote[]): string {
  return discarded.length === 1
    ? "A saved Feedback note couldn't be accepted and has been discarded."
    : `${discarded.length} saved Feedback notes couldn't be accepted and have been discarded.`;
}

/** Copy for a closed note's badge. An OPEN note wears no badge. */
const STATUS_LABEL: Partial<Record<FeedbackNoteView["status"], string>> = {
  DONE: "Done",
  WONTFIX: "Won't fix",
};

/**
 * The badge a note wears, or null for an open one. An unrecognised status
 * shows itself rather than vanishing — a struck-through note with no badge
 * explaining why is worse than an unfamiliar word (lib/feedback-inbox.ts does
 * the same). Returns both the label and variant so they cannot drift.
 */
function badgeFor(
  status: FeedbackNoteView["status"],
): { label: string | null; variant: "success" | "muted" } {
  if (status === "OPEN") return { label: null, variant: "muted" };
  const label = STATUS_LABEL[status] ?? status;
  const variant = status === "DONE" ? "success" : "muted";
  return { label, variant };
}

/**
 * Where a note came from, for the meta line above its body: the Trip it was
 * written in (when there was one) and always the screen — the page label alone
 * is ambiguous across trips, and the trip name alone hides the screen, which is
 * the part a fix starts from.
 */
function whereWritten(note: {
  tripName: string | null;
  pageLabel: string;
}): string {
  return note.tripName ? `${note.tripName} · ${note.pageLabel}` : note.pageLabel;
}

/**
 * Did the note actually reach storage?
 *
 * `enqueue` reports failure by omission: when localStorage rejects the write
 * (quota, private mode) it returns the queue *as persisted*, without our note
 * (see lib/feedback-queue.ts). Silently treating that as saved is how a written
 * note gets lost, which is the one thing this feature exists to prevent.
 */
function isQueued(queue: QueuedFeedbackNote[], clientKey: string): boolean {
  return queue.some((q) => q.clientKey === clientKey);
}

/**
 * The floating Feedback panel — a remark about TEEPEE itself, from any screen.
 *
 * Bottom-**right**: the panel takes the shape and position of a site's chat
 * widget, but it is a log, not a conversation — from md up it stays open above
 * the trigger, and clicking the page behind it does not dismiss it, because the
 * page there is genuinely still usable. Below md it fills the screen and is
 * modal instead (see `docked`). Toasts (`components/ui/toast.tsx`) keep out of
 * its way: above the trigger below md, in the opposite corner from md up.
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
  // Which shape the panel opened in. Below md it fills the screen, so "the page
  // stays usable behind it" is meaningless and the panel has to behave like a
  // proper dialog: scroll-locked, with everything behind it hidden from screen
  // readers. From md up the page beside it really is usable, so the panel stays
  // non-modal. Decided at open time — see isDockedViewport.
  const [docked, setDocked] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [sent, setSent] = React.useState<FeedbackNoteView[]>([]);
  const [pending, setPending] = React.useState<QueuedFeedbackNote[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  // Frozen at the first keystroke of a draft; null while the box is empty, so
  // the *next* draft picks up wherever the user is then. See DraftContext.
  const [draftContext, setDraftContext] = React.useState<DraftContext | null>(
    null,
  );

  const pageLabel = pageLabelForRoute(pathname);

  const currentContext = React.useCallback(
    (): DraftContext => ({
      route: pathname,
      pageLabel,
      tripId: trip?.tripId ?? tripIdFromRoute(pathname),
      tripName: trip?.tripName ?? null,
    }),
    [pathname, pageLabel, trip],
  );

  /**
   * The box, not the send button, is where a draft's context is decided:
   * empty → non-empty freezes it (composing has begun, from wherever the
   * user is right now); non-empty → empty releases it (the draft is gone,
   * so the next one should track the live route again).
   */
  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const wasEmpty = body.trim().length === 0;
    const willBeEmpty = value.trim().length === 0;
    setBody(value);
    if (wasEmpty && !willBeEmpty) {
      setDraftContext(currentContext());
    } else if (!wasEmpty && willBeEmpty) {
      setDraftContext(null);
    }
  }

  const refresh = React.useCallback(async () => {
    const result = await listFeedbackNotes();
    if (result.success) setSent(result.notes);
  }, []);

  const flush = React.useCallback(async () => {
    const result = await flushQueue(async (note) => {
      // QueuedFeedbackNote is shaped as the action's input on purpose (ADR
      // 0041), so a queued note can be replayed exactly as it was written.
      //
      // A rejection is the server's schema saying no, which no amount of
      // retrying changes; only a throw (dead connection, dead server) is worth
      // trying again.
      const res = await createFeedbackNote(note);
      return res.success ? "sent" : "rejected";
    });
    if (result.discarded.length > 0) {
      toast({
        variant: "destructive",
        title: discardedMessage(result.discarded),
        description: result.discarded[0].body.slice(0, 120),
      });
    }
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

  /** Opens the panel, pinning the shape it opened in for as long as it is up. */
  function openPanel() {
    setDocked(isDockedViewport());
    setOpen(true);
  }

  /** The box is empty again: clears the text and releases the frozen context. */
  function clearDraft() {
    setBody("");
    setDraftContext(null);
  }

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || isSending) return;

    // The box went empty→non-empty at least once to get here, so it should
    // have frozen a context already; falling back to the live one only
    // guards against a draft that somehow arrived pre-filled.
    const context = draftContext ?? currentContext();

    const note: QueuedFeedbackNote = {
      clientKey: newClientKey(),
      body: trimmed,
      route: context.route,
      pageLabel: context.pageLabel,
      tripId: context.tripId,
      tripName: context.tripName,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent.slice(0, 512),
      authoredAt: new Date().toISOString(),
    };

    if (!online) {
      const queue = enqueue(note);
      setPending(queue);
      if (!isQueued(queue, note.clientKey)) {
        // Nowhere to put it — the box is the only copy left, so keep it there.
        toast({ variant: "destructive", title: STORAGE_FAILED });
        return;
      }
      clearDraft();
      toast({ title: OFFLINE_SAVED });
      return;
    }

    // A send that didn't land is only safe if the note is sitting in the queue.
    // When it is, clear the box: the Pending entry is the receipt, and leaving
    // the text behind invites a second Send and so a second note. When it
    // isn't, the box is the only copy — keep it and say so.
    const failedSend = (persisted: boolean) => {
      if (persisted) {
        clearDraft();
        toast({ variant: "destructive", title: SEND_FAILED });
      } else {
        toast({ variant: "destructive", title: STORAGE_FAILED });
      }
    };

    setIsSending(true);
    // Queue first: a crash, a closed tab or a dead connection mid-send must
    // never lose what was written. It is dequeued only once the server says so.
    const queue = enqueue(note);
    setPending(queue);
    const queued = isQueued(queue, note.clientKey);
    try {
      const result = await createFeedbackNote(note);
      if (result.success) {
        setPending(removeFromQueue(note.clientKey));
        setSent((prev) => [...prev, result.note]);
        clearDraft();
        return;
      }
      setPending(readQueue());
      failedSend(queued);
    } catch {
      setPending(readQueue());
      failedSend(queued);
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
      {/*
        Below md the trip tab bar (components/trip/mobile-tab-bar.tsx) is fixed
        to the bottom at the same z-40 and stands ~3.94rem tall (1px border +
        py-3 + size-5 icon + gap-0.5 + text-xs) plus the safe area — at a 1rem
        offset it would paint over this button and swallow the taps. 5rem is the
        clearance the trip layout already reserves for that bar; from md up the
        bar is hidden and the button drops back to 1rem.

        `print:hidden` keeps it off the printed itinerary
        (app/(app)/trips/[tripId]/print/page.tsx hides app chrome by tag and by
        `.print-hide`, neither of which this floating button is).
      */}
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label="Leave feedback about TEEPEE"
        onClick={openPanel}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 size-11 rounded-full shadow-lg md:bottom-[calc(1rem+env(safe-area-inset-bottom))] print:hidden"
      >
        <MessageSquarePlus className="size-5" aria-hidden />
      </Button>

      {/*
        `hideOverlay` tracks `docked` rather than being always-on: Radix hangs
        the scroll lock off the overlay (it wraps the content in RemoveScroll)
        and renders no overlay at all unless the dialog is modal. So below md
        the overlay is what stops the page scrolling underneath a panel that
        covers it — and it is invisible there anyway, sitting behind an opaque
        full-screen surface. From md up there is no overlay and no lock, which
        is the whole point of the docked shape.
      */}
      <Sheet open={open} onOpenChange={setOpen} modal={!docked}>
        <SheetContent
          side="docked"
          hideOverlay={docked}
          className="gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          /*
            A chat widget does not vanish the moment you touch the page behind
            it, and neither does this: the glossary promises the page stays
            visible *and usable*, which is impossible if the first click out
            there is spent closing the panel. The X and Escape close it.
          */
          onInteractOutside={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Feedback</SheetTitle>
            {/*
              Once a draft has frozen its context (see DraftContext) the panel
              must name the *frozen* page, not the live one — after navigating
              mid-draft, "You're on Budget" would promise the opposite of where
              the note will actually be filed. While the box is empty there is
              no frozen context and the label tracks the route, as it should.
            */}
            <SheetDescription>{`You're on ${draftContext?.pageLabel ?? pageLabel}`}</SheetDescription>
          </SheetHeader>

          {entries.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{EMPTY_LOG}</p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
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
            {/*
              maxLength matches the server's cap. Without it a longer note is
              accepted here, queued, and then rejected by the schema on every
              retry for as long as the device lives.
            */}
            <Textarea
              value={body}
              onChange={handleBodyChange}
              placeholder="What's on your mind?"
              aria-label="Your feedback about TEEPEE"
              rows={3}
              maxLength={BODY_MAX}
            />
            <div className="flex items-center gap-2">
              {body.length >= COUNT_FROM ? (
                <p
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "text-xs",
                    body.length >= BODY_MAX
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {body.length}/{BODY_MAX}
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                loading={isSending}
                disabled={isSending || body.trim().length === 0}
                onClick={() => void handleSend()}
              >
                Send
              </Button>
            </div>
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
  const { label: statusLabel, variant: badgeVariant } = badgeFor(note.status);
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
      {statusLabel ? <Badge variant={badgeVariant}>{statusLabel}</Badge> : null}
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
