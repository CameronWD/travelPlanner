/**
 * Write tools for Trips and Stops (spec 2026-10-09, Task 11): create/update a
 * Trip, set its Hard end date, and the full Stop lifecycle — add, update,
 * delete (owner-only, previewed first, permanent), reorder, re-night,
 * re-date, Pin, make rough, annotate, Firm up and assign to a Chapter.
 *
 * Every write delegates to the same server actions the app itself uses
 * (`server/actions/trips`, `stops`, `chapters`), which already resolve to
 * the acting Traveller inside a Claude connection (via `requireUser`/
 * `requireTripAccess`) and record Activity marked "via Claude". Real plan
 * only: `createStop`'s and `firmUpTrip`'s optional `forkId` is never
 * supplied (constraints.md), and every Stop/Chapter id a tool takes is
 * checked against the real plan first (`../real-plan.ts`), since the
 * actions look rows up by id alone and would act on a Fork's row.
 *
 * `update_trip` and `update_stop` are PATCH, not replace (fix round 1,
 * 2026-10-09): both actions write every field they're given, including
 * `null`/absent ones, as the new value — `updateStop`'s rough branch always
 * writes `chapterId: chapterId ?? null`, for instance, so a tool that built
 * a full `StopInput` without a `chapterId` field (there's no such field on
 * either tool's input; `assign_stop_to_chapter` owns that) would silently
 * un-assign the Stop's Chapter on every edit. So these two tools load the
 * current row, merge only the fields the caller actually supplied over it,
 * and send the action a complete, merged input instead.
 *
 * Timezone for a scheduled Stop: the Add-a-stop UI
 * (components/trip/stop-form-dialog.tsx) derives it from the picked
 * country via `guessTimezoneForCountry` (lib/tz.ts) rather than asking the
 * person. `add_stop`/`update_stop` reuse that same helper when Claude
 * omits `timezone`, falling back to the countryCode/country already
 * required for the Stop. `createStop` has its own "UTC" fallback for the
 * insert path, but `updateStop` has none, so resolving here (rather than
 * relying on the action) keeps both tools consistent.
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { createTrip, updateTrip, setTripHardEndDate } from "@/server/actions/trips";
import {
  createStop,
  updateStop,
  deleteStop,
  previewStopDeletion,
  moveStop,
  setStopDates,
  firmUpTrip,
  toggleStopPin,
  makeStopRough,
  setStopNotes,
  setStopNights,
} from "@/server/actions/stops";
// Not server/actions/stops's same-named export: that one appends to a
// chapter's rough order only and skips the chapters.ts overlap/validation
// path that the app's own Chapter UI uses.
import { assignStopToChapter } from "@/server/actions/chapters";
import { CURRENCY_CODES } from "@/lib/currencies";
import { guessTimezoneForCountry } from "@/lib/tz";
import { nightsBetween } from "@/lib/dates";
import type { StopInput } from "@/lib/validations/stop";
import type { TripInput } from "@/lib/validations/trip";
import { runTool } from "../run-tool";
import { requireRealPlanRow, requireRealPlanRows } from "../real-plan";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const roughMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month");

/** The shape every field-error-shaped tool failure shares (ActionFailure). */
type Failure = { success: false; errors: Record<string, string[]> };
const isFailure = (v: StopInput | Failure | TripInput): v is Failure => "success" in v && v.success === false;

const NIGHTS_REQUIRED: Failure = {
  success: false,
  errors: { nights: ["Nights is required for a rough stop."] },
};

// No accepted input is silently dropped (final review finding 1): each of
// these is a field the tool would otherwise take and then ignore.
const LONE_DATE: Failure = {
  success: false,
  errors: { arriveDate: ["Pass both arriveDate and departDate to schedule a Stop."] },
};

const TIMEZONE_ON_ROUGH: Failure = {
  success: false,
  errors: { timezone: ["A timezone only applies to a Stop with dates. Pass arriveDate and departDate too, or leave timezone out."] },
};

