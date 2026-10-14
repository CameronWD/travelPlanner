"use client";

import * as React from "react";
import { AccommodationFormDialog } from "@/components/trip/accommodation-form-dialog";
import { ItemFormDialog } from "@/components/trip/item-form-dialog";
import { StopFormDialog } from "@/components/trip/stop-form-dialog";
import { TransportFormDialog } from "@/components/trip/transport-form-dialog";
import { mergeStopEdit, mergeTransportEdit, toActionResult } from "@/lib/booking-import/edit";
import { stayRange, type PreviewStop } from "@/lib/booking-import/preview";
import { proposedRef, type ConfirmProposalResult, type ImportContext, type Proposal, type StopProposal } from "@/lib/booking-import/types";
import { ProposalPreview } from "./proposal-card";

interface ProposalEditorProps {
  tripId: string;
  forkId: string | null;
  context: ImportContext;
  /** The live version: every draft comes back through `onDraft` and in here again. */
  proposal: Proposal;
  /** The Booking import's proposed Stops, offered alongside the plan's own. */
  stopProposals: StopProposal[];
  stops: ReadonlyMap<string, PreviewStop>;
  onDraft(next: Proposal): void;
  onConfirm(next: Proposal): Promise<ConfirmProposalResult>;
  onClose(): void;
}

/** Opens the matching existing form dialog in Proposal mode (spec 2026-10-14 "Edit"). */
export function ProposalEditor({ tripId, forkId, context, proposal, stopProposals, stops, onDraft, onConfirm, onClose }: ProposalEditorProps) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const stopOptions = [
    ...context.stops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, sortOrder: s.sortOrder, arriveDate: s.arriveDate, departDate: s.departDate })),
    ...stopProposals.map((s, i) => ({
      id: proposedRef(s.clientId),
      name: `${s.input.name} (new stop)`,
      timezone: s.input.timezone,
      sortOrder: 10_000 + i,
      arriveDate: s.input.arriveDate,
      departDate: s.input.departDate,
    })),
  ];
  const preview = proposal.kind === "stop" ? null : <ProposalPreview proposal={proposal} stops={stops} homeName={context.homeName} homeTimezone={context.homeTimezone} />;

  switch (proposal.kind) {
    case "transport": {
      const edit = (input: typeof proposal.input): Proposal => ({ ...proposal, input: mergeTransportEdit(proposal.input, input) });
      return (
        <TransportFormDialog
          open
          onOpenChange={onOpenChange}
          tripId={tripId}
          stops={stopOptions}
          forkId={forkId}
          homeCurrency={context.homeCurrency}
          homeBaseName={context.homeName}
          homeTimezone={context.homeTimezone}
          initialValues={proposal.input}
          preview={preview}
          onDraftChange={(input) => onDraft(edit(input))}
          onSubmitOverride={async (input) => toActionResult(await onConfirm(edit(input)))}
        />
      );
    }
    case "accommodation": {
      // The stay's Stop is fixed: the form has no Stop picker.
      const edit = (input: typeof proposal.input): Proposal => ({ ...proposal, input: { ...input, stopId: proposal.input.stopId } });
      return (
        <AccommodationFormDialog
          open
          onOpenChange={onOpenChange}
          tripId={tripId}
          stopId={proposal.input.stopId}
          stopDateRange={stayRange(proposal.input, stops)}
          forkId={forkId}
          homeCurrency={context.homeCurrency}
          initialValues={proposal.input}
          preview={preview}
          onDraftChange={(input) => onDraft(edit(input))}
          onSubmitOverride={async (input) => toActionResult(await onConfirm(edit(input)))}
        />
      );
    }
    case "item":
      return (
        <ItemFormDialog
          open
          onOpenChange={onOpenChange}
          tripId={tripId}
          stops={stopOptions}
          forkId={forkId}
          homeCurrency={context.homeCurrency}
          defaultUnscheduled={!proposal.input.date}
          initialValues={proposal.input}
          preview={preview}
          onDraftChange={(input) => onDraft({ ...proposal, input })}
          onSubmitOverride={async (input) => toActionResult(await onConfirm({ ...proposal, input }))}
        />
      );
    case "stop": {
      const edit = (input: typeof proposal.input): Proposal => ({ ...proposal, input: mergeStopEdit(proposal.input, input) });
      return (
        <StopFormDialog
          open
          onOpenChange={onOpenChange}
          tripId={tripId}
          forkId={forkId}
          initialValues={proposal.input}
          onDraftChange={(input) => onDraft(edit(input))}
          onSubmitOverride={async (input) => toActionResult(await onConfirm(edit(input)))}
        />
      );
    }
  }
}
