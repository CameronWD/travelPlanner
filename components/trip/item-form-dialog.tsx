"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, useFieldControl } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toastRefused, toastRejected, formError } from "@/components/ui/action-failure";
import { createItem, updateItem, deleteItem } from "@/server/actions/items";
import { setItemPhoto, removeItemPhoto } from "@/server/actions/item-photo";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import type { ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog, useFormDirty } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/money/cost-fields/inline-cost-fields";
import { useCostFields } from "@/components/money/cost-fields/use-cost-fields";
import { seedCostFormState } from "@/lib/money/cost-form-state";
import { fail, type ActionResult } from "@/lib/action-result";
import { toPatch } from "@/lib/patch";
import { BookingStateField, seedFromProposal, useBookingStateField } from "./booking-state-field";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { refundLabel, slotLabel, startFromSlot } from "@/lib/slot-time";
import type { ProposedItemInput } from "@/lib/booking-import/types";
import type { ItemInput } from "@/lib/validations/item";
import { useDraftReporter } from "@/components/ui/use-draft-reporter";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { ItemPhotoThumb } from "@/components/trip/item-photo-thumb";
import { ReminderList } from "@/components/trip/reminder-list";
import type { ReminderItem } from "@/lib/reminder-about";
import { SM_HIT } from "@/components/ui/touch-target";
import { cn } from "@/lib/cn";
import { travellerFirstName, type TravellerLike } from "@/lib/traveller";
import type { StopOption } from "@/lib/plan-entity-views";

export type { StopOption };

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
  /**
   * Pre-fill the Date field on create (for "+ Add" on a specific day row).
   * Ignored in edit mode where the item's own date wins.
   */
  defaultDate?: string;
  /** Existing attachments for this item (edit mode only). */
  attachments?: AttachmentView[];
  /** Reminders about this thing to do (edit mode, real plan only — spec F8). */
  reminders?: ReminderItem[];
  /** Opens Add a Reminder about this thing to do; omitted on a Fork's Item. */
  onAddReminder?: () => void;
  /** The Trip's Travellers. With `currentUserId`, shows "Surprise for…" (CONTEXT.md Surprise). */
  members?: TravellerLike[];
  currentUserId?: string;
  /** Booking import (Proposal mode): seeds a NEW record's fields. Ignored when editing a saved one. */
  initialValues?: Partial<ProposedItemInput>;
  /** Proposal mode: told the would-be input on every change (live preview). */
  onDraftChange?: (input: ProposedItemInput) => void;
  /** Proposal mode: replaces the create call; the save button reads "Confirm". */
  onSubmitOverride?: (input: ProposedItemInput) => Promise<ActionResult>;
  /** Proposal mode: a live preview card shown at the top of the form. */
  preview?: React.ReactNode;
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
          className="tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
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
// Photo field (CONTEXT.md "Item photo", spec §I)
// ---------------------------------------------------------------------------

/**
 * The Item dialog's own Photo field: a preview (opens the full-size lightbox
 * on tap, `ItemPhotoThumb`) plus Replace/Remove once a photo is set, or a
 * single "Add a photo" control when there isn't one. Wired straight to
 * `setItemPhoto`/`removeItemPhoto` (Task 8) — its own, independent save, same
 * as the sibling Attachments field, not part of the surrounding form's submit.
 *
 * Only rendered once the Item exists (edit mode) — `setItemPhoto` needs a
 * real `itemId`, same restriction as the Attachments field below it.
 */
