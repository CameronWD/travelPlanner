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
import { isOnTrip, type CostSettlement } from "@/lib/enum-values";
import { SettlementChoice } from "@/components/trip/settlement-choice";
import { CURRENCIES } from "@/lib/currencies";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import { todayLocalISO } from "@/lib/dates";
import type { CostRow } from "@/server/actions/costs";
import type { CostRawInput } from "@/lib/validations/cost";
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

const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  label: string;
  category: string;
  costAmount: string;
  paidAmount: string;
  currency: string;
  paid: boolean;
  paidAt: string;
  dueDate: string;
  /** CONTEXT.md "Settlement". */
  settlement: CostSettlement;
  /** While true, the paid amount mirrors the cost as it's typed (Travelling default, spec §K). */
  paidFollowsCost: boolean;
}

const PLAIN_DEFAULTS = (homeCurrency: string): OtherCostDefaults => ({ currency: homeCurrency, settlement: "BEFORE", paidToday: false });

function defaultFormState(defaults: OtherCostDefaults): FormState {
  return {
    label: "",
    category: "",
    costAmount: "",
    paidAmount: "",
    currency: defaults.currency,
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
    label: cost.label ?? "",
    category: cost.category ?? "",
    costAmount: formatMinor(cost.costMinor, cost.currency),
    paidAmount:
      cost.paidMinor !== null && cost.paidMinor !== undefined
        ? formatMinor(cost.paidMinor, cost.currency)
        : "",
    currency: cost.currency,
    // `paidAt` is the sole "is this paid" signal (CONTEXT.md "Paid") — a
    // legacy row with a paid amount but no date is NOT paid, and must open
    // with the box unticked so re-saving it doesn't fabricate a payment.
    paid: Boolean(cost.paidAt),
    paidAt: cost.paidAt ? new Date(cost.paidAt).toISOString().slice(0, 10) : "",
    dueDate: cost.dueDate ?? "",
    settlement: isOnTrip(cost.settlement) ? "ON_TRIP" : "BEFORE",
    paidFollowsCost: false,
  };
}

/**
 * Validate + map form state to the server action's input shape.
 *
 * Returns `null` (with no side effect) when the cost amount is blank or
 * unparseable — the Cost field is required, and a blank/invalid entry must
 * surface a field error rather than silently coercing to 0 (that coercion is
 * exactly the bug ADR 0037 exists to kill, run in reverse: a paid amount
 * would then survive alongside a fabricated £0 cost).
 */
function parseFormToInput(form: FormState): CostRawInput | null {
  const costMinor = parseAmountToMinor(form.costAmount, form.currency);
  if (costMinor === null) return null;
  // Gated on the amount actually *parsing*, not just being non-blank — a
  // pasted "$150.00" or a lone "-" is non-blank text but parses to null.
  // The invariant is one-directional (ADR 0037): a paid *date* requires an
  // amount, but an amount with no date is a legal, honest, incomplete
  // record — so we never invent a date here. `todayLocalISO()` is only used for
  // the interactive pre-fill when the Paid box is ticked, where the user can
  // see and edit it before saving; it is never fabricated at submit time.
  // `costSchema.paidMinor`/`paidAt` are `.optional()` (not `.nullable()`),
  // so clearing sends `undefined`, never `null`.
  const parsedPaidMinor = form.paid
    ? parseAmountToMinor(form.paidAmount, form.currency)
    : null;
  const hasPaidAmount = parsedPaidMinor !== null;
  return {
    costMinor,
    paidMinor: hasPaidAmount ? parsedPaidMinor : undefined,
    currency: form.currency,
    paidAt: hasPaidAmount ? form.paidAt || undefined : undefined,
    ...(form.dueDate && !form.paid && !isOnTrip(form.settlement) ? { dueDate: form.dueDate } : {}),
    ownerType: "OTHER",
    label: form.label,
    category: form.category || undefined,
    settlement: form.settlement,
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
            description="Your best number — the real price if it's already booked."
            required
            error={errors.costMinor?.[0]}
          >
            <MoneyInput
              amount={form.costAmount}
              currency={form.currency}
              currencies={CURRENCY_CODES}
              onAmountChange={(v) =>
                setForm((f) => ({
                  ...f,
                  costAmount: v,
                  ...(f.paidFollowsCost ? { paidAmount: v } : {}),
                  // Clearing the Cost box hides the Paid block (below), but
                  // state would otherwise persist invisibly — clear it too so
                  // a blank cost can never save alongside a stale paid amount.
                  // A paid-today default stays ticked; its amount follows.
                  ...(v.trim() === "" && !f.paidFollowsCost ? { paid: false, paidAmount: "", paidAt: "" } : {}),
                }))
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
                    setForm((f) => ({
                      ...f,
                      paid: checked,
                      paidFollowsCost: checked && f.paidFollowsCost,
                      // Prefill both so confirming a cost that came to what
                      // you expected is a single tick (ADR 0037). Only on
                      // the interactive tick — never fabricated at submit
                      // time (see parseFormToInput).
                      paidAmount:
                        checked && !f.paidAmount.trim() && f.costAmount.trim()
                          ? f.costAmount
                          : f.paidAmount,
                      paidAt: checked && !f.paidAt.trim() ? todayLocalISO() : f.paidAt,
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

          <FormError>{errors._form?.[0]}</FormError>

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
    const input = parseFormToInput(form);
    if (!input) {
      setErrors({ costMinor: ["Enter the cost"] });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = cost ? await updateCost(cost.id, input) : await createCost(tripId, input);
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
