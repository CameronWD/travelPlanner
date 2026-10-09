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
 *
 * A Pinned Stop is off-limits to both routes (fix round 1, 2026-10-09):
 * `MakeItFitDialog` only ever builds its trim list and drop candidates from
 * `stops.filter(isFlexible)` (make-it-fit.tsx ~121, ~149) — a Pinned Stop
 * never appears as an option in the app at all. A tool call can name one
 * directly, so both routes check every referenced id's `pinned` flag (from
 * the same real-plan stops already loaded for the id check) and refuse with
 * an explicit error rather than silently trimming or deleting it. This is
 * deliberately not `NOT_FOUND_TEXT`: the id is real and the caller is a
 * member, so the tool says exactly why the call can't apply. All ids (every
 * trim's `stopId`, or `dropStopId`) are checked — existence then pinned —
 * before any `setStopNights`/`deleteStop` call runs.
 *
 * Nights floor: `buildTrimPlan`'s own `TRIM_FLOOR` (1) only bounds its
 * *suggested* plan — the dialog's manual per-stop `Input` is
 * `min={0}` with no clamp back up before `applyTrim` (make-it-fit.tsx
 * ~243), so a person can and does apply a 0-night trim through the real UI.
 * `nights: 0` is therefore accepted here too (same as `set_stop_nights`'s
 * own `min(0)`), not rejected as "below the floor".
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { nightsOver, buildTrimPlan, buildDropCandidates, type FitStop } from "@/lib/make-it-fit";
import { getTripProjection, setStopNights, deleteStop } from "@/server/actions/stops";
import { runTool, fieldErrors } from "../run-tool";

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

const PINNED_ERROR: Failure = {
  success: false,
  errors: { _: ["Make it fit never changes a Pinned Stop. Unpin it first or pick a flexible Stop."] },
};

/** Looks up a referenced stopId against this trip's real-plan stops: a missing id reads as NOT_FOUND_TEXT (notFound() throws), a Pinned one as the explicit pinned error, else the Stop itself. */
function requireFlexibleStop(stopsById: Map<string, FitStop>, stopId: string): FitStop | Failure {
  const stop = stopsById.get(stopId);
  if (!stop) notFound();
  if (stop.pinned) return PINNED_ERROR;
  return stop;
}

const isFailure = (v: FitStop | Failure): v is Failure => "success" in v;

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
  const stopsById = new Map((await loadFitStops(tripId)).map((s) => [s.id, s]));

  if (trims) {
    // Validate every id — existence, then Pinned — before any setStopNights call.
    for (const t of trims) {
      const checked = requireFlexibleStop(stopsById, t.stopId);
      if (isFailure(checked)) return checked;
    }

    const applied: { stopId: string; nights: number }[] = [];
    for (const t of trims) {
      const result = await setStopNights(t.stopId, t.nights);
      if (!result.success) {
        return {
          success: false,
          errors: {
            _: [
              `Applied ${applied.length} of ${trims.length} trim(s); stop ${t.stopId} failed: ${fieldErrors(result.errors)}`,
            ],
          },
        };
      }
      applied.push(t);
    }
    return { success: true, applied };
  }

  // The exactly-one check above guarantees dropStopId is set here.
  const checked = requireFlexibleStop(stopsById, dropStopId!);
  if (isFailure(checked)) return checked;
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
        "Applies one Make it fit choice. Pass trims (a list of { stopId, nights }) to set nights on flexible Stops in order, stopping at the first one that fails; or pass dropStopId to remove a Stop instead. Pass exactly one, not both. Neither route accepts a Pinned Stop; unpin it first or pick a flexible one. Dropping a Stop permanently deletes it: unlike a Trip, a deleted Stop never goes to Recently deleted. Confirm with the person before calling this.",
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
