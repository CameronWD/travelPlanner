"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { formError } from "@/components/ui/action-failure";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import { createCost, updateCost } from "@/server/actions/costs";
import { isOnTrip } from "@/lib/enum-values";
import { SettlementChoice } from "@/components/trip/settlement-choice";
import { CURRENCY_CODES } from "@/lib/currencies";
import { todayLocalISO } from "@/lib/dates";
import { toPatch } from "@/lib/patch";
import {
  costToFormState as costToCostFormState,
  emptyCostFormState,
  setCostAmount,
  setPaid,
  toCostPayload,
  type CostFormState,
} from "@/lib/money/cost-form-state";
import type { CostRow } from "@/server/actions/costs";
import type { CostRawInput } from "@/lib/validations/cost";
import type { FieldErrors } from "@/lib/action-result";
import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sensible categories for OTHER costs. Stored as free-text on Cost.category
 * so they don't need to match the item CATEGORIES enum.
 */
const OTHER_COST_CATEGORIES = [
  "Insurance",
  "Visas & Docs",
  "Connectivity / eSIM",
  "Spending money",
  "Transport",
  "Accommodation",
  "Food & Drink",
  "Activities",
  "Shopping",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shared Cost form state (card 2.I) plus this form's own fields. */
type FormState = CostFormState & {
  label: string;
  category: string;
  dueDate: string;
  /** While true, the paid amount mirrors the cost as it's typed (Travelling default, spec §K). */
  paidFollowsCost: boolean;
};

const PLAIN_DEFAULTS = (homeCurrency: string): OtherCostDefaults => ({ currency: homeCurrency, settlement: "BEFORE", paidToday: false });

function defaultFormState(defaults: OtherCostDefaults): FormState {
  return {
    ...emptyCostFormState(defaults.currency),
    label: "",
    category: "",
    paid: defaults.paidToday,
    // Interactive pre-fill the Traveller can see and edit, like ticking Paid (ADR 0037).
    paidAt: defaults.paidToday ? todayLocalISO() : "",
    dueDate: "",
    settlement: defaults.settlement,
    paidFollowsCost: defaults.paidToday,
  };
}

function costToFormState(cost: CostRow): FormState {
  return {
    ...costToCostFormState(cost),
    label: cost.label ?? "",
    category: cost.category ?? "",
    dueDate: cost.dueDate ?? "",
    paidFollowsCost: false,
  };
}

/**
 * Validate + map form state to the server action's input shape, or the
 * field errors to show instead. A blank or unparseable cost is "Enter the
 * cost" (never coerced to 0 — ADR 0037 run in reverse), and Paid ticked with
 * no parseable paid amount is "Enter what you paid" (`toCostPayload`). The
 * paid date is only ever the interactive pre-fill, never fabricated here.
 */
function parseFormToInput(form: FormState): { input: CostRawInput } | { errors: FieldErrors } {
  const payload = toCostPayload(form);
  if (payload.kind === "none") return { errors: { costMinor: ["Enter the cost"] } };
  if (payload.kind === "invalid") return { errors: payload.errors };
  return {
    input: {
      ...payload.fields,
      ...(form.dueDate && !form.paid && !isOnTrip(form.settlement) ? { dueDate: form.dueDate } : {}),
      ownerType: "OTHER",
      label: form.label,
      category: form.category || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Form dialog
// ---------------------------------------------------------------------------

interface OtherCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (form: FormState) => Promise<void>;
  initialState: FormState;
  submitting: boolean;
  errors: Record<string, string[]>;
  onCancel: () => void;
}

function OtherCostDialog({
  open,
  onOpenChange,
  title,
  onSubmit,
  initialState,
  submitting,
  errors,
  onCancel,
}: OtherCostDialogProps) {
  const [form, setForm] = React.useState<FormState>(initialState);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Label */}
          <Field label="Description" required error={errors.label?.[0]}>
            <Input
              placeholder="e.g. Travel insurance"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              disabled={submitting}
              invalid={Boolean(errors.label)}
            />
          </Field>

          {/* Category */}
          <Field label="Category" error={errors.category?.[0]}>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {OTHER_COST_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Cost */}
          <Field
            label="Cost"
            description="Your best number: the real price if it's already booked."
            required
            error={errors.costMinor?.[0]}
          >
            <MoneyInput
              amount={form.costAmount}
              currency={form.currency}
              currencies={CURRENCY_CODES}
              onAmountChange={(v) =>
                setForm((f) =>
                  // A paid-today default stays ticked and its amount follows
                  // the cost, even through a blank; otherwise blanking the
                  // cost clears the paid state (`setCostAmount`).
                  f.paidFollowsCost ? { ...f, costAmount: v, paidAmount: v } : setCostAmount(f, v),
                )
              }
              onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              disabled={submitting}
              invalid={Boolean(errors.costMinor)}
              aria-label="Cost amount"
            />
          </Field>

          {form.costAmount.trim() && (
            <>
              <SettlementChoice
                value={form.settlement}
                onChange={(v) => setForm((f) => ({ ...f, settlement: v }))}
                disabled={submitting}
              />

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    // Ticking pre-fills the paid amount and today (ADR 0037,
                    // `setPaid`) — only on the interactive tick, never at submit.
                    setForm((f) => ({
                      ...setPaid(f, checked, todayLocalISO()),
                      paidFollowsCost: checked && f.paidFollowsCost,
                    }));
                  }}
                  disabled={submitting}
                  className="size-4 rounded border-input accent-primary"
                />
                Paid
              </label>

              {/* An On the trip cost is never an upcoming payment, so it takes
                  no Due date (CONTEXT.md "Settlement"). */}
              {!form.paid && !isOnTrip(form.settlement) && (
                <DateField
                  label="Due date (optional)"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  disabled={submitting}
                />
              )}

              {form.paid && (
                <>
                  <Field label="You paid" error={errors.paidMinor?.[0]}>
                    <MoneyInput
                      amount={form.paidAmount}
                      currency={form.currency}
                      currencies={CURRENCY_CODES}
                      onAmountChange={(v) => setForm((f) => ({ ...f, paidAmount: v, paidFollowsCost: false }))}
                      onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                      disabled={submitting}
                      invalid={Boolean(errors.paidMinor)}
                      aria-label="You paid amount"
                    />
                  </Field>

                  <Field label="Date paid" error={errors.paidAt?.[0]}>
                    <Input
                      type="date"
                      value={form.paidAt}
                      onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                      disabled={submitting}
                      className="w-full"
                    />
                  </Field>
                </>
              )}
            </>
          )}

          <FormError>{formError(errors)}</FormError>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={submitting}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={submitting} loading={submitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Standalone form dialog
// ---------------------------------------------------------------------------

export interface OtherCostFormDialogProps {
  tripId: string;
  homeCurrency: string;
  /** Edit this cost; omit to create one. */
  cost?: CostRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting values for a new cost (spec 2026-10-06 §K); omitted = Home currency, Before you go, unpaid. */
  defaults?: OtherCostDefaults;
}

/** The Other-cost form on its own, for Money's + Add a cost and a To pay row's Edit. */
export function OtherCostFormDialog({ tripId, homeCurrency, cost, open, onOpenChange, defaults }: OtherCostFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  async function handleSubmit(form: FormState) {
    const parsed = parseFormToInput(form);
    if ("errors" in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = cost ? await updateCost(cost.id, toPatch(parsed.input, ["paidAt", "dueDate", "category"])) : await createCost(tripId, parsed.input);
      if (result.success) onOpenChange(false);
      else setErrors(result.errors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OtherCostDialog
      key={open ? (cost?.id ?? "add") : "closed"}
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setErrors({});
          onOpenChange(false);
        }
      }}
      title={cost ? "Edit cost" : "Add a cost"}
      onSubmit={handleSubmit}
      initialState={cost ? costToFormState(cost) : defaultFormState(defaults ?? PLAIN_DEFAULTS(homeCurrency))}
      submitting={submitting}
      errors={errors}
      onCancel={() => onOpenChange(false)}
    />
  );
}
