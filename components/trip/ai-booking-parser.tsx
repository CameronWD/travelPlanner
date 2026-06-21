"use client";

import * as React from "react";
import { useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { AiSuggestButton } from "./ai-suggest-button";
import { Button } from "@/components/ui/button";
import { aiParseBooking } from "@/server/actions/ai";
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
        <h3 className="font-display text-sm font-semibold text-foreground">
          Parse a booking confirmation
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Paste confirmation text and the AI will extract the key details as a draft for you to review.
        </p>
      </div>

      <form onSubmit={handleParse} className="flex flex-col gap-2">
        <textarea
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[100px]"
          placeholder="Paste booking confirmation email or text here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending || !aiConfigured}
        />
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
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {parsed && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/30">
          <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-3">
            Extracted draft — review and add manually
          </p>

          {parsed.kind === "unknown" && (
            <p className="text-sm text-muted-foreground italic">
              Could not determine the booking type from this text.
            </p>
          )}

          {parsed.kind === "transport" && parsed.transport && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-medium text-muted-foreground">Type</dt>
              <dd>Transport</dd>
              <dt className="font-medium text-muted-foreground">Mode</dt>
              <dd>{parsed.transport.mode}</dd>
              <dt className="font-medium text-muted-foreground">From</dt>
              <dd>{parsed.transport.from}</dd>
              <dt className="font-medium text-muted-foreground">To</dt>
              <dd>{parsed.transport.to}</dd>
              <dt className="font-medium text-muted-foreground">Departs</dt>
              <dd>{parsed.transport.dep}</dd>
              <dt className="font-medium text-muted-foreground">Arrives</dt>
              <dd>{parsed.transport.arr}</dd>
              <dt className="font-medium text-muted-foreground">Reference</dt>
              <dd>{parsed.transport.reference}</dd>
            </dl>
          )}

          {parsed.kind === "accommodation" && parsed.accommodation && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-medium text-muted-foreground">Type</dt>
              <dd>Accommodation</dd>
              <dt className="font-medium text-muted-foreground">Name</dt>
              <dd>{parsed.accommodation.name}</dd>
              <dt className="font-medium text-muted-foreground">Address</dt>
              <dd>{parsed.accommodation.address}</dd>
              <dt className="font-medium text-muted-foreground">Check-in</dt>
              <dd>{parsed.accommodation.checkIn}</dd>
              <dt className="font-medium text-muted-foreground">Check-out</dt>
              <dd>{parsed.accommodation.checkOut}</dd>
              <dt className="font-medium text-muted-foreground">Confirmation</dt>
              <dd>{parsed.accommodation.confirmation}</dd>
            </dl>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Use the details above to add the booking manually via the itinerary page.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 text-xs"
            onClick={() => { setParsed(null); setText(""); }}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
