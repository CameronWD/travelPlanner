"use client";

import * as React from "react";
import { AlertTriangle, Ban, Check, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AccommodationCard } from "@/components/trip/accommodation-card";
import { highlightAttrs } from "@/components/trip/card-highlight";
import { ItemCard } from "@/components/trip/item-card";
import { TransportCard } from "@/components/trip/transport-card";
import { formatDayLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money/money";
import { stayRange, transportPreview, type PreviewStop } from "@/lib/booking-import/preview";
import type { BookingProposal, Confidence } from "@/lib/booking-import/types";

export type ProposalStatus = "pending" | "confirming" | "confirmed" | "discarded";

/** Copy for each Confidence (spec 2026-10-14 "Preview"). Not exported: nothing
 * outside this module reads it; tests assert the rendered label instead. */
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Looks right",
  medium: "Check the details",
  low: "Not sure about this one",
};

interface PreviewProps {
  proposal: BookingProposal;
  stops: ReadonlyMap<string, PreviewStop>;
  homeName: string | null;
  homeTimezone: string | null;
}

/** The real card a Proposal will become, read-only (no edit, Cost or Attachment controls). */
export function ProposalPreview({ proposal, stops, homeName, homeTimezone }: PreviewProps) {
  if (proposal.kind === "transport") {
    const { transport, homeTimezone: zone } = transportPreview(proposal.input, stops, homeTimezone);
    return <TransportCard transport={transport} homeBaseName={homeName} homeTimezone={zone} highlight={proposal.highlight} />;
  }
  if (proposal.kind === "accommodation") {
    const a = proposal.input;
    return (
      <AccommodationCard
        accommodation={{ id: proposal.clientId, stopId: a.stopId, name: a.name, address: a.address, checkIn: a.checkIn, checkOut: a.checkOut, checkInTime: a.checkInTime, checkOutTime: a.checkOutTime, confirmation: a.confirmation, notes: a.notes }}
        stop={stayRange(a, stops)}
        highlight={proposal.highlight}
      />
    );
  }
  const i = proposal.input;
  return (
    <div className="flex flex-col gap-1">
      {i.date && <p {...highlightAttrs(proposal.highlight, "date", "text-xs font-semibold text-muted-foreground")}>{formatDayLabel(i.date)}</p>}
      <ItemCard
        mode="scheduled"
        item={{ id: proposal.clientId, title: i.title, category: i.category, date: i.date, startTime: i.startTime, endTime: i.endTime, address: i.address, booking: i.booking, notes: i.notes, stopId: i.stopId, stopName: i.stopId ? (stops.get(i.stopId)?.name ?? null) : null }}
        highlight={proposal.highlight}
      />
    </div>
  );
}

export interface ProposalCardProps extends PreviewProps {
  status: ProposalStatus;
  error?: string | null;
  onConfirm(): void;
  onEdit(): void;
  onDiscard(): void;
}

/** One Proposal in the Booking import sheet: the real card inside a dashed "Preview" frame. */
export function ProposalCard({ proposal: p, status, error, onConfirm, onEdit, onDiscard, ...preview }: ProposalCardProps) {
  if (status === "discarded") return null;
  const { costMinor, currency, paidAt } = p.input;
  const cost = costMinor !== undefined && currency ? `${formatMoney(costMinor, currency)}${paidAt ? " · Paid" : ""}` : null;
  const busy = status === "confirming";
  return (
    <Card dashed radius="xl" shadow={0} data-testid={`proposal-${p.clientId}`} className="flex flex-col gap-3 p-3 pt-5" sticker={<Badge variant="lilac" caps>Preview</Badge>}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span>{CONFIDENCE_LABEL[p.confidence]}</span>
        {status === "confirmed" && (
          <Badge variant="success">
            <Check aria-hidden="true" />
            Added
          </Badge>
        )}
      </div>
      <ProposalPreview proposal={p} {...preview} />
      {cost && <p {...highlightAttrs(p.highlight, "cost", "text-sm font-semibold")}>{cost}</p>}
      {p.missing.length > 0 && <p className="text-xs font-semibold text-muted-foreground">Not in the booking: {p.missing.join(", ")}</p>}
      {p.warnings.map((w) => (
        <Badge key={w} variant="warning" className="flex w-fit items-center gap-1 whitespace-normal text-xs">
          <AlertTriangle aria-hidden="true" />
          {w}
        </Badge>
      ))}
      {p.doubleCheck.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {p.doubleCheck.map((note) => (
            <li key={note} className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0 text-hue-lilac-text" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      )}
      {p.blocked && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-semibold">
          <Ban className="size-4 shrink-0" aria-hidden="true" />
          {p.blocked}
        </p>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      {status !== "confirmed" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={onConfirm} disabled={Boolean(p.blocked) || busy} loading={busy}>Confirm</Button>
          <Button size="sm" variant="outline" onClick={onEdit} disabled={Boolean(p.blocked) || busy}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>Discard</Button>
        </div>
      )}
    </Card>
  );
}
