"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Field } from "@/components/ui/field";
import { DateField } from "@/components/ui/date-field";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { effectiveBookingState, isBookingState, type BookingSubject } from "@/lib/booking-state";
import { BOOKING_STATE_LABELS } from "@/lib/booking-state-copy";
import { BOOKING_STATES, type BookingState } from "@/lib/enum-values";

/** A saved row's Booking state (the view types carry all three), or a Proposal's via `seedFromProposal`. */
export interface BookingStateSeed {
  bookingState?: BookingState | null;
  bookingStateSet?: boolean | null;
  bookBy?: string | null;
}

/** A Booking import Proposal's state is always a choice (it lands Booked, lib/booking-import/build.ts). */
export function seedFromProposal(p: { bookingState?: BookingState; bookBy?: string } | undefined): BookingStateSeed | undefined {
  return p?.bookingState ? { bookingState: p.bookingState, bookingStateSet: true, bookBy: p.bookBy ?? null } : undefined;
}

/**
 * The three edit dialogs' Booking state (CONTEXT.md "Booking state",
 * spec 2026-10-17 R2). Until the Traveller picks one, the control shows what
 * the reference implies, live, and the payload sends no state, so the server
 * derives it the same way (lib/booking-state.ts `bookingStateWrite`). A
 * book-by date is sent only while the shown state is To book; an edit dialog
 * lists `bookBy` in its `*_CLEARABLE`, so an absent one goes as null and a
 * stored date is cleared (the server refuses a date on anything else).
 */
export function useBookingStateField(subject: BookingSubject, seed: BookingStateSeed | null | undefined, reference: string) {
  const [chosen, setChosen] = React.useState<BookingState | null>(
    seed?.bookingStateSet && isBookingState(seed.bookingState) ? seed.bookingState : null,
  );
  const [bookBy, setBookBy] = React.useState(seed?.bookBy ?? "");
  const shown = effectiveBookingState(subject, { bookingState: chosen, bookingStateSet: chosen !== null }, reference);
  return {
    shown,
    bookBy,
    choose: setChosen,
    setBookBy,
    dirtyValues: { chosen, bookBy },
    payload(): { bookingState?: BookingState; bookBy?: string } {
      return {
        ...(chosen ? { bookingState: chosen } : {}),
        ...(shown === "TO_BOOK" && bookBy ? { bookBy } : {}),
      };
    },
  };
}

export type BookingStateFieldState = ReturnType<typeof useBookingStateField>;

export function BookingStateField({
  field,
  errors,
  disabled,
  className,
}: {
  field: BookingStateFieldState;
  errors: Record<string, string[] | undefined>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Field label="Booking" description="Booked doesn't mean paid. Mark the cost paid on its own." error={errors.bookingState?.[0]}>
        <Segmented
          type="single"
          tone="sun"
          value={field.shown}
          // Pressing the pill already shown reports "" (Radix deselect): it makes the shown state a choice.
          onValueChange={(v) => field.choose(isBookingState(v) ? v : field.shown)}
          aria-label="Booking"
          disabled={disabled}
          className="flex-wrap self-start"
        >
          {BOOKING_STATES.map((s) => (
            <SegmentedItem key={s} value={s}>
              {BOOKING_STATE_LABELS[s]}
            </SegmentedItem>
          ))}
        </Segmented>
      </Field>
      {field.shown === "TO_BOOK" && (
        <DateField
          label="Book by"
          value={field.bookBy}
          onChange={(e) => field.setBookBy(e.target.value)}
          error={errors.bookBy?.[0]}
          disabled={disabled}
        />
      )}
    </div>
  );
}
