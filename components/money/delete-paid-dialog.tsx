"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { formatMinor, formatMoney, parseAmountToMinor } from "@/lib/money/money";
import { refundProblem } from "@/lib/money/refund";
import { todayLocalISO } from "@/lib/dates";
import type { DeleteRefundAnswer } from "@/lib/money/delete-refund";

export interface PaidCostForDelete {
  id: string;
  label: string;
  paidMinor: number;
  currency: string;
}

/** The Costs the server can take a Refund answer for: paid, with a paid amount, and no Refund yet (one that has it already says what happened to its money). */
export function paidCostsForDelete(
  costs: readonly { id: string; label: string | null; paidMinor: number | null; paidAt: Date | null; refundMinor?: number | null; currency: string }[] | undefined,
): PaidCostForDelete[] {
  return (costs ?? []).flatMap((c) =>
    c.paidAt != null && c.paidMinor != null && c.refundMinor == null
      ? [{ id: c.id, label: c.label || "Cost", paidMinor: c.paidMinor, currency: c.currency }]
      : [],
  );
}

export interface DeletePaidOptions {
  title: string;
  costs: PaidCostForDelete[];
}

export interface DeletePaidResult {
  confirmed: boolean;
  refunds?: DeleteRefundAnswer[];
}

type Mode = "none" | "expected" | "received";

const CHOICES: { mode: Mode; label: string; hint: string }[] = [
  { mode: "none", label: "Not refunded", hint: "It stays in your spend as an Other cost." },
  { mode: "expected", label: "Refund expected", hint: "It stays in your spend until the refund arrives." },
  { mode: "received", label: "Refunded", hint: "It comes off your spend." },
];

function DeletePaidBody({
  title,
  costs,
  onDone,
}: DeletePaidOptions & { onDone: (r: DeletePaidResult) => void }) {
  const uid = React.useId();
  const questionId = `${uid}-question`;
  const [mode, setMode] = React.useState<Mode>("none");
  const [amounts, setAmounts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(costs.map((c) => [c.id, formatMinor(c.paidMinor, c.currency)])),
  );
  const [date, setDate] = React.useState(todayLocalISO());

  const currencies = new Set(costs.map((c) => c.currency));
  const sharedCurrency = currencies.size === 1 ? costs[0].currency : null;
  const total = costs.reduce((sum, c) => sum + c.paidMinor, 0);
  const single = costs.length === 1;

  // With several Costs, an empty or zero amount means nothing came back on that one.
  const parsed = costs.map((c) => {
    const raw = amounts[c.id] ?? "";
    const minor = parseAmountToMinor(raw, c.currency);
    const left = !single && (raw.trim() === "" || minor === 0);
    const problem = left
      ? null
      : refundProblem({ paidMinor: c.paidMinor, paidAt: "paid", refundMinor: minor ?? 0, refundedAt: null });
    return { cost: c, minor, left, problem };
  });
  const asking = mode !== "none";
  const problems = asking ? parsed.filter((p) => p.problem) : [];
  const answered = parsed.filter((p) => !p.left);
  const noneEntered = asking && !single && answered.length === 0;
  const blocked = problems.length > 0 || noneEntered || (mode === "received" && !date);
  const alertText = problems[0]?.problem ?? (noneEntered ? "Enter the refund amount" : null);

  function confirm() {
    if (blocked) return;
    onDone({
      confirmed: true,
      refunds: asking
        ? answered.map((p) => ({
            costId: p.cost.id,
            refundMinor: p.minor as number,
            refundedAt: mode === "received" ? date : null,
          }))
        : undefined,
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription id={questionId}>
          {sharedCurrency
            ? `You’ve paid ${formatMoney(total, sharedCurrency)} for this. What happened to the money?`
            : "You’ve paid for this. What happened to the money?"}
        </DialogDescription>
      </DialogHeader>

      {!sharedCurrency && (
        <ul className="text-sm text-muted-foreground">
          {costs.map((c) => (
            <li key={c.id}>
              {c.label}: {formatMoney(c.paidMinor, c.currency)}
            </li>
          ))}
        </ul>
      )}

      <div role="radiogroup" aria-labelledby={questionId} className="flex flex-col gap-2">
        {CHOICES.map((choice) => (
          <label
            key={choice.mode}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-input px-3 py-2 has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name={`${uid}-choice`}
              checked={mode === choice.mode}
              onChange={() => setMode(choice.mode)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{choice.label}</span>
              <span className="text-xs text-muted-foreground">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {asking && (
        <div className="flex flex-col gap-3">
          {parsed.map(({ cost, problem }) => (
            <Field
              key={cost.id}
              label={
                single
                  ? "Refund amount"
                  : `Refund amount: ${cost.label} (${formatMoney(cost.paidMinor, cost.currency)})`
              }
            >
              <div className="flex items-stretch gap-2">
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amounts[cost.id] ?? ""}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [cost.id]: e.target.value }))}
                  invalid={Boolean(problem)}
                  className="min-w-0 flex-1"
                />
                <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-input bg-muted text-sm text-muted-foreground sm:w-24">
                  {cost.currency}
                </span>
              </div>
            </Field>
          ))}
          {mode === "received" && (
            <Field label="Date received">
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          {!single && (
            <p className="text-xs text-muted-foreground">Leave an amount empty if nothing came back on it.</p>
          )}
          {alertText && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {alertText}
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button variant="destructive" autoFocus disabled={blocked} onClick={confirm}>
          Delete
        </Button>
      </DialogFooter>
    </>
  );
}

interface State {
  open: boolean;
  options: DeletePaidOptions;
  resolver: ((value: DeletePaidResult) => void) | null;
}

const CANCELLED: DeletePaidResult = { confirmed: false };

export function useDeletePaid(): {
  ask: (opts: DeletePaidOptions) => Promise<DeletePaidResult>;
  dialog: React.ReactNode;
} {
  const [state, setState] = React.useState<State>({
    open: false,
    options: { title: "", costs: [] },
    resolver: null,
  });

  const ask = React.useCallback(
    (opts: DeletePaidOptions) =>
      new Promise<DeletePaidResult>((resolve) => {
        setState({ open: true, options: opts, resolver: resolve });
      }),
    [],
  );

  const finish = React.useCallback((result: DeletePaidResult) => {
    setState((prev) => {
      prev.resolver?.(result);
      return { open: false, options: prev.options, resolver: null };
    });
  }, []);

  const dialog = (
    <Dialog open={state.open} onOpenChange={(open) => !open && finish(CANCELLED)}>
      <DialogContent cover={false}>
        <DeletePaidBody {...state.options} onDone={finish} />
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}
