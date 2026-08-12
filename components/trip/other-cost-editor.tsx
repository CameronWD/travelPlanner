"use client";

import * as React from "react";
import { Plus, Pencil, X, ReceiptText } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState } from "@/components/ui/empty-state";
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";
import { CURRENCIES } from "@/lib/currencies";
import { formatMoney, formatMinor, parseAmountToMinor, convertMinor } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { CostRow } from "@/server/actions/costs";
import type { CostRawInput } from "@/lib/validations/cost";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";

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

export interface OtherCostEditorProps {
  tripId: string;
  costs: CostRow[];
  homeCurrency?: string;
  defaultCurrency?: string;
}

interface FormState {
  label: string;
  category: string;
  costAmount: string;
  paidAmount: string;
  currency: string;
  paid: boolean;
  paidAt: string;
}

function defaultFormState(defaultCurrency: string): FormState {
  return {
    label: "",
    category: "",
    costAmount: "",
    paidAmount: "",
    currency: defaultCurrency,
    paid: false,
    paidAt: "",
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
    // Either field alone counts: legacy rows from before ADR 0037 can carry a
    // paid amount with no date (or vice versa isn't possible — see the
    // schema refinement), so editing one must open with the box already
    // ticked rather than requiring paidAt specifically.
    paid:
      Boolean(cost.paidAt) ||
      (cost.paidMinor !== null && cost.paidMinor !== undefined),
    paidAt: cost.paidAt ? new Date(cost.paidAt).toISOString().slice(0, 10) : "",
  };
}

function parseFormToInput(form: FormState): CostRawInput {
  const costMinor = parseAmountToMinor(form.costAmount, form.currency) ?? 0;
  // Gated on the amount actually *parsing*, not just being non-blank — a
  // pasted "$150.00" or a lone "-" is non-blank text but parses to null.
  // The invariant is one-directional (ADR 0037): a paid *date* requires an
  // amount, but an amount with no date is a legal, honest, incomplete
  // record — so we never invent a date here. `todayISO()` is only used for
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
    ownerType: "OTHER",
    label: form.label,
    category: form.category || undefined,
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
              onAmountChange={(v) => setForm((f) => ({ ...f, costAmount: v }))}
              onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              disabled={submitting}
              invalid={Boolean(errors.costMinor)}
              aria-label="Cost amount"
            />
          </Field>

          {form.costAmount.trim() && (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      paid: checked,
                      // Prefill both so confirming a cost that came to what
                      // you expected is a single tick (ADR 0037). Only on
                      // the interactive tick — never fabricated at submit
                      // time (see parseFormToInput).
                      paidAmount:
                        checked && !f.paidAmount.trim() && f.costAmount.trim()
                          ? f.costAmount
                          : f.paidAmount,
                      paidAt: checked && !f.paidAt.trim() ? todayISO() : f.paidAt,
                    }));
                  }}
                  disabled={submitting}
                  className="size-4 rounded border-input accent-primary"
                />
                Paid
              </label>

              {form.paid && (
                <>
                  <Field label="You paid" error={errors.paidMinor?.[0]}>
                    <MoneyInput
                      amount={form.paidAmount}
                      currency={form.currency}
                      currencies={CURRENCY_CODES}
                      onAmountChange={(v) => setForm((f) => ({ ...f, paidAmount: v }))}
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
// Main component
// ---------------------------------------------------------------------------

/**
 * Manages standalone (OTHER) costs — the catch-all for costs not attached to a
 * transport, accommodation, or activity: insurance, visas, eSIMs, etc.
 */
export function OtherCostEditor({
  tripId,
  costs,
  homeCurrency,
  defaultCurrency,
}: OtherCostEditorProps) {
  const { confirm, dialog } = useConfirm();
  const baseCurrency = defaultCurrency ?? homeCurrency ?? "AUD";

  const [addOpen, setAddOpen] = React.useState(false);
  const [editingCost, setEditingCost] = React.useState<CostRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  async function handleAddSubmit(form: FormState) {
    setSubmitting(true);
    setErrors({});
    try {
      const result = await createCost(tripId, parseFormToInput(form));
      if (result.success) {
        setAddOpen(false);
      } else {
        setErrors(result.errors);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(form: FormState) {
    if (!editingCost) return;
    setSubmitting(true);
    setErrors({});
    try {
      const result = await updateCost(editingCost.id, parseFormToInput(form));
      if (result.success) {
        setEditingCost(null);
      } else {
        setErrors(result.errors);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(costId: string) {
    const cost = costs.find((c) => c.id === costId);
    const confirmed = await confirm({
      title: `Delete "${cost?.label ?? "this cost"}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setPendingDeleteId(costId);
    try {
      await deleteCost(costId);
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 self-start"
        onClick={() => {
          setErrors({});
          setAddOpen(true);
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add Cost
      </Button>

      {costs.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No other costs yet."
          description="Add trip-wide costs like insurance, visas, eSIMs, and spending money here."
          className="py-8"
        />
      ) : (
        <AnimatedList className="flex flex-col gap-1" data-testid="other-cost-list">
          {costs.map((cost) => (
            <AnimatedItem
              key={cost.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-muted/40 border border-border/50",
                pendingDeleteId === cost.id && "opacity-50 pointer-events-none",
              )}
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate min-w-0">
                    {cost.label ?? "Cost"}
                  </span>
                  {cost.category && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {cost.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatMoney(cost.costMinor, cost.currency)}</span>
                  {cost.paidMinor !== null && cost.paidMinor !== undefined && (
                    <>
                      <span className="text-muted-foreground/40">→</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatMoney(cost.paidMinor, cost.currency)} paid
                      </span>
                    </>
                  )}
                  {homeCurrency &&
                    cost.rateToHome &&
                    cost.currency.toUpperCase() !== homeCurrency.toUpperCase() && (
                      <span className="text-muted-foreground/60">
                        ≈&nbsp;
                        {formatMoney(
                          convertMinor(cost.costMinor, cost.currency, homeCurrency, cost.rateToHome),
                          homeCurrency,
                        )}
                      </span>
                    )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => {
                    setErrors({});
                    setEditingCost(cost);
                  }}
                  aria-label={`Edit ${cost.label ?? "cost"}`}
                  title="Edit"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(cost.id)}
                  aria-label={`Delete ${cost.label ?? "cost"}`}
                  title="Delete"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}

      <OtherCostDialog
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        onOpenChange={(open) => { if (!open) setAddOpen(false); }}
        title="Add Other Cost"
        onSubmit={handleAddSubmit}
        initialState={defaultFormState(baseCurrency)}
        submitting={submitting}
        errors={errors}
        onCancel={() => setAddOpen(false)}
      />

      {editingCost && (
        <OtherCostDialog
          key={editingCost.id}
          open={Boolean(editingCost)}
          onOpenChange={(open) => { if (!open) setEditingCost(null); }}
          title="Edit Cost"
          onSubmit={handleEditSubmit}
          initialState={costToFormState(editingCost)}
          submitting={submitting}
          errors={errors}
          onCancel={() => setEditingCost(null)}
        />
      )}

      {dialog}
    </div>
  );
}
