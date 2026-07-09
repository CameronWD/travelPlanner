"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, useFieldControl } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { CATEGORIES, type Category } from "@/lib/categories";
import { CategoryPill } from "./category-pill";
import { FormError } from "@/components/ui/form-error";
import { createItem, updateItem } from "@/server/actions/items";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import type { ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/trip/inline-cost-fields";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopOption {
  id: string;
  name: string;
}

interface FormErrors {
  title?: string[];
  category?: string[];
  stopId?: string[];
  date?: string[];
  startTime?: string[];
  endTime?: string[];
  address?: string[];
  link?: string[];
  booking?: string[];
  notes?: string[];
  estimatedMinor?: string[];
  currency?: string[];
  actualMinor?: string[];
  paidAt?: string[];
  _form?: string[];
}

export interface ItemFormDialogProps {
  tripId: string;
  stops: StopOption[];
  /** The trip's start date — used to default the date field when in scheduled mode. */
  tripStartDate?: string;
  /** When provided the form is in edit mode. */
  item?: ItemCardItem | null;
  /** Default the form to unscheduled (no date). Overridden when item has a date. */
  defaultUnscheduled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Trip's home currency — used as default for the cost currency picker. */
  homeCurrency?: string;
  /**
   * Existing costs on the item (edit mode only).
   * When exactly one cost is present, the cost fields are pre-filled from it.
   * When >1 costs are present, the cost fields are hidden (CostEditor is authoritative).
   */
  costs?: CostRow[];
  /**
   * Fork (plan variant) id to scope the new item to. When null/undefined the item
   * is created on the real plan. Passed through to createItem as the third argument.
   */
  forkId?: string | null;
  /**
   * Pre-select this stop in the Stop dropdown (for "Add a thing to do" under a stop).
   * Only applied on create (ignored in edit mode where the item's own stopId wins).
   */
  defaultStopId?: string | null;
}

// ---------------------------------------------------------------------------
// CategoryGroup — pill selector wired to the surrounding <Field> context
// ---------------------------------------------------------------------------

interface CategoryGroupProps {
  category: Category;
  onSelect: (cat: Category) => void;
  disabled?: boolean;
}

