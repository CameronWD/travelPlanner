"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { markCostPaid, markCostUnpaid, deleteCost, type CostRow } from "@/server/actions/costs";
import { todayLocalISO } from "@/lib/dates";
import { toast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import type { ToPayRow } from "@/lib/money/to-pay";
import { ToPayRowView } from "./to-pay-row";
import { PaidConfirm } from "@/components/money/paid-confirm";
import { OtherCostFormDialog } from "@/components/trip/other-cost-editor";
import { OwnedCostFormDialog } from "@/components/trip/cost-editor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Rows shown on the card before the rest fold into "All N costs" (MONEY.md §4). */
export const TO_PAY_DESKTOP_ROWS = 5;
export const TO_PAY_PHONE_ROWS = 2;

export function ToPayPanel({
  tripId,
  homeCurrency,
  rows,
  costs,
  ratesFooter,
}: {
  tripId: string;
  homeCurrency: string;
  rows: ToPayRow[];
  costs: CostRow[];
  ratesFooter?: React.ReactNode;
}) {
  const [optimistic, setPaid] = React.useOptimistic(rows, (state, u: { id: string; paid: boolean }) =>
    state.map((r) => (r.id === u.id ? { ...r, paid: u.paid, legacy: false, dueLine: u.paid ? "Paid today" : r.unpaidDueLine, dueTone: u.paid ? "paid" : r.unpaidDueTone } : r)),
  );
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [partly, setPartly] = React.useState<ToPayRow | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [allOpen, setAllOpen] = React.useState(false);
  const { confirm, dialog } = useConfirm();

  function toggle(row: ToPayRow) {
    React.startTransition(async () => {
      setPaid({ id: row.id, paid: !row.paid });
      setPendingId(row.id);
      try {
        const r = row.paid
          ? await markCostUnpaid(row.id)
          : await markCostPaid(row.id, row.paidMinor ?? row.costMinor, todayLocalISO());
        if (!r.success) toast({ variant: "destructive", title: "Couldn't update that cost." });
      } catch {
        toast({ variant: "destructive", title: "Couldn't update that cost." });
      } finally {
        setPendingId(null);
      }
    });
  }

  const unpaidCount = optimistic.filter((r) => !r.paid).length;
  // Pop the "N left" number on a change, not on first paint (MOTION.md M7).
  const [prevCount, setPrevCount] = React.useState(unpaidCount);
  const [countChanged, setCountChanged] = React.useState(false);
  if (prevCount !== unpaidCount) {
    setPrevCount(unpaidCount);
    setCountChanged(true);
  }
  const leftText = unpaidCount ? (
    <span key={unpaidCount} className={cn("inline-block", countChanged && "tp-pop")}>
      {`${unpaidCount} left`}
    </span>
  ) : (
    "All paid"
  );

  // A ticked row moves to the paid section 400ms after the server's new order
  // arrives, so the tick and strike read first (MOTION.md M7). Ids not in
  // `order` yet (a cost just added) render at once, appended.
  const serverOrder = rows.map((r) => r.id).join("\n");
  const [order, setOrder] = React.useState(serverOrder);
  React.useEffect(() => {
    const t = setTimeout(() => setOrder(serverOrder), 400);
    return () => clearTimeout(t);
  }, [serverOrder]);
  const listed = React.useMemo(() => {
    const ids = order.split("\n");
    const at = new Map(ids.map((id, i) => [id, i]));
    return optimistic
      .map((r, i) => ({ r, rank: at.get(r.id) ?? ids.length + i }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.r);
  }, [optimistic, order]);

  // Rows on the list at mount are already on screen; only later arrivals rise in (MOTION.md M9).
  // Once it has played the class is dropped: rows toggle display:none by index,
  // and a CSS animation restarts whenever its element is shown again.
  const [mountIds] = React.useState(() => new Set(rows.map((r) => r.id)));
  const [settledIds, setSettledIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const risesIn = (id: string) => !mountIds.has(id) && !settledIds.has(id);

  const editingCost = editing != null ? costs.find((c) => c.id === editing) : undefined;

  function rowProps(row: ToPayRow) {
    const cost = costs.find((c) => c.id === row.id);
    return {
      row,
      homeCurrency,
      pending: pendingId === row.id,
      onToggle: () => toggle(row),
      onPartlyPaid: !row.paid ? () => setPartly(row) : undefined,
      onEdit: row.ownerType === "OTHER" || cost?.ownerId ? () => setEditing(row.id) : undefined,
      onDelete:
        row.ownerType === "OTHER"
          ? async () => {
              if (!(await confirm({ title: `Delete "${row.label}"?`, description: "This can't be undone.", confirmLabel: "Delete", destructive: true }))) return;
              try {
                const r = await deleteCost(row.id);
                if (!r.success) toastRefused(r.errors, "Couldn't delete that cost.");
              } catch {
                toastRejected("Couldn't delete that cost.");
              }
            }
          : undefined,
      onOpen: row.ownerType === "OTHER" ? () => setEditing(row.id) : undefined,
    };
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id="to-pay-heading" className="font-display text-[19px] font-extrabold tracking-[-0.02em] md:text-[22px]">
          To pay
        </h2>
        <span
          className={cn(
            "hidden shrink-0 whitespace-nowrap rounded-full border-2 border-border px-2.5 text-[13px] font-bold md:inline-flex",
            unpaidCount ? "bg-sun text-on-accent" : "bg-teal text-on-accent",
          )}
        >
          {leftText}
        </span>
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap text-[13px] font-bold md:hidden"
        >
          <span className={unpaidCount ? undefined : "rounded-full border-2 border-border bg-teal px-2.5 text-on-accent"}>
            {leftText}
          </span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <ul aria-label="To pay" className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {listed.map((row, i) => (
          <ToPayRowView
            key={row.id}
            {...rowProps(row)}
            onRiseInEnd={risesIn(row.id) ? () => setSettledIds((s) => new Set(s).add(row.id)) : undefined}
            className={cn(
              risesIn(row.id) && "tp-rise-in",
              i >= TO_PAY_PHONE_ROWS && "max-md:hidden",
              i >= TO_PAY_DESKTOP_ROWS && "md:hidden",
            )}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setAllOpen(true)}
        className="mt-3 hidden min-h-11 items-center justify-between text-sm font-bold md:flex"
      >
        All {rows.length} costs <ChevronRight className="size-4" aria-hidden="true" />
      </button>

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>All costs</DialogTitle>
          </DialogHeader>
          <ul aria-label="All costs">
            {listed.map((row) => (
              <ToPayRowView key={row.id} {...rowProps(row)} />
            ))}
          </ul>
          {ratesFooter ? <div className="md:hidden">{ratesFooter}</div> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={partly != null} onOpenChange={(o) => !o && setPartly(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="sr-only">Paid how much?</DialogTitle>
          </DialogHeader>
          {partly ? <PaidConfirm row={partly} onCancel={() => setPartly(null)} onDone={() => setPartly(null)} /> : null}
        </DialogContent>
      </Dialog>

      {editingCost?.ownerType === "OTHER" ? (
        <OtherCostFormDialog
          tripId={tripId}
          homeCurrency={homeCurrency}
          cost={editingCost}
          open={editing != null}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : editingCost ? (
        <OwnedCostFormDialog
          cost={editingCost}
          homeCurrency={homeCurrency}
          open={editing != null}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}

      {dialog}
    </>
  );
}
