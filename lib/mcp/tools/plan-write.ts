/**
 * Write tools for Items, Wishlist, Votes, Day titles, Notes and Chapters
 * (spec 2026-10-09, Task 12): adding/updating/deleting a thing to do or
 * Wishlist idea, scheduling/unscheduling/placing it, pulling a Globe Marker
 * into the Wishlist, voting, Day titles, Notes, and the Chapter lifecycle
 * minus delete/reorder (covered elsewhere).
 *
 * Every write delegates to the same server actions the app itself uses
 * (`server/actions/items`, `votes`, `day-titles`, `notes`, `chapters`), which
 * already resolve to the acting Traveller inside a Claude connection (via
 * `requireUser`/`requireTripAccess`) and record Activity marked "via Claude"
 * — these tools add no access logic of their own. Real plan only: none of
 * `createItem`/`scheduleItem`/`placeIdeaAtStop`/`createChapter`'s optional
 * `forkId` is ever supplied (constraints.md).
 *
 * `update_thing_to_do` and `update_chapter` are PATCH, not replace (same
 * ruling as Task 11's `update_trip`/`update_stop`): `updateItem` writes every
 * `ItemInput` field it's given, including absent ones, as the new value
 * (`hiddenFromShares: data.hiddenFromShares ?? false`, for instance, so a
 * patch that only touches `notes` would silently un-hide a hidden Item from
 * shared links), and `updateChapter` requires `name`/`colour` on every call
 * even though this tool only means to change one field. So both load the
 * current row, merge only the fields the caller actually supplied over it,
 * and send the action a complete, merged input instead.
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import {
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  placeIdeaAtStop,
  addMarkerToWishlist,
} from "@/server/actions/items";
import { setVote, clearVote } from "@/server/actions/votes";
import { setDayTitle } from "@/server/actions/day-titles";
import { addNote } from "@/server/actions/notes";
import { createChapter, updateChapter } from "@/server/actions/chapters";
import { categorySchema } from "@/lib/validations/category";
import { voteLevelSchema, targetTypeSchema } from "@/lib/enums";
import { CHAPTER_COLOUR_VALUES } from "@/lib/chapter-colours";
import type { ItemInput } from "@/lib/validations/item";
import type { ChapterInput } from "@/lib/validations/chapter";
import { runTool } from "../run-tool";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format");
const chapterColourSchema = z.enum(CHAPTER_COLOUR_VALUES);

/** The shape every field-error-shaped tool failure shares (ActionFailure). */
type Failure = { success: false; errors: Record<string, string[]> };
const isFailure = (v: object): v is Failure => "success" in v && (v as { success: unknown }).success === false;

// ---------------------------------------------------------------------------
// add_thing_to_do / update_thing_to_do shared field shapes
// ---------------------------------------------------------------------------

/** add_thing_to_do: title and category are required. */
const itemCreateShape = {
  title: z.string().trim().min(1),
  category: categorySchema,
  stopId: z.string().optional(),
  date: isoDate.optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  address: z.string().optional(),
  link: z.string().optional(),
  booking: z.string().optional(),
  notes: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
};

/** update_thing_to_do: every field optional — a patch merges onto the current row. */
const itemPatchShape = {
  title: z.string().trim().min(1).optional(),
  category: categorySchema.optional(),
  stopId: z.string().optional(),
  date: isoDate.optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  address: z.string().optional(),
  link: z.string().optional(),
  booking: z.string().optional(),
  notes: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
};

type ItemPatch = {
  title?: string;
  category?: string;
  stopId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  address?: string;
  link?: string;
  booking?: string;
  notes?: string;
  lat?: number;
  lng?: number;
};

type ItemRow = {
  tripId: string;
  title: string;
  category: string;
  stopId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  hiddenFromShares: boolean;
};

/**
 * Loads the current Item for a patch, trip-access-checked. A missing row
 * reads as `notFound()` (mapped by `runTool` to the same "not found" text a
 * non-member's id gets), checked *before* the access check can even run —
 * membership is then verified before any of the row's values are used.
 */
async function loadItemForPatch(itemId: string): Promise<ItemRow> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: {
      tripId: true,
      title: true,
      category: true,
      stopId: true,
      date: true,
      startTime: true,
      endTime: true,
      address: true,
      link: true,
      booking: true,
      notes: true,
      lat: true,
      lng: true,
      hiddenFromShares: true,
    },
  });
  if (!item) notFound();
  await requireTripAccess(item.tripId);
  return item;
}

