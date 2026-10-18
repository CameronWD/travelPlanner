/**
 * Write tools for Items, Wishlist, Votes, Day titles, Notes and Chapters
 * (spec 2026-10-09, Task 12): adding/updating/deleting a thing to do or
 * Wishlist idea, scheduling/unscheduling/placing it, pulling a Globe Marker
 * into the Wishlist, voting, Day titles, Notes, and the Chapter lifecycle
 * minus delete/reorder (covered elsewhere).
 *
 * `set_opening_hours` (CONTEXT.md Opening hours, shared by an idea and its
 * placed copies) sets or clears a thing's opening hours.
 *
 * `set_try_list` replaces a thing's Try list and `tick_try_entry` ticks one
 * entry (CONTEXT.md Try list, shared by an idea and its placed copies).
 *
 * Every write delegates to the same server actions the app itself uses
 * (`server/actions/items`, `votes`, `day-titles`, `notes`, `chapters`), which
 * already resolve to the acting Traveller inside a Claude connection (via
 * `requireUser`/`requireTripAccess`) and record Activity marked "via Claude".
 * Real plan only: none of `createItem`/`scheduleItem`/`placeIdeaAtStop`/
 * `createChapter`'s optional `forkId` is ever supplied (constraints.md), and
 * every Item/Stop/Chapter id a tool takes is checked against the real plan
 * first (`../real-plan.ts`), since the actions look rows up by id alone and
 * would act on a Fork's row.
 *
 * `update_thing_to_do` and `update_chapter` pass only the fields the caller
 * supplied: the actions take a PATCH (ADR 0075) and merge onto the row they
 * hold — `hiddenFromShares` included, which an earlier replace-shaped
 * `updateItem` reset.
 *
 * Notes: add (returns the Note) and delete; never edited (CONTEXT.md Note).
 *
 * Every write goes through `runWrite` and returns its row as it now stands
 * (spec 2026-10-16 F6): `{ item }` (get_item's shape; a schedule or place
 * returns the placed copy), `{ idea }`, `{ chapter }`, `{ note }`,
 * `{ itemId, votes }` for a Vote, `{ stopId, day }` for a Day title, and
 * `{ deleted }` for a delete (with `ideaId` when an unschedule removed a
 * placed copy).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  placeIdeaAtStop,
  addMarkerToWishlist,
  setOpeningHours,
  setTryList,
  tickTryEntry,
} from "@/server/actions/items";
import { openingHoursSchema } from "@/lib/validations/opening-hours";
import { tryListInputSchema } from "@/lib/validations/try-list";
import { setVote, clearVote } from "@/server/actions/votes";
import { setDayTitle } from "@/server/actions/day-titles";
import { addNote, deleteNote } from "@/server/actions/notes";
import { createChapter, updateChapter } from "@/server/actions/chapters";
import { categorySchema } from "@/lib/validations/category";
import { voteLevelSchema, targetTypeSchema } from "@/lib/enums";
import { CHAPTER_COLOUR_VALUES } from "@/lib/chapter-colours";
import { CATEGORY_VALUES } from "@/lib/categories";
import { VOTE_LEVELS } from "@/lib/enum-values";
import { runWrite } from "../run-tool";
import { loadItemForMcp, loadStopForMcp, loadChapterForMcp } from "../reads/entities";
import { loadWishlistIdeaForMcp, loadVotesForMcp } from "../reads/lists";
import { loadNoteForMcp } from "../reads/notes";
import { requireRealPlanRow, requireRealPlanRows } from "../real-plan";
import { CATEGORY_MEANING, VOTE_LEVEL_MEANING, REFUNDABLE_MEANING, REFUNDABLE_VALUES, describeValues, type RefundableLabel } from "../vocab";
import { isoDate, hhmm } from "@/lib/validations/primitives";
import { arriveByMinutesSchema } from "@/lib/validations/planning";
import { bookingCreateShape, bookingPatchFrom, bookingPatchShape } from "../booking-state-fields";

const chapterColourSchema = z.enum(CHAPTER_COLOUR_VALUES);
const describedCategory = categorySchema.describe(describeValues("The thing's Category.", CATEGORY_MEANING, CATEGORY_VALUES));
const describedVoteLevel = voteLevelSchema.describe(describeValues("How keen you are.", VOTE_LEVEL_MEANING, VOTE_LEVELS));

// ---------------------------------------------------------------------------
// add_thing_to_do / update_thing_to_do shared field shapes
// ---------------------------------------------------------------------------

const ITEM_NOTES_DESCRIPTION =
  "The Item's own notes: its description, part of the Item, edited here. Not a Note: a Note is a comment a Traveller leaves on it, added with add_note.";

/**
 * CONTEXT.md "Slot time" (R3): the ticket's own time, separate from startTime
 * (the Traveller's plan).
 */
