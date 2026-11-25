"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { NOTHING_CHANGED, SOMETHING_WENT_WRONG, formError } from "@/components/ui/action-failure";
import { REFUND_MESSAGES } from "@/lib/money/refund";
import { formatMinor, parseAmountToMinor } from "@/lib/money/money";
import { formatISODate, todayLocalISO } from "@/lib/dates";
import { clearRefund, markRefundReceived, recordRefund } from "@/server/actions/costs";

export interface RefundDialogCost {
  id: string;
  currency: string;
  paidMinor: number | null;
  refundMinor?: number | null;
  refundedAt?: Date | string | null;
}

function isoOf(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : formatISODate(d);
}

/** Records, receives or removes the Refund on a paid Cost. `receiving` opens it on Received (the "Received" action). */
export function RefundDialog({ cost, receiving, onClose }: { cost: RefundDialogCost; receiving?: boolean; onClose: () => void }) {
  const hasRefund = cost.refundMinor != null;
  const [amount, setAmount] = React.useState(formatMinor(cost.refundMinor ?? cost.paidMinor ?? 0, cost.currency));
  const [received, setReceived] = React.useState(Boolean(receiving) || cost.refundedAt != null);
  const [date, setDate] = React.useState(cost.refundedAt ? isoOf(cost.refundedAt) : todayLocalISO());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const groupId = React.useId();

  async function run(act: () => ReturnType<typeof clearRefund>) {
    setSubmitting(true);
    setError(null);
    try {
      const r = await act();
      if (r.success) onClose();
      else setError(formError(r) ?? NOTHING_CHANGED);
    } catch {
      setError(SOMETHING_WENT_WRONG);
    } finally {
      setSubmitting(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    // The dialog's React tree sits inside the cost form's; a submit would bubble into it.
    e.stopPropagation();
    const minor = parseAmountToMinor(amount, cost.currency);
    if (minor === null) {
      setError("Enter the refund amount");
      return;
    }
    if (minor < 1) {
      setError(REFUND_MESSAGES.tooSmall);
      return;
    }
    if (received && !date) {
      setError("Enter when it arrived");
      return;
    }
    const unchangedExpected = cost.refundMinor === minor && cost.refundedAt == null;
    void run(() =>
      !received
        ? recordRefund(cost.id, minor, null)
        : unchangedExpected
          ? markRefundReceived(cost.id, date)
          : recordRefund(cost.id, minor, date),
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Refund</DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Refund amount">
            <div className="flex items-stretch gap-2">
              <Input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                className="min-w-0 flex-1"
              />
              <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-input bg-muted text-sm text-muted-foreground sm:w-24">
                {cost.currency}
              </span>
            </div>
          </Field>

          <div role="radiogroup" aria-labelledby={groupId} className="flex flex-col gap-2">
            <p id={groupId} className="text-sm font-semibold">
              Has it arrived?
            </p>
            <div className="flex gap-4">
              {[
                { label: "Expected", value: false },
                { label: "Received", value: true },
              ].map((o) => (
                <label key={o.label} className="flex min-h-11 items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name={groupId}
                    checked={received === o.value}
                    onChange={() => setReceived(o.value)}
                    disabled={submitting}
                    className="size-4 accent-primary"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          {received ? (
            <Field label="Date received">
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
            </Field>
          ) : null}

          <FormError>{error}</FormError>

          <DialogFooter>
            {hasRefund ? (
              <Button type="button" variant="ghost" size="md" disabled={submitting} onClick={() => void run(() => clearRefund(cost.id))}>
                Remove refund
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="md" disabled={submitting} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" loading={submitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
