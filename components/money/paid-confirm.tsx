"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useTripCurrencies } from "@/components/money/trip-currencies-context";
import { paidCurrencyChoices, paidCurrencyOf, storedPaidCurrency } from "@/lib/money/paid-currency";
import { formatMinor, parseAmountToMinor } from "@/lib/money/money";
import { todayLocalISO } from "@/lib/dates";
import { markCostPaid } from "@/server/actions/costs";
import { toast } from "@/components/ui/use-toast";

export interface PaidConfirmRow {
  id: string;
  label: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  paidCurrency?: string | null;
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
  const homeCurrency = useTripCurrencies()?.homeCurrency ?? null;
  const [paidCurrency, setPaidCurrency] = React.useState(paidCurrencyOf(row));
  const [currencyChosen, setCurrencyChosen] = React.useState(false);
  // History beats guess: an un-ticked payment's preserved amount is the best
  // answer to "how much did I pay?" (things-to-fix P2-7).
  const [amount, setAmount] = React.useState(
    formatMinor(row.paidMinor ?? row.costMinor, paidCurrency),
  );
  const [date, setDate] = React.useState(todayLocalISO());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dateError, setDateError] = React.useState<string | null>(null);

  async function handleConfirm() {
    const minor = parseAmountToMinor(amount, paidCurrency);
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
      // Unchosen, the stored paid currency stands: the call is the one made before paid currencies existed.
      const r = currencyChosen
        ? await markCostPaid(row.id, minor, date, storedPaidCurrency(paidCurrency, row.currency))
        : await markCostPaid(row.id, minor, date);
      if (!r.success) {
        const fieldError = (r.errors.paidMinor ?? r.errors.paidCurrency)?.[0] ?? null;
        const dateFieldError = r.errors.paidAt?.[0] ?? null;
        if (fieldError || dateFieldError) {
          setError(fieldError);
          setDateError(dateFieldError);
        } else {
          toast({ variant: "destructive", title: "Couldn’t mark that paid." });
        }
        return;
      }
      onDone();
    } catch {
      toast({ variant: "destructive", title: "Couldn’t mark that paid." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Paid how much?</p>

      <Field label="You paid" error={error ?? undefined}>
        <MoneyInput
          amount={amount}
          currency={paidCurrency}
          currencies={paidCurrencyChoices(row, homeCurrency)}
          currencyLabel="You paid currency"
          onAmountChange={setAmount}
          onCurrencyChange={(next) => {
            if (next === paidCurrency) return;
            setPaidCurrency(next);
            setCurrencyChosen(true);
            setAmount("");
          }}
          disabled={submitting}
          invalid={Boolean(error)}
          aria-label="You paid amount"
        />
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