/** `nights` alongside both dates must agree with them; the dates win otherwise, so a mismatch would be dropped. */
function nightsMismatch(nights: number | undefined, arriveDate: string, departDate: string): Failure | null {
  if (nights === undefined) return null;
  const covered = nightsBetween(arriveDate, departDate);
  if (nights === covered) return null;
  return {
    success: false,
    errors: { nights: [`Those dates cover ${covered} nights, not ${nights}. Pass matching nights, or leave nights out.`] },
  };
}

// ---------------------------------------------------------------------------
// add_stop / update_stop shared field shapes
// ---------------------------------------------------------------------------

/** add_stop: a full Stop description — name and countryCode are required. */
const stopCreateShape = {
  name: z.string().trim().min(1),
  countryCode: z.string().trim().regex(/^[a-zA-Z]{2}$/),
  country: z.string().trim().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().optional(),
  nights: z.number().int().min(0).max(366).optional(),
  arriveDate: isoDate.optional(),
  departDate: isoDate.optional(),
  timezone: z.string().trim().optional(),
};

/** update_stop: every field optional — a patch merges onto the current row. */
const stopPatchShape = {
  name: z.string().trim().min(1).optional(),
  countryCode: z.string().trim().regex(/^[a-zA-Z]{2}$/).optional(),
  country: z.string().trim().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().optional(),
  nights: z.number().int().min(0).max(366).optional(),
  arriveDate: isoDate.optional(),
  departDate: isoDate.optional(),
  timezone: z.string().trim().optional(),
};

type StopPatch = {
  name?: string;
  countryCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  nights?: number;
  arriveDate?: string;
  departDate?: string;
  timezone?: string;
};

/**
 * Builds the StopInput createStop expects: "scheduled" when both dates are
 * given, else "rough". A rough Stop with no `nights` anywhere is a tool
 * error, not a silently-invalid create call; so is a lone date, a timezone
 * on a rough Stop, or nights that disagree with both dates.
 */
function buildStopInput(args: StopPatch & { name: string; countryCode: string }): StopInput | Failure {
  const { name, countryCode, country, lat, lng, notes, nights, arriveDate, departDate, timezone } = args;
  if ((arriveDate === undefined) !== (departDate === undefined)) return LONE_DATE;
  if (arriveDate !== undefined && departDate !== undefined) {
    const mismatch = nightsMismatch(nights, arriveDate, departDate);
    if (mismatch) return mismatch;
    return {
      mode: "scheduled",
      name,
      country,
      countryCode,
      timezone: timezone ?? guessTimezoneForCountry(countryCode ?? country),
      arriveDate,
      departDate,
      lat,
      lng,
      notes,
    };
  }
  if (timezone !== undefined) return TIMEZONE_ON_ROUGH;
  if (nights === undefined) return NIGHTS_REQUIRED;
  return { mode: "rough", name, country, countryCode, nights, lat, lng, notes };
}

type StopRow = {
  tripId: string;
  name: string;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  nights: number | null;
  arriveDate: string | null;
  departDate: string | null;
  timezone: string | null;
  chapterId: string | null;
};

/**
 * Loads the current Stop for a patch, trip-access-checked. A missing row
 * (or a Fork's: `forkId: null` scopes to the real plan) reads as `notFound()` (mapped by `runTool` to the same "not found" text a
 * non-member's id gets), checked *before* the access check can even run —
 * membership is then verified before any of the row's values are used.
 */
async function loadStopForPatch(stopId: string): Promise<StopRow> {
  const stop = await db.stop.findUnique({
    where: { id: stopId, forkId: null },
    select: {
      tripId: true,
      name: true,
      country: true,
      countryCode: true,
      lat: true,
      lng: true,
      notes: true,
      nights: true,
      arriveDate: true,
      departDate: true,
      timezone: true,
      chapterId: true,
    },
  });
  if (!stop) notFound();
  await requireTripAccess(stop.tripId);
  return stop;
}

