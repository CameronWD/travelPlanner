import "server-only";
import { z } from "zod";
import type { FieldErrors } from "@/lib/action-result";
import { db } from "@/lib/db";
import { orderPlanStops } from "@/lib/plan-order";
import { planScope } from "@/lib/plan-scope";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { creationAnchor } from "@/lib/transport-anchor";
import type { AccommodationInput } from "@/lib/validations/accommodation";
import type { ItemInput } from "@/lib/validations/item";
import type { StopInput } from "@/lib/validations/stop";
import type { TransportInput } from "@/lib/validations/transport";
import { wallTimeToInstant } from "@/lib/wall-time";
import { createAccommodation } from "@/server/actions/accommodation";
import { createItem } from "@/server/actions/items";
import { createStop } from "@/server/actions/stops";
import { createTransport } from "@/server/actions/transport";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import { existingStopIds, parseProposedRef, proposalStopRefs, type ConfirmProposalResult, type ConfirmRequest } from "./types";

/**
 * Confirm one Proposal (spec 2026-10-14 "Confirm"): through the existing
 * create actions only, so a confirmed Proposal is exactly a typed entry. The
 * caller (server/actions/booking-import.ts) has checked Trip access. The
 * create actions re-validate every field with their own zod schemas; this
 * checks only the request's shape.
 */

const ref = z.string().min(1).max(200);
const proposalShape = z.object({
  clientId: ref,
  kind: z.enum(["transport", "accommodation", "item", "stop"]),
  input: z.record(z.string(), z.unknown()),
});
const ConfirmRequestSchema = z.object({
  proposal: proposalShape,
  proposedStops: z.array(proposalShape.extend({ kind: z.literal("stop") })).max(20),
  resolvedStops: z.record(z.string(), ref),
});

function firstError(errors: FieldErrors): string {
  return Object.values(errors).flat()[0] ?? M.generic;
}

export async function confirmProposalFor(
  tripId: string,
  viewerId: string,
  raw: unknown,
  forkId: string | null,
): Promise<ConfirmProposalResult> {
  const createdStops: Record<string, string> = {};
  if (!ConfirmRequestSchema.safeParse(raw).success) return { ok: false, message: M.generic, createdStops };
  const request = raw as ConfirmRequest;
  const proposal = request.proposal;
  const plan = forkId ?? undefined;

  // Surprise (CONTEXT.md): never write into a Stop the Traveller is surprised by.
  const touched = existingStopIds(proposal);
  if (touched.length > 0) {
    const v = await loadSurpriseVisibility(tripId, viewerId);
    if (touched.some((id) => v.hiddenStopIds.includes(id))) return { ok: false, message: M.blocked, createdStops };
  }

  const stopIds: Record<string, string> = { ...request.resolvedStops };
  const given = new Map(request.proposedStops.map((s) => [s.clientId, s]));
  if (proposal.kind !== "stop" && proposalStopRefs(proposal).some((id) => !stopIds[id] && !given.has(id))) {
    return { ok: false, message: M.generic, createdStops };
  }

  // Proposed Stops first: a Stop that saves stays saved even if the booking then fails.
  const toCreate = proposal.kind === "stop" ? [proposal] : proposalStopRefs(proposal).filter((id) => !stopIds[id]).map((id) => given.get(id)!);
  for (const stop of toCreate) {
    if (stopIds[stop.clientId]) continue;
    const res = await createStop(tripId, stop.input as StopInput, plan);
    if (!res.success) return { ok: false, message: firstError(res.errors), errors: res.errors, createdStops };
    if (!res.id) return { ok: false, message: M.generic, createdStops };
    stopIds[stop.clientId] = res.id;
    createdStops[stop.clientId] = res.id;
  }
  if (proposal.kind === "stop") return { ok: true, createdId: stopIds[proposal.clientId], createdStops };

  const real = (id: string | undefined): string | undefined => {
    const clientId = parseProposedRef(id);
    return clientId ? stopIds[clientId] : id;
  };

  let result;
  if (proposal.kind === "transport") {
    const { depTimezone, arrTimezone, ...rest } = proposal.input;
    const input = { ...rest, fromStopId: real(rest.fromStopId), toStopId: real(rest.toStopId) };
    // An end with no zone of its own reads its wall time in the zone the import guessed for it.
    if (depTimezone && input.depAt && !input.fromStopId) input.depAt = wallTimeToInstant(input.depAt, depTimezone)?.toISOString();
    if (arrTimezone && input.arrAt && !input.toStopId) input.arrAt = wallTimeToInstant(input.arrAt, arrTimezone)?.toISOString();
    const ordered = orderPlanStops(
      await db.stop.findMany({
        where: { tripId, ...planScope(forkId) },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, arriveDate: true, departDate: true },
      }),
    );
    const anchorStopId = creationAnchor({ fromStopId: input.fromStopId, toStopId: input.toStopId }, ordered) ?? undefined;
    result = await createTransport(tripId, { ...input, anchorStopId } as TransportInput, plan);
  } else if (proposal.kind === "accommodation") {
    result = await createAccommodation({ ...proposal.input, stopId: real(proposal.input.stopId) } as AccommodationInput, plan);
  } else {
    result = await createItem(tripId, { ...proposal.input, stopId: real(proposal.input.stopId) } as ItemInput, plan);
  }

  return result.success
    ? { ok: true, createdId: result.id, createdStops }
    : { ok: false, message: firstError(result.errors), errors: result.errors, createdStops };
}