function CategoryGroup({ category, onSelect, disabled }: CategoryGroupProps) {
  const fieldControl = useFieldControl();
  return (
    <div
      role="group"
      aria-label="Category"
      {...fieldControl}
      className="flex flex-wrap gap-2"
    >
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onSelect(cat.value as Category)}
          disabled={disabled}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
          aria-pressed={category === cat.value}
        >
          <CategoryPill
            category={cat.value as Category}
            className={
              category === cat.value
                ? "ring-2 ring-offset-2 ring-offset-background ring-current"
                : "opacity-60 hover:opacity-90"
            }
          />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

export function ItemFormDialog({
  tripId,
  stops,
  tripStartDate,
  item,
  defaultUnscheduled = true,
  open,
  onOpenChange,
  onSaved,
  homeCurrency,
  costs,
  forkId,
  defaultStopId,
}: ItemFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit Item" : "Add Item"}
      recordId={item?.id ?? null}
    >
      <ItemForm
        tripId={tripId}
        stops={stops}
        tripStartDate={tripStartDate}
        item={item}
        defaultUnscheduled={defaultUnscheduled}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
        homeCurrency={homeCurrency}
        costs={costs}
        forkId={forkId}
        defaultStopId={item ? undefined : defaultStopId}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Trigger buttons
// ---------------------------------------------------------------------------

export function AddItemButton({
  tripId,
  stops,
  tripStartDate,
  defaultUnscheduled = true,
  label = "Add Item",
  homeCurrency,
}: {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string;
  defaultUnscheduled?: boolean;
  /** Button label. Defaults to "Add Item". */
  label?: string;
  homeCurrency?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      <ItemFormDialog
        tripId={tripId}
        stops={stops}
        tripStartDate={tripStartDate}
        defaultUnscheduled={defaultUnscheduled}
        open={open}
        onOpenChange={setOpen}
        homeCurrency={homeCurrency}
      />
    </>
  );
}

export function EditItemButton({
  tripId,
  stops,
  item,
  homeCurrency,
  costs,
}: {
  tripId: string;
  stops: StopOption[];
  item: ItemCardItem;
  homeCurrency?: string;
  costs?: CostRow[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${item.title}`}
        title="Edit Item"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      <ItemFormDialog
        tripId={tripId}
        stops={stops}
        item={item}
        open={open}
        onOpenChange={setOpen}
        homeCurrency={homeCurrency}
        costs={costs}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

interface ItemFormProps {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string;
  item?: ItemCardItem | null;
  defaultUnscheduled: boolean;
  onClose: () => void;
  onSaved?: () => void;
  homeCurrency?: string;
  costs?: CostRow[];
  /** Fork id — threaded to createItem so the item is plan-owned. */
  forkId?: string | null;
  /** Pre-select this stop on create (ignored in edit mode). */
  defaultStopId?: string | null;
}

function ItemForm({
  tripId,
  stops,
  tripStartDate,
  item,
  defaultUnscheduled,
  onClose,
  onSaved,
  homeCurrency,
  costs,
  forkId,
  defaultStopId,
}: ItemFormProps) {
  const isEdit = Boolean(item);

  // Determine the single existing cost (if any) for prefill.
  // When >1 costs exist the CostEditor is authoritative — hide the inline fields.
  const singleCost = costs?.length === 1 ? costs[0] : null;
  const hasMultipleCosts = (costs?.length ?? 0) > 1;

  const defaultCurrency = homeCurrency ?? "AUD";

  const [title, setTitle] = React.useState(item?.title ?? "");
  const [category, setCategory] = React.useState<Category>(
    (item?.category as Category) ?? "SIGHTSEEING",
  );
  const [stopId, setStopId] = React.useState(item?.stopId ?? defaultStopId ?? "");
  const [date, setDate] = React.useState(
    item?.date ?? (defaultUnscheduled ? "" : (tripStartDate ?? "")),
  );
  const [startTime, setStartTime] = React.useState(item?.startTime ?? "");
  const [endTime, setEndTime] = React.useState(item?.endTime ?? "");
  const [address, setAddress] = React.useState(item?.address ?? "");
  const [link, setLink] = React.useState(item?.link ?? "");
  const [booking, setBooking] = React.useState(item?.booking ?? "");
  const [notes, setNotes] = React.useState(item?.notes ?? "");

  // Inline cost fields
  const [estimatedAmount, setEstimatedAmount] = React.useState(
    singleCost ? formatMinor(singleCost.estimatedMinor, singleCost.currency) : "",
  );
  const [currency, setCurrency] = React.useState(
    singleCost?.currency ?? defaultCurrency,
  );
  const [actualAmount, setActualAmount] = React.useState(
    singleCost && singleCost.actualMinor !== null && singleCost.actualMinor !== undefined
      ? formatMinor(singleCost.actualMinor, singleCost.currency)
      : "",
  );
  const [paidAt, setPaidAt] = React.useState(
    singleCost?.paidAt ? new Date(singleCost.paidAt).toISOString().slice(0, 10) : "",
  );

  // Disable time inputs when no date is set
  const timesDisabled = !date;

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: () => {
      const estimatedMinor = estimatedAmount.trim()
        ? (parseAmountToMinor(estimatedAmount, currency) ?? undefined)
        : undefined;
      const actualMinor = actualAmount.trim()
        ? (parseAmountToMinor(actualAmount, currency) ?? undefined)
        : undefined;

      const input = {
        title,
        category,
        stopId: stopId || undefined,
        date: date || undefined,
        // Clear times if no date (defensive belt-and-braces, schema also drops them)
        startTime: date && startTime ? startTime : undefined,
        endTime: date && endTime ? endTime : undefined,
        address: address.trim() || undefined,
        link: link.trim() || undefined,
        booking: booking.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(estimatedMinor !== undefined && {
          estimatedMinor,
          currency,
          actualMinor: actualMinor ?? null,
          paidAt: paidAt || null,
        }),
      };

      return isEdit && item
        ? updateItem(item.id, input)
        : createItem(tripId, input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Title */}
      <Field label="Title" required error={(errors as FormErrors).title?.[0]}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Visit the night market"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Category */}
      <Field label="Category" error={(errors as FormErrors).category?.[0]}>
        <CategoryGroup
          category={category}
          onSelect={setCategory}
          disabled={isPending}
        />
      </Field>

      {/* Stop (optional) */}
      {stops.length > 0 && (
        <Field label="Stop" error={(errors as FormErrors).stopId?.[0]}>
          <Select
            value={stopId}
            onValueChange={(v) => setStopId(v === "__none__" ? "" : v)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="— no stop yet —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— no stop yet —</SelectItem>
              {stops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {/* Date */}
      <DateField
        label="Date"
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          // Clear times when date is cleared
          if (!e.target.value) {
            setStartTime("");
            setEndTime("");
          }
        }}
        description="Leave blank to keep this as an unscheduled item"
        error={(errors as FormErrors).date?.[0]}
        disabled={isPending}
      />

      {/* Times (enabled only when date is set) */}
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Start time"
          error={(errors as FormErrors).startTime?.[0]}
          description={timesDisabled ? "Set a date first" : undefined}
        >
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={isPending || timesDisabled}
          />
        </Field>
        <Field
          label="End time"
          error={(errors as FormErrors).endTime?.[0]}
          description={timesDisabled ? "Set a date first" : !startTime ? "Set a start time first" : undefined}
        >
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={isPending || timesDisabled || !startTime}
          />
        </Field>
      </div>

      {/* Address */}
      <Field label="Address" error={(errors as FormErrors).address?.[0]}>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 12 Rue de la Paix, Paris"
          disabled={isPending}
        />
      </Field>

      {/* Link */}
      <Field label="Link" error={(errors as FormErrors).link?.[0]}>
        <Input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
          disabled={isPending}
        />
      </Field>

      {/* Booking reference */}
      <Field label="Booking reference" error={(errors as FormErrors).booking?.[0]}>
        <Input
          value={booking}
          onChange={(e) => setBooking(e.target.value)}
          placeholder="e.g. BOOK-12345"
          disabled={isPending}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes" error={(errors as FormErrors).notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else worth knowing…"
          disabled={isPending}
        />
      </Field>

      {/* Inline cost — hidden when >1 costs exist (CostEditor is authoritative) */}
      <InlineCostFields
        hasMultipleCosts={hasMultipleCosts}
        estimatedAmount={estimatedAmount}
        onEstimatedChange={setEstimatedAmount}
        currency={currency}
        onCurrencyChange={setCurrency}
        actualAmount={actualAmount}
        onActualChange={setActualAmount}
        paidAt={paidAt}
        onPaidAtChange={setPaidAt}
        errors={errors}
        disabled={isPending}
      />

      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          {isEdit ? "Save changes" : "Add Item"}
        </Button>
      </DialogFooter>
    </form>
  );
}