/**
 * Merges a patch onto the current Stop row into a full `StopInput`.
 *
 * Mode stays whatever the Stop currently is UNLESS the caller supplies both
 * `arriveDate` and `departDate` (→ scheduled), or supplies `nights` with no
 * dates on an already-scheduled Stop (→ rough, same as `make_stop_rough`).
 * `chapterId` is never part of this tool's input — it always carries the
 * current value forward (use `assign_stop_to_chapter` to change it).
 *
 * A single date with no partner is only meaningful against an *already*
 * scheduled Stop, where it merges with the current other date (re-dating
 * one end of the stay); against a rough Stop there is no current date to
 * pair it with, and silently dropping it would read as success while
 * changing nothing, so that's a tool error instead (fix round 2). Same for
 * a timezone on a Stop that ends up rough, and for nights supplied with
 * both dates that disagree with them (final review finding 1).
 */
function mergeStopPatch(current: StopRow, patch: StopPatch): StopInput | Failure {
  const name = patch.name ?? current.name;
  const country = patch.country ?? current.country ?? undefined;
  const countryCode = patch.countryCode ?? current.countryCode ?? undefined;
  const lat = patch.lat ?? current.lat ?? undefined;
  const lng = patch.lng ?? current.lng ?? undefined;
  const notes = patch.notes ?? current.notes ?? undefined;

  const hasArrive = patch.arriveDate !== undefined;
  const hasDepart = patch.departDate !== undefined;
  const suppliesBothDates = hasArrive && hasDepart;
  const wasScheduled = current.arriveDate != null;
  const switchesToRough = patch.nights !== undefined && !suppliesBothDates && wasScheduled;
  const scheduled = suppliesBothDates || (wasScheduled && !switchesToRough);

  if (!scheduled && hasArrive !== hasDepart) return LONE_DATE;
  if (!scheduled && patch.timezone !== undefined) return TIMEZONE_ON_ROUGH;
  if (suppliesBothDates) {
    const mismatch = nightsMismatch(patch.nights, patch.arriveDate as string, patch.departDate as string);
    if (mismatch) return mismatch;
  }

  if (scheduled) {
    // wasScheduled guarantees current.arriveDate/departDate are both set
    // (the app always writes them together); suppliesBothDates guarantees
    // both from the patch; the lone-date check above covers the one
    // remaining case (one date from the patch, the other from current).
    const arriveDate = (patch.arriveDate ?? current.arriveDate) as string;
    const departDate = (patch.departDate ?? current.departDate) as string;
    return {
      mode: "scheduled",
      name,
      country,
      countryCode,
      timezone: patch.timezone ?? current.timezone ?? guessTimezoneForCountry(countryCode ?? country),
      arriveDate,
      departDate,
      lat,
      lng,
      notes,
    };
  }

  const nights = patch.nights ?? current.nights ?? undefined;
  if (nights === undefined) return NIGHTS_REQUIRED;
  return { mode: "rough", name, country, countryCode, nights, chapterId: current.chapterId, lat, lng, notes };
}

/**
 * `set_stop_pinned`'s read of the current Pinned value: the real-plan
 * pre-check (`requireRealPlanRow`'s shape) and the read in one query, so
 * the tool can toggle only when the value actually differs.
 */
async function loadStopPinned(stopId: string): Promise<boolean> {
  const stop = await db.stop.findUnique({ where: { id: stopId, forkId: null }, select: { tripId: true, pinned: true } });
  if (!stop) notFound();
  await requireTripAccess(stop.tripId);
  return stop.pinned;
}

// ---------------------------------------------------------------------------
// update_trip patch helpers
// ---------------------------------------------------------------------------

type TripRow = {
  name: string;
  startDate: string | null;
  endDate: string | null;
  hardEndDate: string | null;
  homeCurrency: string;
};
type TripPatch = { name?: string; startDate?: string; endDate?: string; homeCurrency?: string };

/** Loads the current Trip for a patch; access-checked first, same as every other trip-scoped tool. */
async function loadTripForPatch(tripId: string): Promise<TripRow> {
  await requireTripAccess(tripId);
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { name: true, startDate: true, endDate: true, hardEndDate: true, homeCurrency: true },
  });
  if (!trip) notFound();
  return trip;
}

