"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import { todayLocalISO } from "@/lib/dates";
import { markCostPaid } from "@/server/actions/costs";
import { toast } from "@/components/ui/use-toast";

export interface PaidConfirmRow {
  id: string;
  label: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
}

export function PaidConfirm({
  row,
  onCancel,
  onDone,
}: {
  row: PaidConfirmRow;
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
          <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-input bg-muted text-sm text-muted-foreground sm:w-24">
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
