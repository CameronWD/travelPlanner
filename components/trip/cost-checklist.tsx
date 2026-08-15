"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { formatMoney, formatMinor, parseAmountToMinor } from "@/lib/money";
import { todayLocalISO } from "@/lib/dates";
import { markCostPaid, markCostUnpaid } from "@/server/actions/costs";
import { toast } from "@/components/ui/use-toast";

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
          <li
            key={row.id}
            className="flex items-center gap-3 py-2"
            aria-busy={pendingId === row.id}
          >
            {checkbox}

            <span className="flex-1 truncate text-sm">{row.label}</span>

            <span className="shrink-0 text-sm text-muted-foreground">
              {formatMoney(row.costMinor, row.currency)}
            </span>

            {isPaid && (
              <CheckCircle2
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PaidConfirm({
  row,
  onCancel,
  onDone,
}: {
  row: CostChecklistRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  // History beats guess: an un-ticked payment's preserved amount is the best
  // answer to "how much did I pay?" (things-to-fix P2-7).
  const [amount, setAmount] = React.useState(
    formatMinor(row.paidMinor ?? row.costMinor, row.currency),
  );
  const [date, setDate] = React.useState(todayLocalISO());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dateError, setDateError] = React.useState<string | null>(null);

  async function handleConfirm() {
    const minor = parseAmountToMinor(amount, row.currency);
    if (minor === null || minor < 0) {
      setError("Enter what you paid");
      return;
    }
    setError(null);

    if (!date) {
      setDateError("Enter when you paid");
      return;
    }
    setDateError(null);

    setSubmitting(true);
    try {
      const r = await markCostPaid(row.id, minor, date);
      if (!r.success) {
        const fieldError = r.errors.paidMinor?.[0] ?? null;
        const dateFieldError = r.errors.paidAt?.[0] ?? null;
        if (fieldError || dateFieldError) {
          setError(fieldError);
          setDateError(dateFieldError);
        } else {
          toast({ variant: "destructive", title: "Couldn't mark that paid." });
        }
        return;
      }
      onDone();
    } catch {
      toast({ variant: "destructive", title: "Couldn't mark that paid." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Paid how much?</p>

      {/*
        This confirm reconciles a single Cost in its own currency (see the
        module doc) — there's nothing to pick, so it must not offer a
        currency dropdown (things-to-fix P2-6). MoneyInput's currency Select
        always renders an interactive combobox — even fed a one-entry
        `currencies` list, Radix still gives it role="combobox" — so it has
        no read-only mode we can opt into here. We render the amount input
        directly instead, with the row's currency as a static suffix.
      */}
      <Field label="You paid" error={error ?? undefined}>
        <div className="flex items-stretch gap-2">
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
            invalid={Boolean(error)}
            aria-label="You paid amount"
            className="min-w-0 flex-1"
          />
          <span className="flex h-11 w-20 shrink-0 items-center justify-center rounded-md border border-input bg-muted text-sm text-muted-foreground sm:w-24">
            {row.currency}
          </span>
        </div>
      </Field>

      <Field label="Date paid" error={dateError ?? undefined}>
        <Input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={submitting}
          invalid={Boolean(dateError)}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleConfirm} loading={submitting}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