/**
 * Merges a patch onto the current Trip row.
 *
 * `updateTrip` writes every `TripInput` key it's given, absent or not: an
 * absent `startDate`/`endDate`/`hardEndDate` is written as `null` (cleared),
 * so all three must be forwarded from the current row whenever the patch
 * doesn't supply them — `hardEndDate` isn't even part of this tool's input
 * (that's `set_hard_end_date`'s job), so without this it would be cleared
 * on every `update_trip` call (fix round 2, data loss). `homeName` and
 * `roundTrip` are the opposite: `updateTrip` already treats an absent key
 * on those two as "leave unchanged", and neither is part of this tool's
 * input, so they're correctly left out of the object entirely rather than
 * loaded and forwarded.
 */
function mergeTripPatch(current: TripRow, patch: TripPatch): TripInput {
  return {
    name: patch.name ?? current.name,
    startDate: patch.startDate ?? current.startDate ?? undefined,
    endDate: patch.endDate ?? current.endDate ?? undefined,
    hardEndDate: current.hardEndDate ?? undefined,
    homeCurrency: (patch.homeCurrency ?? current.homeCurrency) as TripInput["homeCurrency"],
  };
}

export function registerTripStopWriteTools(server: McpServer): void {
  server.registerTool(
    "create_trip",
    {
      title: "Create trip",
      description: "Creates a new Trip for the acting Traveller, who becomes its owner.",
      inputSchema: {
        name: z.string().trim().min(1),
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
        hardEndDate: isoDate.optional(),
        homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]]),
        homeName: z.string().optional(),
        roundTrip: z.boolean().optional(),
        roughMonth: roughMonth.optional(),
      },
    },
    (input) => runTool("create_trip", () => createTrip(input)),
  );

  server.registerTool(
    "update_trip",
    {
      title: "Update trip",
      description: "Changes only the fields you pass; fields you omit keep their current value.",
      inputSchema: {
        tripId: z.string(),
        name: z.string().trim().min(1).optional(),
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
        homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]]).optional(),
      },
    },
    ({ tripId, ...patch }) =>
      runTool("update_trip", async () => {
        const current = await loadTripForPatch(tripId);
        return updateTrip(tripId, mergeTripPatch(current, patch));
      }),
  );

  server.registerTool(
    "set_hard_end_date",
    {
      title: "Set hard end date",
      description: "Sets or clears a Trip's Hard end date, the Traveller's ceiling on when the trip must be over. Not a schedule change. Pass null to clear it.",
      inputSchema: { tripId: z.string(), hardEndDate: isoDate.nullable() },
    },
    ({ tripId, hardEndDate }) => runTool("set_hard_end_date", () => setTripHardEndDate(tripId, hardEndDate)),
  );

  server.registerTool(
    "add_stop",
    {
      title: "Add stop",
      description:
        "Adds a Stop to the trip's real plan. Give arriveDate and departDate for a scheduled Stop (timezone is derived from the country if you omit it); give nights instead for a rough Stop with no dates yet. afterStopId inserts right after that Stop; omit it to append at the end.",
      inputSchema: { tripId: z.string(), afterStopId: z.string().optional(), ...stopCreateShape },
    },
    ({ tripId, afterStopId, ...rest }) =>
      runTool("add_stop", async () => {
        const input = buildStopInput(rest);
        if (isFailure(input)) return input;
        await requireRealPlanRows([["stop", afterStopId]]);
        return createStop(tripId, input, undefined, afterStopId ?? null);
      }),
  );

  server.registerTool(
    "update_stop",
    {
      title: "Update stop",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. Supplying both arriveDate and departDate makes the Stop scheduled; supplying nights with no dates on a scheduled Stop makes it rough again, same as make_stop_rough.",
      inputSchema: { stopId: z.string(), ...stopPatchShape },
    },
    ({ stopId, ...patch }) =>
      runTool("update_stop", async () => {
        const current = await loadStopForPatch(stopId);
        const merged = mergeStopPatch(current, patch);
        if (isFailure(merged)) return merged;
        return updateStop(stopId, merged);
      }),
  );

  server.registerTool(
    "delete_stop",
    {
      title: "Delete stop",
      description:
        "Permanently deletes a Stop and its Accommodation. This cannot be undone: unlike a Trip, a deleted Stop never goes to Recently deleted. Owner-only. Confirm with the person before calling this.",
      inputSchema: { stopId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ stopId }) =>
      runTool("delete_stop", async () => {
        await requireRealPlanRow("stop", stopId);
        const preview = await previewStopDeletion(stopId);
        if (!preview.success) return preview;
        const result = await deleteStop(stopId);
        if (!result.success) return result;
        return { success: true, preview: preview.preview };
      }),
  );

  server.registerTool(
    "move_stop",
    {
      title: "Move stop",
      description: "Moves a Stop one place up or down, swapping it with its neighbour. A no-op at either end.",
      inputSchema: { stopId: z.string(), direction: z.enum(["up", "down"]) },
    },
    ({ stopId, direction }) => runTool("move_stop", async () => {
        await requireRealPlanRow("stop", stopId);
        return moveStop(stopId, direction);
      }),
  );

  server.registerTool(
    "set_stop_nights",
    {
      title: "Set stop nights",
      description: "Sets how many nights a Stop covers. On a scheduled Stop this moves its depart date forward or back.",
      inputSchema: { stopId: z.string(), nights: z.number().int().min(0).max(366) },
    },
    ({ stopId, nights }) => runTool("set_stop_nights", async () => {
        await requireRealPlanRow("stop", stopId);
        return setStopNights(stopId, nights);
      }),
  );

  server.registerTool(
    "set_stop_dates",
    {
      title: "Set stop dates",
      description: "Sets a Stop's arrive and depart dates directly.",
      inputSchema: { stopId: z.string(), arriveDate: isoDate, departDate: isoDate },
    },
    ({ stopId, arriveDate, departDate }) => runTool("set_stop_dates", async () => {
        await requireRealPlanRow("stop", stopId);
        return setStopDates(stopId, { arriveDate, departDate });
      }),
  );

  server.registerTool(
    "set_stop_pinned",
    {
      title: "Set stop pinned",
      description:
        "Sets whether a Stop is Pinned (its dates stay fixed when the plan shifts). Only a Stop with dates can be pinned. Returns the resulting state.",
      inputSchema: { stopId: z.string(), pinned: z.boolean() },
    },
    ({ stopId, pinned }) =>
      runTool("set_stop_pinned", async () => {
        const current = await loadStopPinned(stopId);
        if (current === pinned) return { success: true, pinned };
        const result = await toggleStopPin(stopId);
        if (!result.success) return result;
        return { success: true, pinned };
      }),
  );

  server.registerTool(
    "make_stop_rough",
    {
      title: "Make stop rough",
      description: "Clears a scheduled Stop's dates, turning it back into a rough Stop. Its nights are kept.",
      inputSchema: { stopId: z.string() },
    },
    ({ stopId }) => runTool("make_stop_rough", async () => {
        await requireRealPlanRow("stop", stopId);
        return makeStopRough(stopId);
      }),
  );

  server.registerTool(
    "set_stop_notes",
    {
      title: "Set stop notes",
      description: "Replaces the free-text notes on a Stop.",
      inputSchema: { stopId: z.string(), notes: z.string() },
    },
    ({ stopId, notes }) => runTool("set_stop_notes", async () => {
        await requireRealPlanRow("stop", stopId);
        return setStopNotes(stopId, notes);
      }),
  );

  server.registerTool(
    "firm_up_trip",
    {
      title: "Firm up trip",
      description:
        "Turns rough Stops into scheduled ones by flowing dates forward from an anchor (the trip's start date by default, or anchorDate). Stops at any Pinned Stop.",
      inputSchema: { tripId: z.string(), anchorDate: isoDate.optional() },
    },
    ({ tripId, anchorDate }) => runTool("firm_up_trip", () => firmUpTrip(tripId, anchorDate)),
  );

  server.registerTool(
    "assign_stop_to_chapter",
    {
      title: "Assign stop to chapter",
      description: "Assigns a Stop to a Chapter. Pass chapterId null to make it Ungrouped instead.",
      inputSchema: { stopId: z.string(), chapterId: z.string().nullable() },
    },
    ({ stopId, chapterId }) => runTool("assign_stop_to_chapter", async () => {
        await requireRealPlanRows([
          ["stop", stopId],
          ["chapter", chapterId],
        ]);
        return assignStopToChapter(stopId, chapterId);
      }),
  );
}
