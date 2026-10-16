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
 * `update_trip` and `update_stop` pass only the fields the caller supplied
 * (ADR 0075): the actions merge onto the row they hold — `updateStop` by
 * lib/stop-patch.ts's rules (mode from the dates, the lone-date and nights
 * checks, the Chapter carried).
 *
 * Timezone for a scheduled Stop: `stopTimezone` (lib/tz.ts), the one rule
 * the Add-a-stop UI, `createStop`/`updateStop`, the lone-Stop rule and the
 * Booking import share — an explicit zone wins unless it is the "UTC"
 * fallback, then the country code, then the country name.
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { requireOutsideSurprise } from "@/lib/surprise-guard";
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
import { setSurprise, revealSurprise } from "@/server/actions/surprise";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { stopTimezone } from "@/lib/tz";
import { NIGHTS_REQUIRED, LONE_DATE, TIMEZONE_ON_ROUGH, nightsMismatch } from "@/lib/stop-patch";
import type { StopInput } from "@/lib/validations/stop";
import { runTool } from "../run-tool";
import { requireRealPlanRow, requireRealPlanRows } from "../real-plan";
import { isoDate } from "@/lib/validations/primitives";

const roughMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month");

/** The shape every field-error-shaped tool failure shares (ActionFailure). */
type Failure = { success: false; errors: Record<string, string[]> };
const isFailure = (v: StopInput | Failure): v is Failure => "success" in v && v.success === false;

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

/**
 * Builds the StopInput createStop expects: "scheduled" when both dates are
 * given, else "rough". A rough Stop with no `nights` anywhere is a tool
 * error, not a silently-invalid create call; so is a lone date, a timezone
 * on a rough Stop, or nights that disagree with both dates.
 */
function buildStopInput(args: {
  name: string;
  countryCode: string;
  country?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  nights?: number;
  arriveDate?: string;
  departDate?: string;
  timezone?: string;
}): StopInput | Failure {
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
      timezone: stopTimezone({ timezone, countryCode, country }),
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

/**
 * `set_stop_pinned`'s read of the current Pinned value: the real-plan
 * pre-check (`requireRealPlanRow`'s shape) and the read in one query, so
 * the tool can toggle only when the value actually differs.
 */
async function loadStopPinned(stopId: string): Promise<boolean> {
  const stop = await db.stop.findUnique({ where: { id: stopId, forkId: null }, select: { tripId: true, pinned: true } });
  if (!stop) notFound();
  const { user } = await requireTripAccess(stop.tripId);
  await requireOutsideSurprise(user.id, { stopId });
  return stop.pinned;
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
        homeTimezone: z.string().trim().optional().describe("IANA timezone of the Home base, e.g. Australia/Brisbane. Home ends of Transport are read and written in it."),
      },
    },
    ({ tripId, ...patch }) =>
      runTool("update_trip", () => updateTrip(tripId, patch)),
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
        "Changes only the fields you pass; fields you omit keep their current value. Passing country or countryCode re-locates the Stop: its point is looked up again from the place. Supplying both arriveDate and departDate makes the Stop scheduled; supplying nights with no dates on a scheduled Stop makes it rough again, same as make_stop_rough. A dated Trip's only Stop always keeps the Trip's dates; making it rough is refused (ADR 0073).",
      inputSchema: { stopId: z.string(), ...stopPatchShape },
    },
    ({ stopId, ...patch }) =>
      runTool("update_stop", async () => {
        await requireRealPlanRow("stop", stopId);
        return updateStop(stopId, patch);
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
      description: "Clears a scheduled Stop's dates, turning it back into a rough Stop. Its nights are kept. A dated Trip's only Stop always keeps the Trip's dates; making it rough is refused (ADR 0073).",
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

  // Surprise (CONTEXT.md, ADR 0051). The real-plan check also refuses a
  // Traveller surprised by the row; who may set or reveal is the action's call.
  server.registerTool(
    "set_surprise",
    {
      title: "Make a Stop or item a surprise",
      description:
        "Makes a Stop or a thing to do a Surprise: the named Travellers (default: everyone but you) see only its outside (a Stop's name, dates and transport, or an item's date and time) until it is revealed. Only works on the real plan.",
      inputSchema: { kind: z.enum(["STOP", "ITEM"]), id: z.string(), forUserIds: z.array(z.string()).optional() },
    },
    ({ kind, id, forUserIds }) => runTool("set_surprise", async () => {
        await requireRealPlanRow(kind === "STOP" ? "stop" : "item", id);
        return setSurprise({ kind, id, forIds: forUserIds });
      }),
  );

  server.registerTool(
    "reveal_surprise",
    {
      title: "Reveal a surprise",
      description: "Reveals a Surprise you planned, so everyone sees inside it. Planner only.",
      inputSchema: { kind: z.enum(["STOP", "ITEM"]), id: z.string() },
    },
    ({ kind, id }) => runTool("reveal_surprise", async () => {
        await requireRealPlanRow(kind === "STOP" ? "stop" : "item", id);
        return revealSurprise({ kind, id });
      }),
  );
}