/**
 * Merges a patch onto the current Item row into a full `ItemInput`.
 *
 * `hiddenFromShares` is never part of this tool's input (there's no field
 * for it in the brief's table), yet `updateItem` writes it as `false` when
 * absent — so it's always carried forward from the current row, the same
 * way `update_stop` carries `chapterId` forward (fix round 1 pattern).
 */
function mergeItemPatch(current: ItemRow, patch: ItemPatch): ItemInput {
  return {
    title: patch.title ?? current.title,
    category: (patch.category ?? current.category) as ItemInput["category"],
    stopId: patch.stopId ?? current.stopId ?? undefined,
    date: patch.date ?? current.date ?? undefined,
    startTime: patch.startTime ?? current.startTime ?? undefined,
    endTime: patch.endTime ?? current.endTime ?? undefined,
    address: patch.address ?? current.address ?? undefined,
    link: patch.link ?? current.link ?? undefined,
    booking: patch.booking ?? current.booking ?? undefined,
    notes: patch.notes ?? current.notes ?? undefined,
    lat: patch.lat ?? current.lat ?? undefined,
    lng: patch.lng ?? current.lng ?? undefined,
    hiddenFromShares: current.hiddenFromShares,
  };
}

// ---------------------------------------------------------------------------
// update_chapter patch helpers
// ---------------------------------------------------------------------------

type ChapterRow = {
  tripId: string;
  name: string;
  colour: string;
  startDate: string | null;
  endDate: string | null;
};
type ChapterPatch = { name?: string; colour?: string; startDate?: string; endDate?: string };

const CHAPTER_DATE_PAIR_REQUIRED: Failure = {
  success: false,
  errors: { startDate: ["Pass both startDate and endDate, or neither, to a rough Chapter."] },
};

/** Loads the current Chapter for a patch; access-checked first, same as every other trip-scoped tool. */
async function loadChapterForPatch(chapterId: string): Promise<ChapterRow> {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { tripId: true, name: true, colour: true, startDate: true, endDate: true },
  });
  if (!chapter) notFound();
  await requireTripAccess(chapter.tripId);
  return chapter;
}

/**
 * Merges a patch onto the current Chapter row.
 *
 * `name` and `colour` are required on every `ChapterInput`, so a patch that
 * only means to change one of the other fields must still forward both from
 * the current row. The dates follow the same lone-date rule as
 * `update_stop`'s `arriveDate`/`departDate`: supplying both switches/keeps
 * the Chapter dated; supplying neither keeps whatever it currently is; a
 * lone date merges with the current counterpart when the Chapter is already
 * dated, and is a tool error (not a silent no-op) against a rough one, since
 * there's no current date to pair it with.
 */
function mergeChapterPatch(current: ChapterRow, patch: ChapterPatch): ChapterInput | Failure {
  const name = patch.name ?? current.name;
  const colour = patch.colour ?? current.colour;

  const hasStart = patch.startDate !== undefined;
  const hasEnd = patch.endDate !== undefined;
  const suppliesBoth = hasStart && hasEnd;
  const suppliesNeither = !hasStart && !hasEnd;
  const wasDated = current.startDate != null;

  if (!suppliesBoth && !suppliesNeither && !wasDated) {
    return CHAPTER_DATE_PAIR_REQUIRED;
  }

  const startDate = suppliesNeither ? current.startDate ?? undefined : patch.startDate ?? current.startDate ?? undefined;
  const endDate = suppliesNeither ? current.endDate ?? undefined : patch.endDate ?? current.endDate ?? undefined;

  return { name, colour, startDate, endDate } as ChapterInput;
}