const SLOT_TIME_DESCRIPTION =
  "The ticket's time, HH:MM in the Stop's local time: the 12:00 tour, the 19:30 sitting. Not the start time. startTime is when the Travellers plan to be there. With a date and no startTime, the start is set to slotTime less arriveByMinutes.";
const ARRIVE_BY_DESCRIPTION = "How many minutes before the slot to be there, as the ticket asks. 15 means be there 15 minutes early.";

/**
 * Section S stores refundable as a plain true/false/not-known column, not an
 * enum, but reads (get_item/get_trip_plan/get_day) and writes speak the same
 * YES/NO/UNKNOWN vocabulary, so the tool field matches the read shape; the
 * handler maps it to true/false/null before calling createItem/updateItem
 * (never a zod `.transform`, so the mapping stays visible and testable here).
 */
const describedRefundable = z
  .enum(REFUNDABLE_VALUES)
  .describe(describeValues("Whether the ticket can be refunded.", REFUNDABLE_MEANING, REFUNDABLE_VALUES));

/** YES/NO/UNKNOWN → true/false/null; omitted (undefined) stays omitted. */
function refundableFromMcp(v: RefundableLabel | undefined): boolean | null | undefined {
  if (v === undefined) return undefined;
  return v === "YES" ? true : v === "NO" ? false : null;
}

/** add_thing_to_do: title and category are required. */
const itemCreateShape = {
  title: z.string().trim().min(1),
  category: describedCategory,
  stopId: z.string().optional(),
  date: isoDate.optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  address: z.string().optional(),
  link: z.string().optional(),
  booking: z.string().optional(),
  notes: z.string().optional().describe(ITEM_NOTES_DESCRIPTION),
  slotTime: hhmm.optional().describe(SLOT_TIME_DESCRIPTION),
  arriveByMinutes: arriveByMinutesSchema.optional().describe(ARRIVE_BY_DESCRIPTION),
  refundable: describedRefundable.optional(),
  ...bookingCreateShape,
};

/** update_thing_to_do: every field optional — a patch merges onto the current row. */
const itemPatchShape = {
  title: z.string().trim().min(1).optional(),
  category: describedCategory.optional(),
  stopId: z.string().optional(),
  date: isoDate.optional(),
  startTime: hhmm.nullable().optional().describe("Clear it (null) to let a slot time, if set, default it again."),
  endTime: hhmm.optional(),
  address: z.string().optional(),
  link: z.string().optional(),
  booking: z.string().optional(),
  notes: z.string().optional().describe(ITEM_NOTES_DESCRIPTION),
  slotTime: hhmm.nullable().optional().describe(`${SLOT_TIME_DESCRIPTION} null clears it.`),
  arriveByMinutes: arriveByMinutesSchema.nullable().optional().describe(`${ARRIVE_BY_DESCRIPTION} null clears it.`),
  // Not nullable: UNKNOWN (mapped to null in the handler) is how a patch clears it, back to not known.
  refundable: describedRefundable.optional(),
  ...bookingPatchShape,
};

