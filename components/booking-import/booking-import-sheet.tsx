"use client";

import * as React from "react";
import { FileUp, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";
import { groupProposals } from "@/lib/booking-import/group";
import { BOOKING_FILE_ACCEPT, checkBookingFile } from "@/lib/booking-import/limits";
import { BOOKING_IMPORT_MESSAGES as M } from "@/lib/booking-import/messages";
import { previewStopMap } from "@/lib/booking-import/preview";
import {
  proposalStopRefs,
  type BookingImportResult,
  type ConfirmProposalResult,
  type ImportContext,
  type Proposal,
  type StopProposal,
} from "@/lib/booking-import/types";
import { cn } from "@/lib/cn";
import { formatDateRange, formatNights, nightsBetween } from "@/lib/dates";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import { uploadAttachment } from "@/server/actions/attachments";
import { confirmProposal, importBooking } from "@/server/actions/booking-import";
import { ProposalCard, type ProposalStatus } from "./proposal-card";
import { ProposalEditor } from "./proposal-editor";

const TARGET_TYPE = { transport: "TRANSPORT", accommodation: "ACCOMMODATION", item: "ITEM", stop: "STOP" } as const;

interface Entry {
  proposal: Proposal;
  status: ProposalStatus;
  error: string | null;
}

type Phase =
  | { kind: "pick" }
  | { kind: "reading" }
  | { kind: "failed"; message: string; retry: boolean }
  | { kind: "results"; partial: boolean; context: ImportContext };

/** Plan header entry point (spec 2026-10-14 "Preview"); rendered only when AI is configured. */
export function BookingImportButton({ tripId, forkId }: { tripId: string; forkId: string | null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="md" className="text-hue-lilac-text hover:border-hue-lilac" onClick={() => setOpen(true)}>
        <Sparkles aria-hidden="true" />
        Import a booking
      </Button>
      <BookingImportSheet tripId={tripId} forkId={forkId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function BookingImportSheet({ tripId, forkId, open, onOpenChange }: { tripId: string; forkId: string | null; open: boolean; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import a booking</DialogTitle>
          <DialogDescription>Drop a ticket, confirmation or booking email, or paste its text. Nothing is added until you confirm it.</DialogDescription>
        </DialogHeader>
        {/* Mounted per open: closing the sheet drops everything, nothing is stored. */}
        {open && <BookingImportBody tripId={tripId} forkId={forkId} />}
      </DialogContent>
    </Dialog>
  );
}

function BookingImportBody({ tripId, forkId }: { tripId: string; forkId: string | null }) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "pick" });
  const [text, setText] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [entries, setEntries] = React.useState<Record<string, Entry>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const keptFile = React.useRef<File | null>(null);
  const attached = React.useRef(false);
  const createdStops = React.useRef<Record<string, string>>({});
  // A proposed Stop's clientId while some confirm() call is already creating
  // it: a sibling confirm needing the same Stop awaits this instead of
  // sending its own create (fix round 1 - concurrent confirms otherwise both
  // see an empty createdStops.current and each send the Stop, doubling it).
  const pendingStops = React.useRef<Record<string, Promise<{ id?: string; error?: string }>>>({});
  // A Proposal's own clientId while its own confirm() call is already
  // running: a second tap on the same card before claimStops resolves must
  // not send its booking a second time (fix round 2 - the card's status only
  // flips to "confirming" once React commits that state, which can land
  // after a near-simultaneous second tap).
  const confirming = React.useRef<Set<string>>(new Set());
  // The Proposal open in its form dialog (spec 2026-10-14 "Edit"), and how it
  // was before, so cancelling puts it back; drafts update the live entry.
  const [editing, setEditing] = React.useState<{ clientId: string; before: Proposal } | null>(null);

  function reset() {
    setPhase({ kind: "pick" });
    setEntries({});
    setEditing(null);
    setNotice(null);
    keptFile.current = null;
    attached.current = false;
    createdStops.current = {};
    pendingStops.current = {};
    confirming.current = new Set();
  }

  async function read(file: File | null, pasted: string) {
    let toSend = file;
    if (toSend) {
      const check = checkBookingFile(toSend);
      if (!check.ok) return setPhase({ kind: "failed", message: check.message, retry: false });
      toSend = await compressImage(toSend);
      const tooBig = oversizeUploadMessage(toSend);
      if (tooBig) return setPhase({ kind: "failed", message: tooBig, retry: false });
    }
    keptFile.current = toSend;
    setPhase({ kind: "reading" });
    const fd = new FormData();
    fd.set("tripId", tripId);
    if (forkId) fd.set("forkId", forkId);
    if (toSend) fd.set("file", toSend);
    else fd.set("text", pasted);
    let result: BookingImportResult;
    try {
      result = await importBooking(fd);
    } catch {
      result = { ok: false, reason: "busy", message: M.busy };
    }
    if (!result.ok) return setPhase({ kind: "failed", message: result.message, retry: result.reason === "busy" });
    setEntries(Object.fromEntries(result.proposals.map((p) => [p.clientId, { proposal: p, status: "pending" as const, error: null }])));
    setPhase({ kind: "results", partial: result.partial, context: result.context });
  }

  async function attachOriginal(kind: Proposal["kind"], id: string) {
    const file = keptFile.current;
    // Pasted text and .eml attach nothing (validateUpload takes images and PDFs only).
    if (attached.current || !file || /\.eml$/i.test(file.name) || file.type === "message/rfc822") return;
    attached.current = true;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("tripId", tripId);
    fd.set("targetType", TARGET_TYPE[kind]);
    fd.set("targetId", id);
    try {
      const r = await uploadAttachment(fd);
      if (!r.success) setNotice(M.attachFailed);
    } catch {
      setNotice(M.attachFailed);
    }
  }

  /**
   * Claims every proposed Stop a Proposal still needs (or, confirming a Stop
   * directly, the Stop itself): Stops nobody is creating yet are returned in
   * `owned` for this call to send, and are marked pending for any sibling
   * that asks next. A Stop someone else is already creating is awaited here;
   * if that creation fails without saving the Stop, this call reclaims it on
   * the next pass instead of sending a request with an unresolved `proposed:`
   * reference that is guaranteed to fail (fix round 2) - `ownerError` carries
   * the failed owner's message, for the rare case this call still ends up
   * owning nothing (defensive: the retry loop normally claims it instead).
   * `release` must be called exactly once, after this call's own
   * confirmProposal settles, to hand the result to any sibling waiting on it.
   */
  async function claimStops(
    proposal: Proposal,
  ): Promise<{ owned: StopProposal[]; resolved: Record<string, string>; ownerError?: string; release(created: Record<string, string>, error?: string): void }> {
    const resolvers = new Map<string, (result: { id?: string; error?: string }) => void>();
    const owned: StopProposal[] = [];
    let ownerError: string | undefined;

    for (;;) {
      const refs = proposal.kind === "stop" ? [proposal.clientId] : proposalStopRefs(proposal);
      const needed = refs.filter((id) => !createdStops.current[id] && !owned.some((s) => s.clientId === id));
      if (needed.length === 0) break;

      const toOwn = needed.filter((id) => !pendingStops.current[id]);
      const toAwait = needed.filter((id) => pendingStops.current[id]);

      for (const id of toOwn) {
        const stop = proposal.kind === "stop" && id === proposal.clientId ? proposal : entries[id]?.proposal;
        if (stop?.kind !== "stop") continue;
        pendingStops.current[id] = new Promise((resolve) => resolvers.set(id, resolve));
        owned.push(stop);
      }
      if (toAwait.length === 0) break;

      // Each pass either claims what's left or waits once more on exactly what's still pending.
      await Promise.all(
        toAwait.map(async (id) => {
          const result = await pendingStops.current[id];
          if (!result.id && result.error) ownerError = result.error;
        }),
      );
      // Loop again: an id now in createdStops.current (its owner succeeded)
      // drops out of `needed` next pass; one whose owner failed (pendingStops
      // cleared, still not created) gets claimed by this call instead.
    }

    return {
      owned,
      resolved: { ...createdStops.current },
      ownerError,
      release(created, error) {
        for (const stop of owned) {
          resolvers.get(stop.clientId)?.({ id: created[stop.clientId], error });
          delete pendingStops.current[stop.clientId];
        }
      },
    };
  }

  /** Confirms one Proposal (optionally an edited version), saving any proposed Stop it needs first. */
  async function confirm(clientId: string, edited?: Proposal): Promise<ConfirmProposalResult | undefined> {
    // A second tap on the same card while its first confirm() is still
    // working out which Stop(s) it needs must not send its booking twice
    // (fix round 2): the UI only disables Confirm once React commits the
    // "confirming" status set just below, which a near-simultaneous second
    // tap can land before.
    if (confirming.current.has(clientId) || entries[clientId]?.status === "confirmed") return undefined;
    confirming.current.add(clientId);
    const proposal = edited ?? entries[clientId].proposal;
    setEntries((prev) => ({ ...prev, [clientId]: { ...prev[clientId], status: "confirming", error: null } }));
    try {
      const claim = await claimStops(proposal);

      // Confirming a proposed Stop that a sibling already created: nothing
      // left to send, just reflect that creation's outcome.
      if (proposal.kind === "stop" && !claim.owned.some((s) => s.clientId === proposal.clientId)) {
        const createdId = claim.resolved[proposal.clientId];
        if (createdId) {
          setEntries((prev) => ({ ...prev, [clientId]: { ...prev[clientId], status: "confirmed", error: null } }));
          return { ok: true, createdId, createdStops: {} };
        }
        const message = claim.ownerError ?? M.generic;
        setEntries((prev) => ({ ...prev, [clientId]: { ...prev[clientId], status: "pending", error: message } }));
        return { ok: false, message, createdStops: {} };
      }

      const needs = proposal.kind === "stop" ? [] : claim.owned;
      if (needs.length > 0) {
        setEntries((prev) => {
          const next = { ...prev };
          for (const stop of needs) next[stop.clientId] = { ...next[stop.clientId], status: "confirming", error: null };
          return next;
        });
      }
      const busy = [clientId, ...needs.map((s) => s.clientId)];
      let res: ConfirmProposalResult;
      try {
        res = await confirmProposal(tripId, { proposal, proposedStops: needs, resolvedStops: claim.resolved }, forkId);
      } catch {
        res = { ok: false, message: M.generic, createdStops: {} };
      }
      createdStops.current = { ...createdStops.current, ...res.createdStops };
      claim.release(res.createdStops, res.ok ? undefined : res.message);
      setEntries((prev) => {
        const next = { ...prev };
        for (const id of busy) {
          const saved = id === clientId ? res.ok : Boolean(createdStops.current[id]);
          next[id] = {
            proposal: id === clientId ? proposal : next[id].proposal,
            status: saved ? "confirmed" : "pending",
            error: id === clientId && !res.ok ? res.message : null,
          };
        }
        return next;
      });
      if (res.ok) await attachOriginal(proposal.kind, res.createdId);
      return res;
    } finally {
      confirming.current.delete(clientId);
    }
  }

  function startEdit(clientId: string) {
    setEditing({ clientId, before: entries[clientId].proposal });
  }

  function draft(next: Proposal) {
    setEntries((prev) => ({ ...prev, [next.clientId]: { ...prev[next.clientId], proposal: next } }));
  }

  function endEdit() {
    const e = editing;
    setEditing(null);
    // Cancelled: put the Proposal back as it was; confirmed: keep what was saved.
    if (e) setEntries((prev) => (prev[e.clientId].status === "confirmed" ? prev : { ...prev, [e.clientId]: { ...prev[e.clientId], proposal: e.before } }));
  }

  /** The edit form's Confirm: the same confirm() path, so the Stop claim and re-entry guards apply. */
  async function confirmEdited(next: Proposal): Promise<ConfirmProposalResult> {
    const res = await confirm(next.clientId, { ...next, highlight: [], missing: [] });
    // undefined: this Proposal is already being confirmed (or is saved).
    return res ?? { ok: false, message: M.generic, createdStops: {} };
  }

  function discard(clientId: string) {
    setEntries((prev) => {
      const next = { ...prev, [clientId]: { ...prev[clientId], status: "discarded" as const } };
      if (prev[clientId].proposal.kind === "stop") {
        for (const e of Object.values(prev)) {
          if (e.status !== "confirmed" && proposalStopRefs(e.proposal).includes(clientId)) next[e.proposal.clientId] = { ...e, status: "discarded" };
        }
      }
      return next;
    });
  }

  if (phase.kind === "reading") return <p role="status" className="text-sm font-semibold">Reading your booking…</p>;

  if (phase.kind === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm font-semibold">{phase.message}</p>
        <div className="flex flex-wrap gap-2">
          {phase.retry && (
            <Button variant="primary" size="sm" onClick={() => void read(keptFile.current, text)}>Try again</Button>
          )}
          <Button variant="outline" size="sm" onClick={reset}>Try another file</Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "results") {
    const live = Object.values(entries).filter((e) => e.status !== "discarded");
    const proposals = live.map((e) => e.proposal);
    const stops = previewStopMap(phase.context, proposals.filter((p): p is StopProposal => p.kind === "stop"));
    return (
      <div className="flex flex-col gap-5">
        {phase.partial && <p role="status" className="text-sm font-semibold">{M.partial}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {groupProposals(proposals, phase.context).map((g) => (
          <section key={g.key} aria-label={g.title} className="flex flex-col gap-3">
            {g.stop ? (
              <NewStopHeading
                title={g.title}
                stop={g.stop}
                entry={entries[g.stop.clientId]}
                onConfirm={() => void confirm(g.stop!.clientId)}
                onDiscard={() => discard(g.stop!.clientId)}
                editButton={
                  <Button size="sm" variant="outline" onClick={() => startEdit(g.stop!.clientId)} disabled={entries[g.stop.clientId].status === "confirming"}>
                    Edit
                  </Button>
                }
              />
            ) : (
              <h3 className="font-display text-base font-extrabold">{g.title}</h3>
            )}
            {g.proposals.map((p) => (
              <ProposalCard
                key={p.clientId}
                proposal={p}
                stops={stops}
                homeName={phase.context.homeName}
                homeTimezone={phase.context.homeTimezone}
                status={entries[p.clientId].status}
                error={entries[p.clientId].error}
                onConfirm={() => void confirm(p.clientId)}
                onEdit={() => startEdit(p.clientId)}
                onDiscard={() => discard(p.clientId)}
              />
            ))}
          </section>
        ))}
        {editing && (
          <ProposalEditor
            tripId={tripId}
            forkId={forkId}
            context={phase.context}
            proposal={entries[editing.clientId].proposal}
            stopProposals={proposals.filter((p): p is StopProposal => p.kind === "stop")}
            stops={stops}
            onDraft={draft}
            onConfirm={confirmEdited}
            onClose={endEdit}
          />
        )}
        <Button variant="ghost" size="sm" className="self-start" onClick={reset}>Import another booking</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="booking-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void read(file, "");
        }}
        className={cn("flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center", dragging && "border-hue-lilac bg-hue-lilac/10")}
      >
        <FileUp className="size-6" aria-hidden="true" />
        <p className="text-sm font-semibold">Drop a PDF, screenshot or booking email here</p>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Choose a file</Button>
        <input
          ref={inputRef}
          type="file"
          accept={BOOKING_FILE_ACCEPT}
          aria-label="Booking file"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void read(file, "");
          }}
        />
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void read(null, text);
        }}
      >
        <label htmlFor="booking-import-text" className="text-sm font-bold">Or paste the booking text</label>
        <Textarea id="booking-import-text" value={text} maxLength={MAX_BOOKING_TEXT_CHARS} onChange={(e) => setText(e.target.value)} className="min-h-[100px]" />
        <Button type="submit" variant="primary" size="md" className="self-start" disabled={!text.trim()}>Read booking</Button>
      </form>
    </div>
  );
}

function NewStopHeading({
  title,
  stop,
  entry,
  onConfirm,
  onDiscard,
  editButton,
}: {
  title: string;
  stop: StopProposal;
  entry: Entry;
  onConfirm(): void;
  onDiscard(): void;
  editButton: React.ReactNode;
}) {
  const { arriveDate, departDate, timezone } = stop.input;
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-border-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-extrabold">{title}</h3>
        {entry.status === "confirmed" && <Badge variant="success">Added</Badge>}
      </div>
      <p className="text-xs font-semibold text-muted-foreground">
        {formatDateRange(arriveDate, departDate)} · {formatNights(nightsBetween(arriveDate, departDate))} · {timezone}
      </p>
      {stop.warnings.map((w) => (
        <Badge key={w} variant="warning" className="w-fit whitespace-normal text-xs">{w}</Badge>
      ))}
      {entry.error && <p role="alert" className="text-sm font-semibold text-destructive">{entry.error}</p>}
      {entry.status !== "confirmed" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={onConfirm} loading={entry.status === "confirming"} disabled={entry.status === "confirming"}>Confirm</Button>
          {editButton}
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={entry.status === "confirming"}>Discard</Button>
        </div>
      )}
    </div>
  );
}