export function registerPlanWriteTools(server: McpServer): void {
  server.registerTool(
    "add_thing_to_do",
    {
      title: "Add thing to do",
      description:
        "Adds a thing to do or see. With stopId it sits under that Stop; with date it is scheduled on that day; with neither it is a Wishlist idea.",
      inputSchema: { tripId: z.string(), ...itemCreateShape },
    },
    ({ tripId, ...rest }) => runTool("add_thing_to_do", () => createItem(tripId, rest)),
  );

  server.registerTool(
    "update_thing_to_do",
    {
      title: "Update thing to do",
      description: "Changes only the fields you pass; fields you omit keep their current value.",
      inputSchema: { itemId: z.string(), ...itemPatchShape },
    },
    ({ itemId, ...patch }) =>
      runTool("update_thing_to_do", async () => {
        const current = await loadItemForPatch(itemId);
        return updateItem(itemId, mergeItemPatch(current, patch));
      }),
  );

  server.registerTool(
    "delete_thing_to_do",
    {
      title: "Delete thing to do",
      description: "Permanently deletes a thing to do or see. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { itemId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ itemId }) => runTool("delete_thing_to_do", () => deleteItem(itemId)),
  );

  server.registerTool(
    "schedule_thing_to_do",
    {
      title: "Schedule thing to do",
      description:
        "Schedules a thing to do or see onto a date. A Wishlist idea is copied onto the date (the idea stays in the Wishlist); an already-placed thing to do is moved.",
      inputSchema: { itemId: z.string(), date: isoDate, startTime: hhmm.optional(), endTime: hhmm.optional() },
    },
    ({ itemId, date, startTime, endTime }) =>
      runTool("schedule_thing_to_do", () => scheduleItem(itemId, { date, startTime, endTime })),
  );

  server.registerTool(
    "unschedule_thing_to_do",
    {
      title: "Unschedule thing to do",
      description:
        "Removes a thing to do from its date. A placed Wishlist idea's placement is removed (the idea survives in the Wishlist); a directly-added thing to do just loses its date.",
      inputSchema: { itemId: z.string() },
    },
    ({ itemId }) => runTool("unschedule_thing_to_do", () => unscheduleItem(itemId)),
  );

  server.registerTool(
    "place_idea_at_stop",
    {
      title: "Place idea at stop",
      description: "Copies a Wishlist idea onto a Stop's things to do, with no date. The idea stays in the Wishlist.",
      inputSchema: { itemId: z.string(), stopId: z.string() },
    },
    ({ itemId, stopId }) => runTool("place_idea_at_stop", () => placeIdeaAtStop(itemId, stopId)),
  );

  server.registerTool(
    "add_marker_to_wishlist",
    {
      title: "Add marker to wishlist",
      description: "Copies a Globe Marker into the trip's Wishlist, the ideas not yet placed.",
      inputSchema: { markerId: z.string(), tripId: z.string() },
    },
    ({ markerId, tripId }) => runTool("add_marker_to_wishlist", () => addMarkerToWishlist(markerId, tripId)),
  );

  server.registerTool(
    "set_vote",
    {
      title: "Set vote",
      description: "Sets the acting Traveller's vote on a Wishlist idea.",
      inputSchema: { tripId: z.string(), itemId: z.string(), level: voteLevelSchema },
    },
    ({ tripId, itemId, level }) => runTool("set_vote", () => setVote(tripId, itemId, level)),
  );

  server.registerTool(
    "clear_vote",
    {
      title: "Clear vote",
      description: "Clears the acting Traveller's vote on a Wishlist idea.",
      inputSchema: { tripId: z.string(), itemId: z.string() },
    },
    ({ tripId, itemId }) => runTool("clear_vote", () => clearVote(tripId, itemId)),
  );

  server.registerTool(
    "set_day_title",
    {
      title: "Set day title",
      description: "Sets the Day title for one calendar day of a Stop's stay. An empty title clears it.",
      inputSchema: { stopId: z.string(), date: isoDate, title: z.string() },
    },
    ({ stopId, date, title }) => runTool("set_day_title", () => setDayTitle({ stopId, date, title })),
  );

  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description: "Adds a Note to a Trip, Stop, thing to do, or other trip entity.",
      inputSchema: { tripId: z.string(), targetType: targetTypeSchema, targetId: z.string(), body: z.string() },
    },
    ({ tripId, targetType, targetId, body }) => runTool("add_note", () => addNote(tripId, { targetType, targetId, body })),
  );

  server.registerTool(
    "add_chapter",
    {
      title: "Add chapter",
      description:
        "Adds a Chapter to group Stops together. Give both startDate and endDate for a dated Chapter, or neither for a rough one.",
      inputSchema: {
        tripId: z.string(),
        name: z.string().trim().min(1),
        colour: chapterColourSchema,
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
      },
    },
    ({ tripId, ...rest }) => runTool("add_chapter", () => createChapter(tripId, rest)),
  );

  server.registerTool(
    "update_chapter",
    {
      title: "Update chapter",
      description: "Changes only the fields you pass; fields you omit keep their current value.",
      inputSchema: {
        chapterId: z.string(),
        name: z.string().trim().min(1).optional(),
        colour: chapterColourSchema.optional(),
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
      },
    },
    ({ chapterId, ...patch }) =>
      runTool("update_chapter", async () => {
        const current = await loadChapterForPatch(chapterId);
        const merged = mergeChapterPatch(current, patch);
        if (isFailure(merged)) return merged;
        return updateChapter(chapterId, merged);
      }),
  );
}
