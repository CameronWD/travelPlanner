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
import { FormError } from "@/components/ui/form-error";
import { CostSummary } from "./cost-summary";
import { InlineCostFields } from "@/components/trip/inline-cost-fields";
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";
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
  costAmount: string;
  // A cost has a single currency (the DB model has one `currency` field).
  // Both the cost and paid inputs share this value.
  currency: string;
  paid: boolean;
  paidAmount: string;
  paidAt: string;
}

function defaultFormState(defaultCurrency: string): FormState {
  return {
    costAmount: "",
    currency: defaultCurrency,
    paid: false,
    paidAmount: "",
    paidAt: "",
  };
}

function costToFormState(cost: CostRow): FormState {
  return {
    costAmount: formatMinor(cost.costMinor, cost.currency),
    currency: cost.currency,
    // `paidAt` is the sole "is this paid" signal (CONTEXT.md "Paid") — a
    // legacy row with a paid amount but no date is NOT paid, and must open
    // with the box unticked so re-saving it doesn't fabricate a payment.
    paid: Boolean(cost.paidAt),
    paidAmount:
      cost.paidMinor !== null && cost.paidMinor !== undefined
        ? formatMinor(cost.paidMinor, cost.currency)
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
          {/* Cost + Paid toggle — same shape as the other three cost forms
              (InlineCostFields / other-cost-editor.tsx). Ticking Paid reveals
              and requires the paid amount, pre-filled with the cost so
              confirming a thing that cost what you expected is one gesture
              (ADR 0037). */}
          <InlineCostFields
            hasMultipleCosts={false}
            costAmount={form.costAmount}
            onCostChange={(v) =>
              setForm((f) => ({
                ...f,
                costAmount: v,
                // Clearing the Cost box hides the Paid block, but state would
                // otherwise persist invisibly — clear it too so a blank cost
                // can never save alongside a stale paid amount.
                ...(v.trim() === "" ? { paid: false, paidAmount: "", paidAt: "" } : {}),
              }))
            }
            currency={form.currency}
            onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            paid={form.paid}
            onPaidChange={(v) => setForm((f) => ({ ...f, paid: v }))}
            paidAmount={form.paidAmount}
            onPaidAmountChange={(v) => setForm((f) => ({ ...f, paidAmount: v }))}
            paidAt={form.paidAt}
            onPaidAtChange={(v) => setForm((f) => ({ ...f, paidAt: v }))}
            errors={errors}
            disabled={submitting}
          />

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
              loading={submitting}
            >
              Save
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

  /**
   * Validate + map form state to the server action's input shape.
   *
   * Returns `null` (with no side effect) when the cost amount is blank or
   * unparseable — the Cost field is required, and a blank/invalid entry must
   * surface a field error rather than silently coercing to 0 (that coercion
   * is exactly the bug ADR 0037 exists to kill, run in reverse: a paid
   * amount would then survive alongside a fabricated £0 cost).
   */
  function parseFormToInput(form: FormState): CostRawInput | null {
    const costMinor = parseAmountToMinor(form.costAmount, form.currency);
    if (costMinor === null) return null;

    // Gated on the amount actually *parsing*, not just being non-blank — a
    // pasted "$150.00" or a lone "-" is non-blank text but parses to null.
    // The invariant is one-directional (ADR 0037): a paid *date* requires an
    // amount, but an amount with no date is a legal, honest, incomplete
    // record — so we never invent a date here.
    const parsedPaidMinor = form.paid
      ? parseAmountToMinor(form.paidAmount, form.currency)
      : null;
    const hasPaidAmount = parsedPaidMinor !== null;

    return {
      costMinor,
      paidMinor: hasPaidAmount ? parsedPaidMinor : undefined,
      currency: form.currency,
      paidAt: hasPaidAmount ? form.paidAt || undefined : undefined,
      ownerType,
      ownerId,
    };
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleAddSubmit(form: FormState) {
    const input = parseFormToInput(form);
    if (!input) {
      setErrors({ costMinor: ["Enter the cost"] });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = await createCost(tripId, input);
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
    const input = parseFormToInput(form);
    if (!input) {
      setErrors({ costMinor: ["Enter the cost"] });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = await updateCost(editingCost.id, input);
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
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-muted/40 border border-border/50",
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
