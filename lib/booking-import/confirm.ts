import "server-only";
import { z } from "zod";
import type { FieldErrors } from "@/lib/action-result";
import { db } from "@/lib/db";
import { orderPlanStops, type OrderableStop } from "@/lib/plan-order";
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
import { existingStopIds, parseProposedRef, proposalStopRefs, type ConfirmProposalResult, type ConfirmRequest, type Proposal } from "./types";

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

/**
 * Every real Stop id this confirm will touch once `proposed:` refs resolve:
 * ids already real on the Proposal's own input, plus any `proposed:` ref the
 * caller claims is already saved via `resolvedStops`. Both are
 * client-controlled — a forged `resolvedStops` entry is exactly as able to
 * name a Stop outside this Trip/plan (fix round 1, #1/#2) as a forged real
 * id is — so both must be checked against the actual plan before the
 * Surprise check (or any create action) trusts either.
 */
function claimedRealStopIds(proposal: Proposal, resolvedStops: Record<string, string>): string[] {
  const claimed =
    proposal.kind === "stop" ? [] : proposalStopRefs(proposal).filter((id) => resolvedStops[id]).map((id) => resolvedStops[id]);
  return [...new Set([...existingStopIds(proposal), ...claimed])];
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

  const stopIds: Record<string, string> = { ...request.resolvedStops };
  const given = new Map(request.proposedStops.map((s) => [s.clientId, s]));
  if (proposal.kind !== "stop" && proposalStopRefs(proposal).some((id) => !stopIds[id] && !given.has(id))) {
    return { ok: false, message: M.generic, createdStops };
  }

  // This Trip/plan's Stops, cached across the membership check and the
  // Transport anchor below so they don't run the same query twice (fix round
  // 1) — but invalidated (fix round 2) the moment a proposed Stop is
  // actually created, since the cached snapshot no longer reflects the plan.
  let planStops: OrderableStop[] | null = null;
  const stopsOnPlan = async (): Promise<OrderableStop[]> =>
    (planStops ??= orderPlanStops(
      await db.stop.findMany({
        where: { tripId, ...planScope(forkId) },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, arriveDate: true, departDate: true },
      }),
    ));

  // Plan membership, then Surprise (CONTEXT.md): never write into a Stop
  // outside this Trip/plan, or one the Traveller is surprised by. Checked
  // against every real Stop id the Proposal will touch, resolvedStops
  // included, BEFORE any write (fix round 1, #1/#2).
  const claimed = claimedRealStopIds(proposal, stopIds);
  if (claimed.length > 0) {
    const onPlan = new Set((await stopsOnPlan()).map((s) => s.id));
    if (claimed.some((id) => !onPlan.has(id))) return { ok: false, message: M.generic, createdStops };
    const v = await loadSurpriseVisibility(tripId, viewerId);
    if (claimed.some((id) => v.hiddenStopIds.includes(id))) return { ok: false, message: M.blocked, createdStops };
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
    // The plan's Stops just changed — `stopsOnPlan()`'s cache (primed, if at
    // all, by the membership check above) is now stale and must not be
    // reused for the Transport anchor below (fix round 2: a leg FROM a Stop
    // this very call just created landed in the wrong slot otherwise).
    planStops = null;
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
    // An end with no zone of its own reads its wall time in the zone the
    // import guessed for it. If that conversion fails (a malformed wall
    // time), keep the original string rather than dropping it to undefined
    // (fix round 1, #4) — createTransport's own validation then sees it, the
    // same as it would for a typed entry, instead of silently losing a
    // booked time.
    if (depTimezone && input.depAt && !input.fromStopId) {
      const converted = wallTimeToInstant(input.depAt, depTimezone)?.toISOString();
      if (converted) input.depAt = converted;
    }
    if (arrTimezone && input.arrAt && !input.toStopId) {
      const converted = wallTimeToInstant(input.arrAt, arrTimezone)?.toISOString();
      if (converted) input.arrAt = converted;
    }
    const ordered = await stopsOnPlan();
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