export function registerPlanWriteTools(server: McpServer): void {
  server.registerTool(
    "add_thing_to_do",
    {
      title: "Add thing to do",
      description:
        "Adds a thing to do or see. With stopId it sits under that Stop; with date it is scheduled on that day; with neither it is a Wishlist idea, one of the ideas not yet placed. When you give a date, pass stopId too (the Stop whose stay covers that day) so it files under that Stop. Location comes from address, not from lat/lng.",
      inputSchema: { tripId: z.string(), ...itemCreateShape },
    },
    ({ tripId, refundable, ...rest }) =>
      runWrite(
        "add_thing_to_do",
        async () => {
          await requireRealPlanRows([["stop", rest.stopId]]);
          // UNKNOWN maps to null, but there's nothing to clear on a create: that's
          // just not setting it, same as omitting the field (?? undefined).
          return createItem(tripId, { ...rest, refundable: refundableFromMcp(refundable) ?? undefined });
        },
        async (done) => ({ item: await loadItemForMcp(done.id) }),
      ),
  );

  server.registerTool(
    "update_thing_to_do",
    {
      title: "Update thing to do",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. Location comes from address, not from lat/lng. " +
        "notes is the Item's own notes, its description, and is edited here. That is not a Note: a Note is a separate comment a Traveller left on the Item (see get_item's notesOnItem or get_notes). A Note is never edited. Remove it with delete_note and, if it still needs saying, add it again with add_note. " +
        "A null slotTime or arriveByMinutes clears it; an arrive-by margin with no slot is refused. To clear the slot, pass null for both slotTime and arriveByMinutes. " +
        "A null startTime clears it too, letting a slot (if set) default it again. Moving the slot never moves a start time that is already set.",
      inputSchema: { itemId: z.string(), ...itemPatchShape },
    },
    ({ itemId, refundable, ...patch }) =>
      runWrite(
        "update_thing_to_do",
        async () => {
          await requireRealPlanRows([
            ["item", itemId],
            ["stop", patch.stopId],
          ]);
          return updateItem(itemId, bookingPatchFrom({ ...patch, refundable: refundableFromMcp(refundable) }));
        },
        async () => ({ item: await loadItemForMcp(itemId) }),
      ),
  );

  server.registerTool(
    "set_opening_hours",
    {
      title: "Set opening hours",
      description:
        "Sets when the place a thing to do is about lets you in, read in its Stop's local time, replacing any hours it had. " +
        "week has keys sun to sat: leaving one out means not known, [] means closed that day, otherwise one or two [open, close] spans as HH:mm (close may be 24:00 for midnight). " +
        "seasons are recurring date ranges (from, to as MM-DD, inclusive; wraps the year end when from is after to) whose own week replaces the usual one for dates it covers. " +
        "closed lists dates the place is shut: YYYY-MM-DD for that one day, or MM-DD for that day every year. " +
        "The hours belong to the place, so the Wishlist idea and every copy placed from it get them too. " +
        "Pass source for the page you read them on; it overrides hours.source. Pass hours: null to clear them. Only set hours you have checked.",
      inputSchema: {
        itemId: z.string(),
        hours: openingHoursSchema.nullable(),
        source: openingHoursSchema.shape.source.describe("The page the hours came from; overrides hours.source."),
      },
    },
    ({ itemId, hours, source }) =>
      runWrite(
        "set_opening_hours",
        async () => {
          await requireRealPlanRow("item", itemId);
          return setOpeningHours(itemId, hours ? { ...hours, ...(source && { source }) } : null);
        },
        async () => ({ item: await loadItemForMcp(itemId) }),
      ),
  );

  server.registerTool(
    "set_try_list",
    {
      title: "Set Try list",
      description:
        "Replaces a thing to do's Try list: the small list of things to try, see or buy while there (\"Drei im Weggla, Feuerzangenbowle, Lebkuchen\"). " +
        "Pass every entry to keep, in order; an entry left out is removed. " +
        "Give an entry its id (from get_item's tryList) to keep it and its tick; leave id out for a new entry. " +
        "tried sets the tick; left out, an existing entry keeps its tick and a new one starts untried. " +
        "Up to 30 entries, each 1 to 80 characters. Pass entries: [] to clear the list. " +
        "The list belongs to the place, so the Wishlist idea and every copy placed from it get it too. It is not a Checklist.",
      inputSchema: {
        itemId: z.string(),
        entries: tryListInputSchema.describe("The whole list, in order: { id?, text, tried? } each."),
      },
    },
    ({ itemId, entries }) =>
      runWrite(
        "set_try_list",
        async () => {
          await requireRealPlanRow("item", itemId);
          return setTryList(itemId, entries);
        },
        async () => ({ item: await loadItemForMcp(itemId) }),
      ),
  );

  server.registerTool(
    "tick_try_entry",
    {
      title: "Tick Try list entry",
      description:
        "Ticks one entry of a thing to do's Try list as tried, by the entry's id from get_item's tryList; tried: false unticks it. " +
        "Everyone on the trip sees the tick, on the thing and on every copy of it.",
      inputSchema: {
        itemId: z.string(),
        entryId: z.string(),
        tried: z.boolean().optional().describe("true (the default) ticks it; false unticks it."),
      },
    },
    ({ itemId, entryId, tried }) =>
      runWrite(
        "tick_try_entry",
        async () => {
          await requireRealPlanRow("item", itemId);
          return tickTryEntry(itemId, entryId, tried ?? true);
        },
        async () => ({ item: await loadItemForMcp(itemId) }),
      ),
  );

  server.registerTool(
    "delete_thing_to_do",
    {
      title: "Delete thing to do",
      description: "Permanently deletes a thing to do or see. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { itemId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ itemId }) =>
      runWrite(
        "delete_thing_to_do",
        async () => {
          await requireRealPlanRow("item", itemId);
          return deleteItem(itemId);
        },
        async () => ({ deleted: itemId }),
      ),
  );

  server.registerTool(
    "schedule_thing_to_do",
    {
      title: "Schedule thing to do",
      description:
        "Schedules a thing to do or see onto a date. A Wishlist idea is copied onto the date (the idea stays in the Wishlist); an already-placed thing to do is moved. " +
        "With no startTime, a slot time (given here or already on the thing) sets the start to the slot less arriveByMinutes.",
      inputSchema: {
        itemId: z.string(), date: isoDate, startTime: hhmm.optional(), endTime: hhmm.optional(),
        slotTime: hhmm.optional().describe(SLOT_TIME_DESCRIPTION),
        arriveByMinutes: arriveByMinutesSchema.optional().describe(ARRIVE_BY_DESCRIPTION),
      },
    },
    ({ itemId, date, startTime, endTime, slotTime, arriveByMinutes }) =>
      runWrite(
        "schedule_thing_to_do",
        async () => {
          await requireRealPlanRow("item", itemId);
          return scheduleItem(itemId, { date, startTime, endTime, slotTime, arriveByMinutes });
        },
        async (done) => ({ item: await loadItemForMcp(done.placedItemId ?? itemId) }),
      ),
  );

  server.registerTool(
    "unschedule_thing_to_do",
    {
      title: "Unschedule thing to do",
      description:
        "Removes a thing to do from its date. A placed Wishlist idea's placement is removed (the idea survives in the Wishlist); a directly-added thing to do just loses its date.",
      inputSchema: { itemId: z.string() },
    },
    ({ itemId }) =>
      runWrite(
        "unschedule_thing_to_do",
        async () => {
          await requireRealPlanRow("item", itemId);
          return unscheduleItem(itemId);
        },
        async (done) =>
          done.mode === "placement-removed"
            ? { deleted: itemId, ideaId: done.sourceItemId ?? null }
            : { item: await loadItemForMcp(itemId) },
      ),
  );

  server.registerTool(
    "place_idea_at_stop",
    {
      title: "Place idea at stop",
      description: "Copies a Wishlist idea onto a Stop's things to do, with no date. The idea stays in the Wishlist.",
      inputSchema: { itemId: z.string(), stopId: z.string() },
    },
    ({ itemId, stopId }) =>
      runWrite(
        "place_idea_at_stop",
        async () => {
          await requireRealPlanRows([
            ["item", itemId],
            ["stop", stopId],
          ]);
          return placeIdeaAtStop(itemId, stopId);
        },
        async (done) => ({ item: await loadItemForMcp(done.placedItemId ?? itemId) }),
      ),
  );

  server.registerTool(
    "add_marker_to_wishlist",
    {
      title: "Add marker to wishlist",
      description: "Copies a Globe Marker into the trip's Wishlist, the ideas not yet placed.",
      inputSchema: { markerId: z.string(), tripId: z.string() },
    },
    ({ markerId, tripId }) =>
      runWrite(
        "add_marker_to_wishlist",
        () => addMarkerToWishlist(markerId, tripId),
        async (done) => ({ idea: await loadWishlistIdeaForMcp(done.id) }),
      ),
  );

  server.registerTool(
    "set_vote",
    {
      title: "Set vote",
      description: "Sets the acting Traveller's vote on a Wishlist idea.",
      inputSchema: { tripId: z.string(), itemId: z.string(), level: describedVoteLevel },
    },
    ({ tripId, itemId, level }) =>
      runWrite(
        "set_vote",
        async () => {
          await requireRealPlanRow("item", itemId);
          return setVote(tripId, itemId, level);
        },
        () => loadVotesForMcp(itemId),
      ),
  );

  server.registerTool(
    "clear_vote",
    {
      title: "Clear vote",
      description: "Clears the acting Traveller's vote on a Wishlist idea.",
      inputSchema: { tripId: z.string(), itemId: z.string() },
    },
    ({ tripId, itemId }) =>
      runWrite(
        "clear_vote",
        async () => {
          await requireRealPlanRow("item", itemId);
          return clearVote(tripId, itemId);
        },
        () => loadVotesForMcp(itemId),
      ),
  );

  server.registerTool(
    "set_day_title",
    {
      title: "Set day title",
      description: "Sets the Day title for one calendar day of a Stop's stay. An empty title clears it.",
      inputSchema: { stopId: z.string(), date: isoDate, title: z.string() },
    },
    ({ stopId, date, title }) =>
      runWrite(
        "set_day_title",
        async () => {
          await requireRealPlanRow("stop", stopId);
          return setDayTitle({ stopId, date, title });
        },
        async () => ({ stopId, day: (await loadStopForMcp(stopId)).days.find((d) => d.date === date) ?? null }),
      ),
  );

  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description:
        "Adds a Note: a short comment to the other Traveller on the Trip, a Stop, a thing to do, a Transport leg or an Accommodation. A Note is said, not drafted. It is never edited. To change one, delete it with delete_note and add it again. Returns the new Note with its id. Not for changing what a thing to do says about itself: that is the Item's own notes, its description, edited with update_thing_to_do.",
      inputSchema: { tripId: z.string(), targetType: targetTypeSchema, targetId: z.string(), body: z.string() },
    },
    ({ tripId, targetType, targetId, body }) =>
      runWrite(
        "add_note",
        () => addNote(tripId, { targetType, targetId, body }),
        async (done) => ({ note: await loadNoteForMcp(done.id) }),
      ),
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description:
        "Permanently deletes a Note (a comment between the Travellers, from get_notes or get_item's notesOnItem). Any Traveller on the Trip may delete any Note. A Note is never edited: to correct one, delete it and add the corrected one with add_note. An Item's own notes are its description, edited with update_thing_to_do, not deleted here. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { noteId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ noteId }) => runWrite("delete_note", () => deleteNote(noteId), async () => ({ deleted: noteId })),
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
    ({ tripId, ...rest }) =>
      runWrite(
        "add_chapter",
        () => createChapter(tripId, rest),
        async (done) => ({ chapter: await loadChapterForMcp(done.id) }),
      ),
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
      runWrite(
        "update_chapter",
        async () => {
          await requireRealPlanRow("chapter", chapterId);
          return updateChapter(chapterId, patch);
        },
        async () => ({ chapter: await loadChapterForMcp(chapterId) }),
      ),
  );
}
