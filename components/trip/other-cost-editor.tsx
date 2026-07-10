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
  estimatedAmount: string;
  actualAmount: string;
  currency: string;
  paidAt: string;
}

function defaultFormState(defaultCurrency: string): FormState {
  return {
    label: "",
    category: "",
    estimatedAmount: "",
    actualAmount: "",
    currency: defaultCurrency,
    paidAt: "",
  };
}

function costToFormState(cost: CostRow): FormState {
  return {
    label: cost.label ?? "",
    category: cost.category ?? "",
    estimatedAmount: formatMinor(cost.estimatedMinor, cost.currency),
    actualAmount:
      cost.actualMinor !== null && cost.actualMinor !== undefined
        ? formatMinor(cost.actualMinor, cost.currency)
        : "",
    currency: cost.currency,
    paidAt: cost.paidAt ? new Date(cost.paidAt).toISOString().slice(0, 10) : "",
  };
}

function parseFormToInput(form: FormState): CostRawInput {
  const estimatedMinor = parseAmountToMinor(form.estimatedAmount, form.currency) ?? 0;
  const actualMinor =
    form.actualAmount.trim() !== ""
      ? (parseAmountToMinor(form.actualAmount, form.currency) ?? undefined)
      : undefined;
  return {
    estimatedMinor,
    actualMinor,
    currency: form.currency,
    paidAt: form.paidAt || undefined,
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

          {/* Estimated */}
          <Field label="Estimated cost" required error={errors.estimatedMinor?.[0]}>
            <MoneyInput
              amount={form.estimatedAmount}
              currency={form.currency}
              currencies={CURRENCY_CODES}
              onAmountChange={(v) => setForm((f) => ({ ...f, estimatedAmount: v }))}
              onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              disabled={submitting}
              invalid={Boolean(errors.estimatedMinor)}
              aria-label="Estimated cost amount"
            />
          </Field>

          {/* Actual */}
          <Field
            label="Actual cost"
            description="Leave blank if you haven't paid yet."
            error={errors.actualMinor?.[0]}
          >
            <MoneyInput
              amount={form.actualAmount}
              currency={form.currency}
              currencies={CURRENCY_CODES}
              onAmountChange={(v) => setForm((f) => ({ ...f, actualAmount: v }))}
              onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              disabled={submitting}
              invalid={Boolean(errors.actualMinor)}
              aria-label="Actual cost amount"
            />
          </Field>

          {/* Paid date */}
          <Field
            label="Date paid"
            description="Optional — when the cost was paid."
            error={errors.paidAt?.[0]}
          >
            <Input
              type="date"
              value={form.paidAt}
              onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
              disabled={submitting}
              className="w-full"
            />
          </Field>

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
            <Button type="submit" variant="primary" size="md" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
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
          title="No other costs yet"
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
                  <span>{formatMoney(cost.estimatedMinor, cost.currency)}</span>
                  {cost.actualMinor !== null && cost.actualMinor !== undefined && (
                    <>
                      <span className="text-muted-foreground/40">→</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatMoney(cost.actualMinor, cost.currency)} paid
                      </span>
                    </>
                  )}
                  {homeCurrency &&
                    cost.rateToHome &&
                    cost.currency.toUpperCase() !== homeCurrency.toUpperCase() && (
                      <span className="text-muted-foreground/60">
                        ≈&nbsp;
                        {formatMoney(
                          convertMinor(cost.estimatedMinor, cost.currency, homeCurrency, cost.rateToHome),
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
