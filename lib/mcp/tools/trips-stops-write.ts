/**
 * Write tools for Trips and Stops (spec 2026-10-09, Task 11): create/update a
 * Trip, set its Hard end date, and the full Stop lifecycle — add, update,
 * delete (owner-only, previewed first), reorder, re-night, re-date, Pin,
 * make rough, annotate, Firm up and assign to a Chapter.
 *
 * Every write delegates to the same server actions the app itself uses
 * (`server/actions/trips`, `stops`, `chapters`), which already resolve to
 * the acting Traveller inside a Claude connection (via `requireUser`/
 * `requireTripAccess`) and record Activity marked "via Claude" — these
 * tools add no access logic of their own. Real plan only: `createStop`'s
 * and `firmUpTrip`'s optional `forkId` is never supplied (constraints.md).
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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
import type { StopInput } from "@/lib/validations/stop";
import { runTool } from "../run-tool";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const roughMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month");

const stopContentShape = {
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

type StopArgs = {
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
};

/**
 * Builds the StopInput the action expects: "scheduled" when both dates are
 * given, else "rough". A missing `nights` on a rough Stop is left for the
 * action's own re-validation to reject with a field error, same as any
 * other bad input.
 */
function buildStopInput(args: StopArgs): StopInput {
  const { name, countryCode, country, lat, lng, notes, nights, arriveDate, departDate, timezone } = args;
  if (arriveDate && departDate) {
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
  return {
    mode: "rough",
    name,
    country,
    countryCode,
    nights: nights as number,
    lat,
    lng,
    notes,
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
      description: "Read the trip first; fields you omit are cleared.",
      inputSchema: {
        tripId: z.string(),
        name: z.string().trim().min(1),
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
        homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]]),
        // Accepted for symmetry with create_trip, but TripInput (unlike
        // CreateTripInput) carries no roughMonth field — updateTrip clears
        // the Rough month on its own once a startDate is set, and leaves it
        // alone otherwise, so this value is never forwarded.
        roughMonth: roughMonth.optional(),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ tripId, name, startDate, endDate, homeCurrency, roughMonth: _roughMonth }) =>
      runTool("update_trip", () => updateTrip(tripId, { name, startDate, endDate, homeCurrency })),
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
      inputSchema: { tripId: z.string(), afterStopId: z.string().optional(), ...stopContentShape },
    },
    ({ tripId, afterStopId, ...rest }) =>
      runTool("add_stop", () => createStop(tripId, buildStopInput(rest), undefined, afterStopId ?? null)),
  );

  server.registerTool(
    "update_stop",
    {
      title: "Update stop",
      description: "Replaces a Stop's fields. A full replace, not a patch. Read the Stop first.",
      inputSchema: { stopId: z.string(), ...stopContentShape },
    },
    ({ stopId, ...rest }) => runTool("update_stop", () => updateStop(stopId, buildStopInput(rest))),
  );

  server.registerTool(
    "delete_stop",
    {
      title: "Delete stop",
      description:
        "Deletes a Stop and its Accommodation. Owner-only; previews what would be lost first. The app can restore it from Recently deleted afterward.",
      inputSchema: { stopId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ stopId }) =>
      runTool("delete_stop", async () => {
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
    ({ stopId, direction }) => runTool("move_stop", () => moveStop(stopId, direction)),
  );

  server.registerTool(
    "set_stop_nights",
    {
      title: "Set stop nights",
      description: "Sets how many nights a Stop covers. On a scheduled Stop this moves its depart date forward or back.",
      inputSchema: { stopId: z.string(), nights: z.number().int().min(0).max(366) },
    },
    ({ stopId, nights }) => runTool("set_stop_nights", () => setStopNights(stopId, nights)),
  );

  server.registerTool(
    "set_stop_dates",
    {
      title: "Set stop dates",
      description: "Sets a Stop's arrive and depart dates directly.",
      inputSchema: { stopId: z.string(), arriveDate: isoDate, departDate: isoDate },
    },
    ({ stopId, arriveDate, departDate }) => runTool("set_stop_dates", () => setStopDates(stopId, { arriveDate, departDate })),
  );

  server.registerTool(
    "toggle_stop_pin",
    {
      title: "Toggle stop pin",
      description: "Flips whether the Stop is Pinned (fixed dates). Read the plan first to see the current value.",
      inputSchema: { stopId: z.string() },
    },
    ({ stopId }) => runTool("toggle_stop_pin", () => toggleStopPin(stopId)),
  );

  server.registerTool(
    "make_stop_rough",
    {
      title: "Make stop rough",
      description: "Clears a scheduled Stop's dates, turning it back into a rough Stop. Its nights are kept.",
      inputSchema: { stopId: z.string() },
    },
    ({ stopId }) => runTool("make_stop_rough", () => makeStopRough(stopId)),
  );

  server.registerTool(
    "set_stop_notes",
    {
      title: "Set stop notes",
      description: "Replaces the free-text notes on a Stop.",
      inputSchema: { stopId: z.string(), notes: z.string() },
    },
    ({ stopId, notes }) => runTool("set_stop_notes", () => setStopNotes(stopId, notes)),
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
    ({ stopId, chapterId }) => runTool("assign_stop_to_chapter", () => assignStopToChapter(stopId, chapterId)),
  );
}
