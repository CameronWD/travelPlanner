"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { CURRENCY_CODES } from "@/lib/currencies";
import { formatMoney, formatMinor, parseAmountToMinor } from "@/lib/money";
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
  homeCurrency: string;
}

/**
 * The reconciling gesture: tick down the list marking things paid. Ticking an
 * unpaid row opens a small confirm pre-filled with the cost amount — required
 * because a Cost can't be paid without an amount (ADR 0037), pre-filled so the
 * common case ("it cost what I thought") stays one tap.
 */
export function CostChecklist({ rows, homeCurrency }: CostChecklistProps) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => {
        const isPaid = row.paidAt != null;
        return (
          <li key={row.id} className="flex items-center gap-3 py-2">
            <Popover
              open={openId === row.id}
              onOpenChange={(o) => setOpenId(o ? row.id : null)}
            >
              <PopoverTrigger asChild>
                <input
                  type="checkbox"
                  checked={isPaid}
                  aria-label={row.label}
                  disabled={pendingId === row.id}
                  // PopoverTrigger always composes its own click-to-toggle onto
                  // this element (Radix), so un-marking must intercept via
                  // onClick + preventDefault rather than onChange — otherwise
                  // the click still reaches Radix's toggle underneath and pops
                  // the "Paid how much?" confirm open for an already-paid row.
                  onClick={(e) => {
                    if (!isPaid) return; // let the default click open the popover
                    e.preventDefault();
                    setPendingId(row.id);
                    // Un-marking needs no amount — the paid amount stays as history.
                    void markCostUnpaid(row.id).then((r) => {
                      setPendingId(null);
                      if (!r.success) {
                        toast({ variant: "destructive", title: "Couldn't update that cost." });
                      }
                    });
                  }}
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

            <span className="flex-1 truncate text-sm">{row.label}</span>

            <span className="shrink-0 text-sm text-muted-foreground">
              {formatMoney(row.costMinor, row.currency)}
            </span>

            {isPaid && (
              <CheckCircle2
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-label="Paid"
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
  const [amount, setAmount] = React.useState(
    formatMinor(row.costMinor, row.currency),
  );
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    const minor = parseAmountToMinor(amount, row.currency);
    if (minor === null || minor < 0) {
      setError("Enter what you paid");
      return;
    }
    setSubmitting(true);
    const r = await markCostPaid(row.id, minor, date);
    setSubmitting(false);
    if (!r.success) {
      toast({ variant: "destructive", title: "Couldn't mark that paid." });
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Paid how much?</p>

      <Field label="You paid" error={error ?? undefined}>
        <MoneyInput
          amount={amount}
          currency={row.currency}
          currencies={CURRENCY_CODES}
          onAmountChange={setAmount}
          onCurrencyChange={() => {}}
          disabled={submitting}
          invalid={Boolean(error)}
          aria-label="You paid amount"
        />
      </Field>

      <Field label="Date paid">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={submitting}
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
