"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { CATEGORIES, type Category } from "@/lib/categories";
import { CategoryPill } from "./category-pill";
import { FormError } from "@/components/ui/form-error";
import { createItem, updateItem } from "@/server/actions/items";
import type { ItemCardItem } from "./item-card";

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
}: ItemFormDialogProps) {
  const formKey = open ? `${item?.id ?? "new"}-${String(open)}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit idea" : "Add idea"}
          </DialogTitle>
        </DialogHeader>
        <ItemForm
          key={formKey}
          tripId={tripId}
          stops={stops}
          tripStartDate={tripStartDate}
          item={item}
          defaultUnscheduled={defaultUnscheduled}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
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
  label = "Add idea",
}: {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string;
  defaultUnscheduled?: boolean;
  /** Button label. Defaults to "Add idea". */
  label?: string;
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
      />
    </>
  );
}

export function EditItemButton({
  tripId,
  stops,
  item,
}: {
  tripId: string;
  stops: StopOption[];
  item: ItemCardItem;
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
        title="Edit idea"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      <ItemFormDialog
        tripId={tripId}
        stops={stops}
        item={item}
        open={open}
        onOpenChange={setOpen}
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
}

function ItemForm({
  tripId,
  stops,
  tripStartDate,
  item,
  defaultUnscheduled,
  onClose,
  onSaved,
}: ItemFormProps) {
  const isEdit = Boolean(item);

  const [title, setTitle] = React.useState(item?.title ?? "");
  const [category, setCategory] = React.useState<Category>(
    (item?.category as Category) ?? "SIGHTSEEING",
  );
  const [stopId, setStopId] = React.useState(item?.stopId ?? "");
  const [date, setDate] = React.useState(
    item?.date ?? (defaultUnscheduled ? "" : (tripStartDate ?? "")),
  );
  const [startTime, setStartTime] = React.useState(item?.startTime ?? "");
  const [endTime, setEndTime] = React.useState(item?.endTime ?? "");
  const [address, setAddress] = React.useState(item?.address ?? "");
  const [link, setLink] = React.useState(item?.link ?? "");
  const [booking, setBooking] = React.useState(item?.booking ?? "");
  const [notes, setNotes] = React.useState(item?.notes ?? "");

  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isPending, startTransition] = React.useTransition();

  // Disable time inputs when no date is set
  const timesDisabled = !date;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

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
    };

    startTransition(async () => {
      const result =
        isEdit && item
          ? await updateItem(item.id, input)
          : await createItem(tripId, input);

      if (!result.success) {
        setErrors(result.errors as FormErrors);
        return;
      }
      onClose();
      onSaved?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Title */}
      <Field label="Title" required error={errors.title?.[0]}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Visit the night market"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Category */}
      <Field label="Category" error={errors.category?.[0]}>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value as Category)}
              disabled={isPending}
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
      </Field>

      {/* Stop (optional) */}
      {stops.length > 0 && (
        <Field label="Stop" error={errors.stopId?.[0]}>
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
        description="Leave blank to keep this as an unscheduled idea"
        error={errors.date?.[0]}
        disabled={isPending}
      />

      {/* Times (enabled only when date is set) */}
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Start time"
          error={errors.startTime?.[0]}
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
          error={errors.endTime?.[0]}
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
      <Field label="Address" error={errors.address?.[0]}>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 12 Rue de la Paix, Paris"
          disabled={isPending}
        />
      </Field>

      {/* Link */}
      <Field label="Link" error={errors.link?.[0]}>
        <Input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
          disabled={isPending}
        />
      </Field>

      {/* Booking reference */}
      <Field label="Booking reference" error={errors.booking?.[0]}>
        <Input
          value={booking}
          onChange={(e) => setBooking(e.target.value)}
          placeholder="e.g. BOOK-12345"
          disabled={isPending}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes" error={errors.notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else worth knowing…"
          disabled={isPending}
        />
      </Field>

      <FormError>{errors._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          {isEdit ? "Save changes" : "Add idea"}
        </Button>
      </DialogFooter>
    </form>
  );
}
