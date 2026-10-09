/**
 * "Make it fit" tools for the Claude connection (spec 2026-10-09, Task 15):
 * a preview of how to bring an over-deadline trip back under it (a
 * proportional trim plan across flexible Stops, and per-Stop drop
 * candidates), and an apply step that carries out one of those choices.
 *
 * Mirrors the app's own Make it fit dialog (`components/trip/make-it-fit.tsx`)
 * and the anchor it's given (`components/plan/fit-tile.tsx`: the trip's
 * startDate) rather than inventing a second notion of "over": the deadline
 * used throughout is `getTripProjection`'s `deadline` (ADR 0068 — a dated
 * return leg, not the plain Hard end date, when one is set), same as the
 * dialog's `deadlineDate` prop. Real plan only: stops are loaded with
 * `REAL_PLAN`; neither tool accepts or passes a `forkId`.
 *
 * `make_it_fit_apply` takes exactly one of `trims` or `dropStopId` — a
 * combination that can't apply (both, or neither) is a tool error, not a
 * guess at which one was meant. Trims are applied in order via
 * `setStopNights`, stopping at the first failure (mirrors `applyTrim`,
 * make-it-fit.tsx ~line 157) and naming how many applied before it did.
 * Dropping a Stop calls `deleteStop` directly — permanent, same as the app's
 * `performDrop` (~line 186): the tool description says so and asks Claude to
 * confirm with the person first. Every stopId (in `trims` or `dropStopId`)
 * must belong to this trip's real plan, checked against the stops just
 * loaded — a foreign id (another trip's Stop, or a made-up one) reads as
 * `NOT_FOUND_TEXT`, same as a non-member trip id, and triggers no action.
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { nightsOver, buildTrimPlan, buildDropCandidates, type FitStop } from "@/lib/make-it-fit";
import { getTripProjection, setStopNights, deleteStop } from "@/server/actions/stops";
import { runTool } from "../run-tool";

async function loadFitStops(tripId: string): Promise<FitStop[]> {
  return db.stop.findMany({
    where: { tripId, ...REAL_PLAN },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, arriveDate: true, departDate: true, nights: true, pinned: true, sortOrder: true },
  });
}

// ---------------------------------------------------------------------------
// make_it_fit_preview
// ---------------------------------------------------------------------------

async function loadFitPreview(tripId: string) {
  await requireTripAccess(tripId);
  const [trip, stops, projection] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } }),
    loadFitStops(tripId),
    getTripProjection(tripId),
  ]);
  const anchor = trip?.startDate ?? null;
  const deadlineDate = projection.deadline?.date ?? null;

  const over = nightsOver(projection.projectedEnd, deadlineDate);
  if (over === 0) return { fits: true as const };

  return {
    deadline: projection.deadline,
    projectedEnd: projection.projectedEnd,
    nightsOver: over,
    trim: buildTrimPlan(stops, anchor, deadlineDate),
    drop: buildDropCandidates(stops, anchor, deadlineDate),
  };
}

// ---------------------------------------------------------------------------
// make_it_fit_apply
// ---------------------------------------------------------------------------

type Failure = { success: false; errors: Record<string, string[]> };

function errorText(errors?: Record<string, string[]>): string {
  if (!errors) return "unknown error";
  return Object.entries(errors)
    .flatMap(([k, msgs]) => msgs.map((m) => (k === "_" ? m : `${k}: ${m}`)))
    .join("; ");
}

async function applyMakeItFit(
  tripId: string,
  trims: { stopId: string; nights: number }[] | undefined,
  dropStopId: string | undefined,
): Promise<Failure | { success: true; applied: { stopId: string; nights: number }[] } | Awaited<ReturnType<typeof deleteStop>>> {
  // Exactly one of the two routes — both or neither can't apply.
  if ((trims !== undefined) === (dropStopId !== undefined)) {
    return { success: false, errors: { _: ["Pass exactly one of trims or dropStopId."] } };
  }

  await requireTripAccess(tripId);
  const ids = new Set((await loadFitStops(tripId)).map((s) => s.id));

  if (trims) {
    for (const t of trims) if (!ids.has(t.stopId)) notFound();

    const applied: { stopId: string; nights: number }[] = [];
    for (const t of trims) {
      const result = await setStopNights(t.stopId, t.nights);
      if (!result.success) {
        return {
          success: false,
          errors: {
            _: [
              `Applied ${applied.length} of ${trims.length} trim(s); stop ${t.stopId} failed: ${errorText(result.errors)}`,
            ],
          },
        };
      }
      applied.push(t);
    }
    return { success: true, applied };
  }

  // The exactly-one check above guarantees dropStopId is set here.
  if (!ids.has(dropStopId!)) notFound();
  return deleteStop(dropStopId!);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMakeItFitTools(server: McpServer): void {
  server.registerTool(
    "make_it_fit_preview",
    {
      title: "Make it fit preview",
      description:
        "Previews how to bring an over-deadline trip back under it: a proportional trim plan across flexible (not Pinned) Stops, and drop candidates (the effect of removing each one). Returns { fits: true } when the trip is already within its deadline.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("make_it_fit_preview", () => loadFitPreview(tripId)),
  );

  server.registerTool(
    "make_it_fit_apply",
    {
      title: "Make it fit apply",
      description:
        "Applies one Make it fit choice. Pass trims (a list of { stopId, nights }) to set nights on flexible Stops in order, stopping at the first one that fails; or pass dropStopId to remove a Stop instead. Pass exactly one, not both. Dropping a Stop permanently deletes it: unlike a Trip, a deleted Stop never goes to Recently deleted. Confirm with the person before calling this.",
      inputSchema: {
        tripId: z.string(),
        trims: z.array(z.object({ stopId: z.string(), nights: z.number().int().min(0).max(366) })).optional(),
        dropStopId: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    ({ tripId, trims, dropStopId }) => runTool("make_it_fit_apply", () => applyMakeItFit(tripId, trims, dropStopId)),
  );
}