function ItemPhotoField({
  itemId,
  photoUrl: initialPhotoUrl,
  title,
  disabled,
}: {
  itemId: string;
  photoUrl: string | null;
  /** Current title (live-edited) — used as the photo's alt text. */
  title: string;
  disabled?: boolean;
}) {
  const [photoUrl, setPhotoUrl] = React.useState(initialPhotoUrl);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = React.useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await uploadFile(file);
  }

  // Spec §I: "upload, or drop an image" — a drop feeds the same upload path
  // as the file picker. Only image files are taken.
  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (disabled || uploading) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!dragOver) setDragOver(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    // Ignore leaves into a child of the zone.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragOver(false);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    const file = files.find((f) => f.type.startsWith("image/"));
    if (!file) {
      if (files.length > 0) setError("That isn't an image. Drop a photo instead.");
      return;
    }
    await uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        setError(oversize);
        return;
      }
      const formData = new FormData();
      formData.set("itemId", itemId);
      formData.set("file", compressed);
      const result = await setItemPhoto(formData);
      if (!result.success) {
        const firstError = Object.values(result.errors)[0]?.[0];
        setError(firstError ?? "Couldn't upload that photo. Try again.");
        return;
      }
      // The server holds the real Attachment; its url is deterministic
      // (`/api/attachments/<id>`, lib/item-photo.ts) so this optimistic value
      // matches what the next layout revalidation (setItemPhoto's own
      // revalidatePath) will bring down anyway.
      setPhotoUrl(`/api/attachments/${result.attachmentId}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError(null);
    try {
      const result = await removeItemPhoto(itemId);
      if (!result.success) {
        setError("Couldn't remove that photo. Try again.");
        return;
      }
      setPhotoUrl(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      data-slot="item-photo-dropzone"
      data-dragging={dragOver ? "" : undefined}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
      className={cn(
        "flex flex-wrap items-center justify-center gap-3 rounded-md border-2 border-dashed p-2.5 text-center transition-colors motion-reduce:transition-none",
        dragOver ? "border-border bg-muted" : "border-border-soft",
      )}
    >
      {photoUrl && <ItemPhotoThumb src={photoUrl} alt={title} size="lg" />}
      <div data-slot="item-photo-buttons" className="flex flex-col items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={SM_HIT}
          loading={uploading}
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          {photoUrl ? "Replace" : "Add a photo"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Item photo"
          onChange={handleFileChange}
          disabled={disabled}
        />
        {photoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={SM_HIT}
            loading={uploading}
            disabled={disabled}
            onClick={() => void handleRemove()}
          >
            Remove
          </Button>
        )}
      </div>
      <p className="basis-full text-xs font-semibold text-muted-foreground">
        {dragOver ? "Drop to use this photo" : "or drop an image here"}
      </p>
      {error && <FormError>{error}</FormError>}
    </div>
  );
}

/** An edit's empty fields are clears (ADR 0075). Not surpriseForIds (omitted = leave the Surprise alone). */
// `bookingState` is deliberately absent: a null would hand a choice back to automatic; an un-chosen state is simply not sent.
const ITEM_CLEARABLE = ["stopId", "date", "startTime", "endTime", "slotTime", "arriveByMinutes", "refundable", "address", "link", "booking", "notes", "paidAt", "bookBy"] as const;

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
  defaultDate,
  attachments,
  reminders,
  onAddReminder,
  members,
  currentUserId,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
}: ItemFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit Item" : "Add Item"}
      recordId={item?.id ?? null}
      size="lg"
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
        defaultDate={item ? undefined : defaultDate}
        attachments={attachments}
        reminders={reminders}
        onAddReminder={onAddReminder}
        members={members}
        currentUserId={currentUserId}
        initialValues={initialValues}
        onDraftChange={onDraftChange}
        onSubmitOverride={onSubmitOverride}
        preview={preview}
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
  defaultDate,
  defaultStopId,
  label = "Add Item",
  homeCurrency,
  variant = "primary",
  size = "sm",
  className,
}: {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string;
  defaultUnscheduled?: boolean;
  /** Preselects the new Item's date (the Day view's "+ Add to this day"). */
  defaultDate?: string;
  /** Preselects the new Item's Stop (the Day view's covering Stop, spec 2026-10-13 D7). */
  defaultStopId?: string | null;
  /** Button label. Defaults to "Add Item". */
  label?: string;
  homeCurrency?: string;
  /** Trigger look — the Wishlist also uses a dashed tile and a block secondary (kit). */
  variant?: "primary" | "secondary" | "dashed";
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      <ItemFormDialog
        tripId={tripId}
        stops={stops}
        tripStartDate={tripStartDate}
        defaultUnscheduled={defaultUnscheduled}
        defaultDate={defaultDate}
        defaultStopId={defaultStopId}
        open={open}
        onOpenChange={setOpen}
        homeCurrency={homeCurrency}
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
  /** Pre-fill the date field on create (ignored in edit mode). */
  defaultDate?: string;
  attachments?: AttachmentView[];
  /** Reminders about this thing to do (edit mode, real plan only — spec F8). */
  reminders?: ReminderItem[];
  /** Opens Add a Reminder about this thing to do; omitted on a Fork's Item. */
  onAddReminder?: () => void;
  members?: TravellerLike[];
  currentUserId?: string;
  initialValues?: Partial<ProposedItemInput>;
  onDraftChange?: (input: ProposedItemInput) => void;
  onSubmitOverride?: (input: ProposedItemInput) => Promise<ActionResult>;
  preview?: React.ReactNode;
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
  defaultDate,
  attachments,
  reminders,
  onAddReminder,
  members,
  currentUserId,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
}: ItemFormProps) {
  const isEdit = Boolean(item);
  // Booking import (Proposal mode) seeds a new Item only; a saved one always wins.
  const proposed = item ? undefined : initialValues;

  // Determine the single existing cost (if any) for prefill.
  // When >1 costs exist the CostEditor is authoritative — hide the inline fields.
  const singleCost = costs?.length === 1 ? costs[0] : null;
  const hasMultipleCosts = (costs?.length ?? 0) > 1;

  const defaultCurrency = homeCurrency ?? "AUD";

  const [title, setTitle] = React.useState(item?.title ?? proposed?.title ?? "");
  const [category, setCategory] = React.useState<Category>(
    (item?.category as Category) ?? proposed?.category ?? "SIGHTSEEING",
  );
  const arriveOf = React.useCallback(
    (id: string) => stops.find((s) => s.id === id)?.arriveDate ?? null,
    [stops],
  );
  const initialStopId = item?.stopId ?? proposed?.stopId ?? defaultStopId ?? "";
  const [stopId, setStopId] = React.useState(initialStopId);
  const [date, setDate] = React.useState(
    item?.date ??
      proposed?.date ??
      defaultDate ??
      (defaultUnscheduled ? "" : (arriveOf(initialStopId) ?? tripStartDate ?? "")),
  );
  // True once the Traveller edits the date by hand; a Stop change then leaves it alone.
  const [dateTouched, setDateTouched] = React.useState(Boolean(item?.date ?? proposed?.date ?? defaultDate));
  const [startTime, setStartTime] = React.useState(item?.startTime ?? proposed?.startTime ?? "");
  const [endTime, setEndTime] = React.useState(item?.endTime ?? proposed?.endTime ?? "");
  // CONTEXT.md "Slot time" (R3): the ticket's facts, under the "Ticket" disclosure.
  // refundable is boolean | null (Section S's column: null = not known).
  const [slotTime, setSlotTime] = React.useState(item?.slotTime ?? proposed?.slotTime ?? "");
  const [arriveBy, setArriveBy] = React.useState(() => {
    const v = item?.arriveByMinutes ?? proposed?.arriveByMinutes;
    return v == null ? "" : String(v);
  });
  const [refundable, setRefundable] = React.useState<boolean | null>(item?.refundable ?? proposed?.refundable ?? null);
  const [ticketOpenAtStart] = React.useState(() => Boolean(slotTime || arriveBy || refundable !== null));
  const [address, setAddress] = React.useState(item?.address ?? proposed?.address ?? "");
  const [link, setLink] = React.useState(item?.link ?? "");
  const [booking, setBooking] = React.useState(item?.booking ?? proposed?.booking ?? "");
  const bookingField = useBookingStateField("ITEM", item ?? seedFromProposal(proposed), booking);
  const [notes, setNotes] = React.useState(item?.notes ?? proposed?.notes ?? "");
  const [hiddenFromShares, setHiddenFromShares] = React.useState(item?.hiddenFromShares ?? false);
  // CONTEXT.md Surprise: who this Item is a surprise for. Kept sorted so a tick and untick is no change.
  const surpriseOthers = members && currentUserId ? members.filter((m) => m.id !== currentUserId) : null;
  const [initialSurpriseForIds] = React.useState(() => [...(item?.surprise?.forIds ?? [])].sort());
  const [surpriseForIds, setSurpriseForIds] = React.useState<string[]>(initialSurpriseForIds);
  const surpriseChanged = surpriseForIds.join(",") !== initialSurpriseForIds.join(",");

  // Inline cost fields: a saved single Cost, else a Proposal's Cost (Booking
  // import), else empty — the rules are lib/money/cost-form-state.ts's (card 2.I).
  const [costSeed] = React.useState(() => seedCostFormState(singleCost, proposed, defaultCurrency));
  const cost = useCostFields(costSeed);

  useFormDirty({ title, category, stopId, date, startTime, endTime, slotTime, arriveBy, refundable, address, link, booking, bookingState: bookingField.dirtyValues, notes, hiddenFromShares, surpriseForIds, cost: cost.dirtyValues });

  // Disable time inputs when no date is set
  const timesDisabled = !date;

  // The would-be create/update input, exactly as typed.
  function buildInput(): ItemInput {
    const c = cost.payload();

    const input = {
      title,
      category,
      stopId: stopId || undefined,
      date: date || undefined,
      // Clear times if no date (defensive belt-and-braces, schema also drops them)
      startTime: date && startTime ? startTime : undefined,
      endTime: date && endTime ? endTime : undefined,
      slotTime: slotTime || undefined,
      arriveByMinutes: arriveBy.trim() === "" ? undefined : Number(arriveBy),
      // null ("not known") is sent as undefined; ITEM_CLEARABLE's toPatch then
      // turns the absent field into a clearing null on update (lib/patch.ts).
      refundable: refundable === null ? undefined : refundable,
      address: address.trim() || undefined,
      link: link.trim() || undefined,
      booking: booking.trim() || undefined,
      ...bookingField.payload(),
      notes: notes.trim() || undefined,
      hiddenFromShares,
      // Only a change is sent: an unchanged set leaves the Surprise alone (and lets a helper edit the Item).
      ...(surpriseOthers && surpriseChanged && { surpriseForIds }),
      // An invalid Cost is left out of the draft; submit refuses it first.
      ...(c.kind === "ok" && c.fields),
    };
    return input;
  }

  useDraftReporter(onDraftChange, buildInput);

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: async () => {
      const c = cost.payload();
      if (c.kind === "invalid") return fail(c.errors);
      const input = buildInput();
      if (onSubmitOverride) return onSubmitOverride(input);
      return isEdit && item
        ? updateItem(item.id, toPatch(input, ITEM_CLEARABLE))
        : createItem(tripId, input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  const { confirm, dialog: confirmDialog } = useConfirm();
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const DELETE_FAILED = "Couldn't delete this Item. Try again.";

  async function handleDelete() {
    if (!item) return;
    const ok = await confirm({
      title: `Delete "${item.title}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteItem(item.id);
      if (result.success) {
        onSaved?.();
        onClose();
      } else {
        // Refused (e.g. stale access): the dialog stays open and usable (spec §E).
        toastRefused(result.errors, DELETE_FAILED);
      }
    } catch {
      setDeleteError(DELETE_FAILED);
      toastRejected(DELETE_FAILED);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-x-4">
      {preview && <div data-testid="proposal-preview" className="sm:col-span-2">{preview}</div>}
      {/* Photo (CONTEXT.md "Item photo", spec §I) — first field; its own
          independent save via setItemPhoto/removeItemPhoto, same as
          Attachments below. Needs a real Item id, so create mode shows the
          same "save first" nudge as Attachments instead of an upload control. */}
      <Field label="Photo" className="sm:col-span-2">
        {item?.id ? (
          <ItemPhotoField
            itemId={item.id}
            photoUrl={item.photoUrl ?? null}
            title={title.trim() || item.title}
            disabled={isPending}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Save this item first, then reopen it to add a photo.
          </p>
        )}
      </Field>

      {/* Title */}
      <Field label="Title" required error={errors.title?.[0]} className="sm:col-span-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Visit the night market"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Category */}
      <Field label="Category" error={errors.category?.[0]} className="sm:col-span-2">
        <CategoryGroup
          category={category}
          onSelect={setCategory}
          disabled={isPending}
        />
      </Field>

      {/* Stop (optional) + Date — paired in their own sub-grid so hiding Stop
          (no stops on the trip) can't shift Date into pairing with something
          else via auto-flow; with no Stop, Date alone still spans full width. */}
      {stops.length > 0 ? (
        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
          <Field label="Stop" error={errors.stopId?.[0]}>
            <Select
              value={stopId}
              onValueChange={(v) => {
                const next = v === "__none__" ? "" : v;
                setStopId(next);
                if (!isEdit && !defaultUnscheduled && !dateTouched) {
                  setDate(arriveOf(next) ?? tripStartDate ?? "");
                }
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="No stop yet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No stop yet</SelectItem>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DateField
            label="Date"
            value={date}
            onChange={(e) => {
              setDateTouched(true);
              setDate(e.target.value);
              // Clear times when date is cleared
              if (!e.target.value) {
                setStartTime("");
                setEndTime("");
              }
            }}
            description="Leave blank to keep this as an unscheduled item"
            error={errors.date?.[0]}
            disabled={isPending}
          />
        </div>
      ) : (
        <div className="sm:col-span-2">
          <DateField
            label="Date"
            value={date}
            onChange={(e) => {
              setDateTouched(true);
              setDate(e.target.value);
              // Clear times when date is cleared
              if (!e.target.value) {
                setStartTime("");
                setEndTime("");
              }
            }}
            description="Leave blank to keep this as an unscheduled item"
            error={errors.date?.[0]}
            disabled={isPending}
          />
        </div>
      )}

      {/* Times (enabled only when date is set) — own sub-grid so they always pair. */}
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <Field
          label="Start time"
          error={errors.startTime?.[0]}
          description={
            timesDisabled
              ? "Set a date first"
              : !startTime && slotTime
                ? `Starts at ${startFromSlot({ date, slotTime, arriveByMinutes: arriveBy ? Number(arriveBy) : null })} if left empty`
                : undefined
          }
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

      {/* Ticket (CONTEXT.md "Slot time", R3) — collapsed unless the Item already has one. */}
      <details
        className="sm:col-span-2"
        open={ticketOpenAtStart || Boolean(errors.slotTime || errors.arriveByMinutes || errors.refundable) || undefined}
      >
        <summary className="tap-target cursor-pointer text-[13px] font-semibold text-muted-foreground">
          Ticket
          {(slotLabel({ slotTime, arriveByMinutes: arriveBy ? Number(arriveBy) : null }) || refundLabel(refundable)) && (
            <span className="ml-2 font-medium">
              {[slotLabel({ slotTime, arriveByMinutes: arriveBy ? Number(arriveBy) : null }), refundLabel(refundable)].filter(Boolean).join(" · ")}
            </span>
          )}
        </summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Slot time" description="The time on the ticket" error={errors.slotTime?.[0]}>
            <Input type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} disabled={isPending} />
          </Field>
          <Field label="Be there early" description="Minutes before the slot" error={errors.arriveByMinutes?.[0]}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={arriveBy}
              onChange={(e) => setArriveBy(e.target.value)}
              placeholder="15"
              disabled={isPending}
            />
          </Field>
          <div className="sm:col-span-2">
            <p id="refundable-label" className="mb-1.5 text-sm font-semibold">Refundable</p>
            <Segmented
              type="single"
              tone="ink"
              aria-labelledby="refundable-label"
              value={refundable === true ? "YES" : refundable === false ? "NO" : "UNKNOWN"}
              onValueChange={(v) => {
                if (!v) return; // Radix deselect on the already-chosen pill: keep it.
                setRefundable(v === "YES" ? true : v === "NO" ? false : null);
              }}
              disabled={isPending}
            >
              <SegmentedItem value="UNKNOWN">Not known</SegmentedItem>
              <SegmentedItem value="YES">Yes</SegmentedItem>
              <SegmentedItem value="NO">No</SegmentedItem>
            </Segmented>
            {errors.refundable?.[0] && <p className="mt-1.5 text-sm font-medium text-destructive">{errors.refundable[0]}</p>}
          </div>
        </div>
      </details>

      {/* Address — full width; a street address reads best on one line. */}
      <Field label="Address" error={errors.address?.[0]} className="sm:col-span-2">
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 12 Rue de la Paix, Paris"
          disabled={isPending}
        />
      </Field>

      {/* Booking reference + Link — own sub-grid so they always pair (spec 2026-10-05 §D). */}
      <div data-pair="booking" className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <Field label="Booking reference" error={errors.booking?.[0]}>
          <Input
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
            placeholder="e.g. BOOK-12345"
            disabled={isPending}
          />
        </Field>

        <Field label="Link" error={errors.link?.[0]}>
          <Input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            disabled={isPending}
          />
        </Field>
      </div>

      {/* Booking state (CONTEXT.md): a reference implies Booked until the Traveller picks. */}
      <BookingStateField field={bookingField} errors={errors} disabled={isPending} className="sm:col-span-2" />

      {/* Notes */}
      <Field label="Notes" error={errors.notes?.[0]} className="sm:col-span-2">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else worth knowing…"
          disabled={isPending}
        />
      </Field>

      {/* Hide from shared links (CONTEXT.md "Share link") — the Item stays
          fully visible to every Traveller; this only affects what a share
          link's public page shows. */}
      <div className="sm:col-span-2">
        <Checkbox
          label="Hide from shared links"
          strike={false}
          checked={hiddenFromShares}
          onChange={(e) => setHiddenFromShares(e.target.checked)}
          disabled={isPending}
        />
        <p className="mt-1 pl-8 text-xs text-muted-foreground">
          Still visible to everyone on the trip.
        </p>
      </div>

      {/* Surprise for… (CONTEXT.md Surprise) — the ticked Travellers see only that something is planned. */}
      {surpriseOthers && surpriseOthers.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold">Surprise for…</legend>
          <div className="flex flex-wrap gap-x-4">
            {surpriseOthers.map((m) => (
              <Checkbox
                key={m.id}
                strike={false}
                label={travellerFirstName(m)}
                checked={surpriseForIds.includes(m.id)}
                onChange={(e) =>
                  setSurpriseForIds((prev) =>
                    e.target.checked ? [...new Set([...prev, m.id])].sort() : prev.filter((id) => id !== m.id),
                  )
                }
                disabled={isPending}
              />
            ))}
          </div>
          {errors.surpriseForIds?.[0] && (
            <FormError>{errors.surpriseForIds?.[0]}</FormError>
          )}
        </fieldset>
      )}

      {/* Attachments */}
      <Field label="Attachments" className="sm:col-span-2">
        {item?.id ? (
          <AttachmentList
            tripId={tripId}
            targetType="ITEM"
            targetId={item.id}
            attachments={attachments ?? []}
            compact
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Save this item first, then reopen it to attach files.
          </p>
        )}
      </Field>

      {isEdit && item && (reminders || onAddReminder) && (
        <Field label="Reminders" className="sm:col-span-2">
          <ReminderList reminders={reminders ?? []} onAdd={onAddReminder} />
        </Field>
      )}

      {/* Inline cost — hidden when >1 costs exist (CostEditor is authoritative) */}
      <div className="sm:col-span-2 flex flex-col gap-4">
        <InlineCostFields
          {...cost.fieldProps}
          hasMultipleCosts={hasMultipleCosts}
          errors={errors}
          disabled={isPending}
          paired
        />
      </div>

      <div className="sm:col-span-2">
        <FormError>{formError(errors) ?? deleteError ?? undefined}</FormError>
      </div>

      <DialogFooter className="sm:col-span-2">
        {isEdit && (
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleDelete()}
            loading={deleting}
            disabled={isPending || deleting}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        )}
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending || deleting}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending} disabled={isPending || deleting}>
          {onSubmitOverride ? "Confirm" : isEdit ? "Save changes" : "Add Item"}
        </Button>
      </DialogFooter>
      {confirmDialog}
    </form>
  );
}
