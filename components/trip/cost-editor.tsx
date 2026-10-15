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
import { DateField } from "@/components/ui/date-field";
import { CostSummary } from "./cost-summary";
import { InlineCostFields } from "@/components/money/cost-fields/inline-cost-fields";
import {
  costToFormState as costToCostFormState,
  emptyCostFormState,
  setCostAmount,
  setPaid,
  toCostPayload,
  type CostFormState,
} from "@/components/money/cost-fields/cost-form-state";
import { todayLocalISO } from "@/lib/dates";
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";
import { cn } from "@/lib/cn";
import { isOnTrip, type CostOwnerType } from "@/lib/enum-values";
import type { CostRow } from "@/server/actions/costs";
import type { CostRawInput } from "@/lib/validations/cost";
import type { FieldErrors } from "@/lib/action-result";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toastRefused, toastRejected, formError } from "@/components/ui/action-failure";

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
  /**
   * The Plan this cost belongs to — `null`/absent is the real plan, a string
   * is a variant. Without it a cost added on a fork-active page is filed on
   * the real plan with an ownerId pointing at a fork-owned entity (AB-01).
   */
  forkId?: string | null;
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

/** The shared Cost form state (card 2.I) plus this editor's Due date. */
type FormState = CostFormState & { dueDate: string };

function defaultFormState(defaultCurrency: string): FormState {
  return { ...emptyCostFormState(defaultCurrency), dueDate: "" };
}

function costToFormState(cost: CostRow): FormState {
  return { ...costToCostFormState(cost), dueDate: cost.dueDate ?? "" };
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
            onCostChange={(v) => setForm((f) => setCostAmount(f, v))}
            currency={form.currency}
            onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            paid={form.paid}
            onPaidChange={(v) => setForm((f) => setPaid(f, v, todayLocalISO()))}
            paidAmount={form.paidAmount}
            onPaidAmountChange={(v) => setForm((f) => ({ ...f, paidAmount: v }))}
            paidAt={form.paidAt}
            onPaidAtChange={(v) => setForm((f) => ({ ...f, paidAt: v }))}
            settlement={form.settlement}
            onSettlementChange={(v) => setForm((f) => ({ ...f, settlement: v }))}
            errors={errors}
            disabled={submitting}
          />

          {/* Due date — money committed but not yet taken (CONTEXT.md "Due
              date"); only meaningful while the cost is unpaid. */}
          {/* An On the trip cost is never an upcoming payment (CONTEXT.md
              "Settlement"), so it takes no Due date. */}
          {!form.paid && !isOnTrip(form.settlement) && (
            <DateField
              label="Due date (optional)"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              disabled={submitting}
            />
          )}

          {/* Form-level error */}
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

/**
 * Validate + map form state to the server action's input shape, or the
 * field errors to show instead. A blank or unparseable cost is "Enter the
 * cost" (never coerced to 0 — ADR 0037 run in reverse), and Paid ticked with
 * no parseable paid amount is "Enter what you paid" (`toCostPayload`).
 */
function parseOwnedFormToInput(
  form: FormState,
  ownerType: Exclude<CostOwnerType, "OTHER">,
  ownerId: string,
): { input: CostRawInput } | { errors: FieldErrors } {
  const payload = toCostPayload(form);
  if (payload.kind === "none") return { errors: { costMinor: ["Enter the cost"] } };
  if (payload.kind === "invalid") return { errors: payload.errors };
  return {
    input: {
      ...payload.fields,
      ...(form.dueDate && !form.paid && !isOnTrip(form.settlement) ? { dueDate: form.dueDate } : {}),
      ownerType,
      ownerId,
    },
  };
}

// ---------------------------------------------------------------------------
// Standalone form dialog
// ---------------------------------------------------------------------------

export interface OwnedCostFormDialogProps {
  cost: CostRow;
  homeCurrency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edits a cost attached to a Transport, Accommodation or Item from outside
 * its card (Money's To pay ⋯ menu). Callers only offer it when `ownerId` is
 * set.
 */
export function OwnedCostFormDialog({ cost, open, onOpenChange }: OwnedCostFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  async function handleSubmit(form: FormState) {
    const parsed = parseOwnedFormToInput(form, cost.ownerType as Exclude<CostOwnerType, "OTHER">, cost.ownerId!);
    if ("errors" in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = await updateCost(cost.id, parsed.input);
      if (result.success) onOpenChange(false);
      else setErrors(result.errors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CostDialogForm
      key={open ? cost.id : "closed"}
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setErrors({});
          onOpenChange(false);
        }
      }}
      title="Edit cost"
      onSubmit={handleSubmit}
      initialState={costToFormState(cost)}
      submitting={submitting}
      errors={errors}
      onCancel={() => onOpenChange(false)}
    />
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
  forkId,
}: CostEditorProps) {
  const { confirm, dialog } = useConfirm();
  const baseCurrency = defaultCurrency ?? homeCurrency ?? "AUD";

  const [addOpen, setAddOpen] = React.useState(false);
  const [editingCost, setEditingCost] = React.useState<CostRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleAddSubmit(form: FormState) {
    const parsed = parseOwnedFormToInput(form, ownerType, ownerId);
    if ("errors" in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = await createCost(tripId, parsed.input, forkId);
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
    const parsed = parseOwnedFormToInput(form, ownerType, ownerId);
    if ("errors" in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = await updateCost(editingCost.id, parsed.input);
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
      const r = await deleteCost(costId);
      if (!r.success) toastRefused(r.errors, "Couldn't delete that cost.");
    } catch {
      toastRejected("Couldn't delete that cost.");
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
                "flex items-center justify-between gap-2 rounded-md border-2 border-border bg-background px-3 py-2",
                pendingDeleteId === cost.id && "opacity-50 pointer-events-none",
              )}
            >
              <CostSummary
                cost={cost}
                homeCurrency={homeCurrency}
                className="flex-1 min-w-0"
              />

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="tap-target size-8"
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
                  className="tap-target size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
