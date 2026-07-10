"use client";

import * as React from "react";
import { Plus, Pencil, X } from "lucide-react";
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
import { MoneyInput } from "@/components/ui/money-input";
import { CostSummary } from "./cost-summary";
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";
import { CURRENCIES } from "@/lib/currencies";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { CostOwnerType } from "@/lib/enums";
import type { CostRow } from "@/server/actions/costs";
import type { CostRawInput } from "@/lib/validations/cost";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostEditorProps {
  /** Trip ID for createCost */
  tripId: string;
  /** ownerType for new costs — TRANSPORT | ACCOMMODATION | ITEM */
  ownerType: Exclude<CostOwnerType, "OTHER">;
  /** ownerId for new costs */
  ownerId: string;
  /** Existing costs on this entity */
  costs: CostRow[];
  /** Trip's home currency (for equivalent display) */
  homeCurrency?: string;
  /** Default currency when opening the editor (defaults to homeCurrency or AUD) */
  defaultCurrency?: string;
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  estimatedAmount: string;
  // A cost has a single currency (the DB model has one `currency` field).
  // Both the estimated and actual inputs share this value.
  currency: string;
  actualAmount: string;
  paidAt: string;
}

function defaultFormState(defaultCurrency: string): FormState {
  return {
    estimatedAmount: "",
    currency: defaultCurrency,
    actualAmount: "",
    paidAt: "",
  };
}

function costToFormState(cost: CostRow): FormState {
  return {
    estimatedAmount: formatMinor(cost.estimatedMinor, cost.currency),
    currency: cost.currency,
    actualAmount:
      cost.actualMinor !== null && cost.actualMinor !== undefined
        ? formatMinor(cost.actualMinor, cost.currency)
        : "",
    paidAt: cost.paidAt
      ? new Date(cost.paidAt).toISOString().slice(0, 10)
      : "",
  };
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

interface CostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (form: FormState) => Promise<void>;
  initialState: FormState;
  submitting: boolean;
  errors: Record<string, string[]>;
  onCancel: () => void;
}

const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/**
 * Inner form, mounted fresh each time (via `key` in CostEditor).
 * Receives `initialState` as the starting value only on mount.
 */
function CostDialogForm({
  open,
  onOpenChange,
  title,
  onSubmit,
  initialState,
  submitting,
  errors,
  onCancel,
}: CostDialogProps) {
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
          {/* Estimated */}
          <Field
            label="Estimated cost"
            required
            error={errors.estimatedMinor?.[0]}
          >
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
              onChange={(e) =>
                setForm((f) => ({ ...f, paidAt: e.target.value }))
              }
              disabled={submitting}
              className="w-full"
            />
          </Field>

          {/* Form-level error */}
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
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main CostEditor component
// ---------------------------------------------------------------------------

/**
 * Inline cost panel rendered inside entity cards (TransportCard,
 * AccommodationCard, ItemCard). Shows existing costs + Add/Edit/Delete.
 *
 * Only handles TRANSPORT | ACCOMMODATION | ITEM costs (not OTHER).
 */
export function CostEditor({
  tripId,
  ownerType,
  ownerId,
  costs,
  homeCurrency,
  defaultCurrency,
}: CostEditorProps) {
  const { confirm, dialog } = useConfirm();
  const baseCurrency = defaultCurrency ?? homeCurrency ?? "AUD";

  const [addOpen, setAddOpen] = React.useState(false);
  const [editingCost, setEditingCost] = React.useState<CostRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function parseFormToInput(form: FormState): CostRawInput {
    // Parse estimated amount → minor units
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
      ownerType,
      ownerId,
    };
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-1.5">
      {/* Existing costs */}
      {costs.length > 0 && (
        <AnimatedList className="flex flex-col gap-1">
          {costs.map((cost) => (
            <AnimatedItem
              key={cost.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1 bg-muted/40",
                pendingDeleteId === cost.id && "opacity-50 pointer-events-none",
              )}
            >
              <CostSummary
                cost={cost}
                homeCurrency={homeCurrency}
                className="flex-1 min-w-0"
              />

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => {
                    setErrors({});
                    setEditingCost(cost);
                  }}
                  aria-label="Edit Cost"
                  title="Edit"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(cost.id)}
                  aria-label="Delete Cost"
                  title="Delete"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}

      {/* Add cost button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground self-start"
        onClick={() => {
          setErrors({});
          setAddOpen(true);
        }}
      >
        <Plus className="size-3" aria-hidden="true" />
        Add Cost
      </Button>

      {/* Add dialog — key={addOpen} forces a fresh mount each open */}
      <CostDialogForm
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) setAddOpen(false);
        }}
        title="Add Cost"
        onSubmit={handleAddSubmit}
        initialState={defaultFormState(baseCurrency)}
        submitting={submitting}
        errors={errors}
        onCancel={() => setAddOpen(false)}
      />

      {/* Edit dialog — key=cost.id forces a fresh mount per cost */}
      {editingCost && (
        <CostDialogForm
          key={editingCost.id}
          open={Boolean(editingCost)}
          onOpenChange={(open) => {
            if (!open) setEditingCost(null);
          }}
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
