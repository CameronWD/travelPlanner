"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UNDO_FAILED, useUndoableAction } from "@/components/ui/use-undoable-action";
import { applyFinding, dismissFinding, undoFinding } from "@/server/actions/reviews";
import type { ChecklistChoice } from "@/lib/review/checklist-fix";
import { cn } from "@/lib/cn";
import type { FindingCard, FindingGroup } from "@/lib/review/view";
import { FINDING_SHOWN_STATE_LABELS, type FindingShownState, type FindingState } from "@/lib/review/types";

/** The badge while a change is still in flight or awaiting the page's refresh. Same wording as the server's (lib/review/types.ts), so no second copy drifts from it. */
const LOCAL_LABEL = FINDING_SHOWN_STATE_LABELS;
const BADGE: Record<FindingShownState, "outline" | "success" | "muted"> = { OPEN: "outline", APPLIED: "success", DISMISSED: "muted", FIXED: "success", GONE: "muted" };

// Same palette as FlagList (components/trip/flag-list.tsx), so a Finding restating a Flag looks like one.
const SEVERITY = {
  warning: { icon: AlertTriangle, box: "bg-warning/10 border-warning/40", iconClass: "text-sun-text" },
  info: { icon: Info, box: "bg-hue-sky/25 border-border", iconClass: "text-foreground" },
} as const;

/**
 * A Review's Findings (spec 2026-10-18 A1, A2, A5): what's left, by severity,
 * then what's dealt with, collapsed. Every button follows R's own
 * canApply/canDismiss/canUndo flags on the card (lib/review-reads.ts), never
 * a locally re-derived rule: Undo of an Apply can be offered even once its
 * Review is no longer the latest (it needs only a saved undo payload, or a
 * stranded claim); Undo of a Dismiss, like Dismiss itself, only on the latest
 * DONE Review. So Undo is never gated here by `actionable` — trust canUndo as
 * given — while `actionable` still gates Apply and Dismiss, which only ever
 * make sense on the latest Review. The go-to link ignores `actionable`
 * entirely (A1): it only reads the plan, so a past Review's card still opens
 * it. Everyone on the Trip may use the action buttons (R12): the server
 * re-checks.
 */
