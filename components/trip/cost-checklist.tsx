"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/money";
import { markCostUnpaid } from "@/server/actions/costs";
import { toast } from "@/components/ui/use-toast";
import { PaidConfirm } from "@/components/money/paid-confirm";

export interface CostChecklistRow {
  id: string;
  label: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  paidAt: Date | null;
}

interface CostChecklistProps {
  rows: CostChecklistRow[];
}

/**
 * The reconciling gesture: tick down the list marking things paid. Ticking an
 * unpaid row opens a small confirm pre-filled with the cost amount — required
 * because a Cost can't be paid without an amount (ADR 0037), pre-filled so the
 * common case ("it cost what I thought") stays one tap. Each row formats in
 * its own currency (`formatMoney(row.costMinor, row.currency)`) — this is a
 * reconciling checklist, so you're ticking off what you actually paid in the
 * currency you actually paid it, not a home-currency total.
 */
export function CostChecklist({ rows }: CostChecklistProps) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  if (rows.length === 0) return null;

  async function handleUnmark(row: CostChecklistRow) {
    if (pendingId) return;
    setPendingId(row.id);
    try {
      const r = await markCostUnpaid(row.id);
      if (!r.success) {
        toast({ variant: "destructive", title: "Couldn't update that cost." });
      }
    } catch {
      toast({ variant: "destructive", title: "Couldn't update that cost." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => {
        const isPaid = row.paidAt != null;
        const checkbox = isPaid ? (
          // Paid rows never open a confirm (un-marking needs no amount — the
          // paid amount stays as history), so they render a plain checkbox,
          // not a PopoverTrigger — otherwise screen readers would announce a
          // dialog that can never open. preventDefault stops the native
          // checked-attribute flicker before the controlled re-render lands
          // (isPaid only flips once fresh data arrives from the server).
          <input
            type="checkbox"
            checked
            aria-label={row.label}
            onClick={(e) => {
              e.preventDefault();
              void handleUnmark(row);
            }}
            onChange={() => {}}
            className="size-4 shrink-0 rounded border-input accent-primary"
          />
        ) : (
          <Popover
            open={openId === row.id}
            onOpenChange={(o) => {
              // Don't let a different row's in-flight unmark be interrupted
              // by opening a new confirm here (P2-9).
              if (o && pendingId) return;
              setOpenId(o ? row.id : null);
            }}
          >
            <PopoverTrigger asChild>
              <input
                type="checkbox"
                checked={false}
                aria-label={row.label}
                onChange={() => {}}
                className="size-4 shrink-0 rounded border-input accent-primary"
              />
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <PaidConfirm
                row={row}
                onCancel={() => setOpenId(null)}
                onDone={() => setOpenId(null)}
              />
            </PopoverContent>
          </Popover>
        );

        return (
          <li key={row.id} aria-busy={pendingId === row.id}>
            <label className="flex min-h-11 items-center gap-3 py-2">
              {checkbox}

              <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{row.label}</span>

              <span className="shrink-0 text-sm text-muted-foreground">
                {formatMoney(
                  isPaid && row.paidMinor !== null && row.paidMinor !== undefined
                    ? row.paidMinor
                    : row.costMinor,
                  row.currency,
                )}
              </span>

              {isPaid && (
                <CheckCircle2
                  className="size-4 shrink-0 text-teal-text"
                  aria-hidden="true"
                />
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
