"use client";

import * as React from "react";
import { useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { AiSuggestButton } from "./ai-suggest-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { aiParseBooking } from "@/server/actions/ai";
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";
import type { ParseBookingOutput } from "@/lib/ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiBookingParserProps {
  tripId: string;
  aiConfigured: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Paste-a-booking-confirmation panel.
 *
 * Shows a textarea for the user to paste confirmation text; on submit calls
 * the AI parse action and displays the extracted draft as a read-only summary.
 * This is a READ-ONLY draft — the user creates the actual record manually.
 */
export function AiBookingParser({ tripId, aiConfigured }: AiBookingParserProps) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState<ParseBookingOutput | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function handleParse(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    setParsed(null);
    startTransition(async () => {
      const result = await aiParseBooking(tripId, text.trim());
      if (result.ok) {
        setParsed(result.data);
      } else if (result.reason === "disabled") {
        setError("AI features are not configured.");
      } else {
        setError(result.message ?? "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          Parse a booking confirmation
        </h3>
        <p className="mt-1 text-[13px] font-medium text-muted-foreground">
          Paste confirmation text and the AI will extract the key details as a draft for you to review.
        </p>
      </div>

      <form onSubmit={handleParse} className="flex flex-col gap-2">
        <Textarea
          aria-label="Booking confirmation text"
          className="min-h-[100px] resize-none"
          placeholder="Paste booking confirmation email or text here…"
          value={text}
          maxLength={MAX_BOOKING_TEXT_CHARS}
          onChange={(e) => setText(e.target.value)}
          disabled={pending || !aiConfigured}
        />
        {text.length > MAX_BOOKING_TEXT_CHARS * 0.9 && (
          <p className="text-xs text-muted-foreground text-right">
            {text.length.toLocaleString()} / {MAX_BOOKING_TEXT_CHARS.toLocaleString()} characters
          </p>
        )}
        <div className="flex justify-end">
          <AiSuggestButton
            aiConfigured={aiConfigured}
            loading={pending}
            label="Parse confirmation"
            type="submit"
            disabled={!text.trim() || pending}
          />
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded-md border-2 border-destructive bg-card px-3 py-2.5 text-sm font-medium text-foreground">
          <AlertCircle className="size-[18px] shrink-0 text-destructive" aria-hidden="true" />
          {error}
        </div>
      )}

      {parsed && (
        <Card tone="lilac" className="p-3.5 sm:p-[18px]">
          <p className="text-label mb-3">
            Extracted draft — review and add manually
          </p>

          {parsed.kind === "unknown" && (
            <p className="text-sm font-medium">
              Could not determine the booking type from this text.
            </p>
          )}

          {parsed.kind === "transport" && parsed.transport && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-bold">Type</dt>
              <dd>Transport</dd>
              <dt className="font-bold">Mode</dt>
              <dd>{parsed.transport.mode}</dd>
              <dt className="font-bold">From</dt>
              <dd>{parsed.transport.from}</dd>
              <dt className="font-bold">To</dt>
              <dd>{parsed.transport.to}</dd>
              <dt className="font-bold">Departs</dt>
              <dd>{parsed.transport.dep}</dd>
              <dt className="font-bold">Arrives</dt>
              <dd>{parsed.transport.arr}</dd>
              <dt className="font-bold">Reference</dt>
              <dd>{parsed.transport.reference}</dd>
            </dl>
          )}

          {parsed.kind === "accommodation" && parsed.accommodation && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-bold">Type</dt>
              <dd>Accommodation</dd>
              <dt className="font-bold">Name</dt>
              <dd>{parsed.accommodation.name}</dd>
              <dt className="font-bold">Address</dt>
              <dd>{parsed.accommodation.address}</dd>
              <dt className="font-bold">Check-in</dt>
              <dd>{parsed.accommodation.checkIn}</dd>
              <dt className="font-bold">Check-out</dt>
              <dd>{parsed.accommodation.checkOut}</dd>
              <dt className="font-bold">Confirmation</dt>
              <dd>{parsed.accommodation.confirmation}</dd>
            </dl>
          )}

          <p className="mt-3 text-xs font-semibold">
            Use the details above to add the booking manually via the itinerary page.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 bg-card relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1 pointer-coarse:after:inset-x-0 pointer-coarse:after:content-['']"
            onClick={() => { setParsed(null); setText(""); }}
          >
            Clear
          </Button>
        </Card>
      )}
    </div>
  );
}