export function FindingList({ open, dealtWith, actionable }: { open: FindingGroup[]; dealtWith: FindingCard[]; actionable: boolean }) {
  if (open.length === 0 && dealtWith.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to flag. This Review found no problems.</p>;
  }
  const openCount = open.reduce((n, g) => n + g.cards.length, 0);
  return (
    <div className="flex flex-col gap-5">
      {open.length > 0 ? (
        <section className="flex flex-col gap-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To deal with ({openCount})</h3>
          {open.map((g) => (
            <section key={g.severity} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.heading} ({g.cards.length})
              </h3>
              <ul role="list" className="flex flex-col gap-2">
                {/* Keyed by finding id: a row's optimistic override lives in its own
                    state, reconciled (not remounted) once the server's own state
                    for that id changes — see the effect in FindingItem below. */}
                {g.cards.map((c) => (
                  <FindingItem key={c.id} card={c} actionable={actionable} />
                ))}
              </ul>
            </section>
          ))}
        </section>
      ) : dealtWith.length > 0 ? (
        <p className="text-sm text-muted-foreground">All dealt with.</p>
      ) : null}
      {dealtWith.length > 0 ? (
        <details className="group flex flex-col gap-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dealt with ({dealtWith.length})
          </summary>
          <ul role="list" className="mt-2 flex flex-col gap-2">
            {dealtWith.map((c) => (
              <FindingItem key={c.id} card={c} actionable={actionable} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function FindingItem({ card, actionable }: { card: FindingCard; actionable: boolean }) {
  const [local, setLocal] = React.useState<FindingState | null>(null);
  // The server's own state for this Finding, as last seen: once a refresh
  // brings a new value (confirming our optimistic change, or contradicting
  // it — a refusal elsewhere, another Traveller's own action), the local
  // override is dropped so the server's truth shows. This is the rollback
  // Review Focus candidate 1 calls for, without remounting the row.
  const lastServerState = React.useRef(card.state);
  React.useEffect(() => {
    if (lastServerState.current !== card.state) {
      lastServerState.current = card.state;
      setLocal(null);
    }
  }, [card.state]);

  const state = local ?? card.state;
  const stateLabel = local ? LOCAL_LABEL[local] : card.stateLabel;

  const apply = useUndoableAction<{ id: string; choice?: ChecklistChoice }, { already?: string }>({
    apply: () => setLocal("APPLIED"),
    persist: ({ id, choice }) => applyFinding(id, choice),
    revert: () => setLocal(null),
    undo: ({ id }) => undoFinding(id),
    applyUndo: () => setLocal("OPEN"),
    // A refused Undo here does NOT mean "still Applied": a persistent Undo
    // elsewhere may already have gone through, so the server, not a guessed
    // prior state, is the truth once we no longer trust our own optimism.
    revertUndo: () => setLocal(null),
    // `already` (the checklist duplicate guard, A2) names what actually
    // happened when nothing was added; otherwise a row fix "applies" and a
    // checklist fix "adds".
    done: (_i, r) => ({ title: r.already ?? (card.fix?.kind === "row" ? "Fix applied" : "Added"), description: card.title }),
    failure: "Couldn't apply that fix. Nothing changed.",
  });
  const dismiss = useUndoableAction({
    apply: () => setLocal("DISMISSED"),
    persist: (id: string) => dismissFinding(id),
    revert: () => setLocal(null),
    undo: (id) => undoFinding(id),
    applyUndo: () => setLocal("OPEN"),
    // Same reasoning as apply's revertUndo above.
    revertUndo: () => setLocal(null),
    done: () => ({ title: "Dismissed", description: card.title }),
    failure: "Couldn't dismiss that. Try again.",
  });
  // The lasting button on an Applied or Dismissed card (decision 4): a plain
  // undo, with no undo of its own. `state` here is read at click time (the
  // closure useUndoableAction captures is the one from this render), so the
  // toast names what was actually reversed even though `local` has already
  // optimistically moved to OPEN by the time this callback runs.
  const undo = useUndoableAction({
    apply: () => setLocal("OPEN"),
    persist: (id: string) => undoFinding(id),
    revert: () => setLocal(null),
    done: () => ({ title: state === "DISMISSED" ? "Dismiss undone" : "Fix undone", description: card.title }),
    failure: UNDO_FAILED,
  });
  const busy = apply.pending || dismiss.pending || undo.pending;
  const sev = SEVERITY[card.severity];
  const Icon = sev.icon;

  const isOpen = actionable && state === "OPEN";
  const showApply = isOpen && card.fix?.kind === "row" && card.canApply;
  const showPacking = isOpen && card.fix?.kind === "packing";
  const showPretrip = isOpen && card.fix?.kind === "pretrip";
  const goTo = card.goTo;
  const showDismiss = isOpen && card.canDismiss;
  const showUndo = (state === "APPLIED" || state === "DISMISSED") && card.canUndo;

  return (
    <li className={cn("flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm", sev.box, state !== "OPEN" && "opacity-80")}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-4 shrink-0", sev.iconClass)} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.categoryLabel}</span>
            <Badge variant={BADGE[state]}>{stateLabel}</Badge>
          </div>
          <p className="font-semibold leading-snug text-foreground">{card.title}</p>
          <p className="leading-snug text-foreground">{card.detail}</p>
          {state === "OPEN" && card.fix ? (
            <p className="text-[13px] text-muted-foreground">Suggested fix: {card.fix.label}</p>
          ) : null}
          {card.source ? (
            <a href={card.source.href} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2">
              Source: {card.source.host}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
      {showApply || showPacking || showPretrip || goTo || showDismiss || showUndo ? (
        <div className="flex flex-wrap gap-2 pl-7">
          {showApply ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void apply.run({ id: card.id })} aria-label={`Apply: ${card.title}`}>
              Apply
            </Button>
          ) : null}
          {showPacking ? (
            <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void apply.run({ id: card.id, choice: "PACK" })} aria-label={`Need to pack: ${card.title}`}>
                Need to pack
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void apply.run({ id: card.id, choice: "BUY" })} aria-label={`Need to buy: ${card.title}`}>
                Need to buy
              </Button>
            </>
          ) : null}
          {showPretrip ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void apply.run({ id: card.id })} aria-label={`Add to pre-trip checklist: ${card.title}`}>
              Add to pre-trip checklist
            </Button>
          ) : null}
          {goTo ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={goTo.href}>{goTo.label}</Link>
            </Button>
          ) : null}
          {showDismiss ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void dismiss.run(card.id)} aria-label={`Dismiss: ${card.title}`}>
              Dismiss
            </Button>
          ) : null}
          {showUndo ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void undo.run(card.id)} aria-label={`Undo: ${card.title}`}>
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
