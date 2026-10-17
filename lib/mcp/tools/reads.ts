/**
 * Read-only tools for the Claude connection beyond `list_trips` (spec
 * 2026-10-09, Tasks 9 and 10; `list_costs`, `list_attachments` and
 * `get_attachment` added by the 2026-10-11 read pass): the trip plan,
 * Wishlist, Notes, Reminders, Checklists, Activity, Globe markers, place
 * search, Budget, Flags, Costs, and Attachments (listing them and reading
 * one's contents). The narrow reads (spec 2026-10-16 F7) re-check one thing
 * as get_trip_plan shows it: `get_stop`, `get_item`, `get_transport` and
 * `get_accommodation` are keyed by the row's own id (checked through its
 * `tripId`, real plan only); `get_day` reads one dated day as the Day view
 * assembles it.
 *
 * Every trip-scoped read starts with `requireTripAccess(tripId)` (directly,
 * or through a reused loader/action that itself starts with it), so a
 * non-member's trip id reads as `NOT_FOUND_TEXT`, same as a made-up one.
 * `get_attachment` is keyed by attachmentId instead, and checks access
 * through the Attachment's own `tripId`. Every plan query is scoped to the
 * real plan (`REAL_PLAN` / `forkId: null`) — this never accepts or passes a
 * `forkId`.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { requireGlobeAccess } from "@/lib/globe";
import { REAL_PLAN, WISHLIST_IDEA_WHERE } from "@/lib/plan-scope";
import { todayISO } from "@/lib/dates";
import { sortChecklist } from "@/lib/checklists";
import { listTemplates } from "@/server/actions/checklists";
import { listRemindersForTrip } from "@/lib/reminder-reads";
import { findPlaces } from "@/server/actions/places";
import { activityLine, viaLabel, type ActivityEntityType, type ActivityVerb } from "@/lib/activity";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";
import { loadTripPlanForMcp } from "../reads/trip-plan";
import { isoDate } from "@/lib/validations/primitives";
import { loadCostsForMcp } from "../reads/costs";
import { loadNotesForMcp } from "../reads/notes";
import { loadAttachmentIndexForMcp } from "../reads/attachments";
import { loadAttachmentContentForMcp } from "../reads/attachment-content";
import { loadAccommodationForMcp, loadItemForMcp, loadStopForMcp, loadTransportForMcp } from "../reads/entities";
import { loadDayForMcp } from "../reads/day";
import { CHECKLIST_VIEW_SELECT, toChecklistView, toMcpIdea, WISHLIST_IDEA_SELECT } from "../reads/lists";
import { loadBudget } from "@/lib/money/budget-loader";
import { loadFlags } from "@/lib/flags-loader";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { runTool, runToolContent } from "../run-tool";

// ---------------------------------------------------------------------------
// get_wishlist
// ---------------------------------------------------------------------------

async function loadWishlist(tripId: string) {
  await requireTripAccess(tripId);
  const items = await db.item.findMany({
    where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE },
    orderBy: { sortOrder: "asc" },
    select: WISHLIST_IDEA_SELECT,
  });
  return { ideas: items.map(toMcpIdea) };
}

// ---------------------------------------------------------------------------
// get_checklists
// ---------------------------------------------------------------------------

async function loadChecklists(tripId: string) {
  await requireTripAccess(tripId);
  const [rawItems, templates] = await Promise.all([
    db.checklistItem.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: CHECKLIST_VIEW_SELECT,
    }),
    listTemplates(),
  ]);

  const view = toChecklistView;

  return {
    pretrip: sortChecklist(rawItems.filter((i) => i.kind === "PRETRIP")).map(view),
    packing: sortChecklist(rawItems.filter((i) => i.kind === "PACKING")).map(view),
    shopping: sortChecklist(rawItems.filter((i) => i.kind === "SHOPPING")).map(view),
    templates,
  };
}

// ---------------------------------------------------------------------------
// get_activity
// ---------------------------------------------------------------------------

async function loadActivity(tripId: string, since: string | undefined, limit: number) {
  const { user } = await requireTripAccess(tripId);
  // Surprise (ADR 0051): Activity inside a Surprise hidden from the acting
  // Traveller stays in the database until it is revealed.
  const v = await loadSurpriseVisibility(tripId, user.id);
  const rows = await db.activity.findMany({
    where: { tripId, ...(since ? { createdAt: { gte: new Date(since) } } : {}), ...v.where.activity },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      verb: true,
      entityType: true,
      entityLabel: true,
      changes: true,
      source: true,
      createdAt: true,
      actor: { select: TRAVELLER_SELECT },
    },
  });
  return rows.map((r) => ({
    at: r.createdAt.toISOString(),
    who: travellerName(r.actor),
    what: activityLine({
      verb: r.verb as ActivityVerb,
      entityType: r.entityType as ActivityEntityType,
      entityLabel: r.entityLabel,
      changes: r.changes,
    }),
    via: viaLabel(r.source),
  }));
}

// ---------------------------------------------------------------------------
// get_budget
// ---------------------------------------------------------------------------

/**
 * `loadBudget`'s full `BudgetResult` trimmed for a Claude connection: drops
 * `byDay` and `byChapter` (large, UI-strip-shaped) to keep the payload small.
 */
async function loadBudgetForMcp(tripId: string) {
  const { user } = await requireTripAccess(tripId);
  const budget = await loadBudget(tripId, user.id);
  return {
    homeCurrency: budget.homeCurrency,
    grandTotal: budget.grandTotal,
    byCategory: budget.byCategory,
    byStop: budget.byStop,
    missingRates: budget.missingRates,
  };
}

// ---------------------------------------------------------------------------
// get_flags
// ---------------------------------------------------------------------------

/**
 * `loadFlags`'s `Flag[]` reshaped to the fields a Claude connection needs:
 * `title` is the flag's targetType (what kind of thing it's about — "stop",
 * "transport", "accommodation", "day", or "trip"); `detail` is its message.
 */
async function loadFlagsForMcp(tripId: string) {
  const { user } = await requireTripAccess(tripId);
  const flags = await loadFlags(tripId, user.id);
  return flags.map((f) => ({
    severity: f.severity,
    title: f.targetType.toLowerCase(),
    detail: f.message,
    stopId: f.stopId ?? null,
  }));
}

// ---------------------------------------------------------------------------
// list_globe_markers
// ---------------------------------------------------------------------------

async function loadGlobeMarkers() {
  const { globe } = await requireGlobeAccess();
  const markers = await db.marker.findMany({
    where: { globeId: globe.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      category: true,
      note: true,
      link: true,
      timing: true,
      city: true,
      country: true,
      countryCode: true,
    },
  });
  return {
    markers: markers.map((m) => ({
      id: m.id,
      name: m.title,
      category: m.category,
      town: m.city,
      countryCode: m.countryCode,
      when: m.timing,
      note: m.note,
      link: m.link,
    })),
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerReadTools(server: McpServer): void {
  server.registerTool(
    "get_trip_plan",
    {
      title: "Get trip plan",
      description:
        "Reads the trip's real plan: Stops in order with their nights and dates, Accommodation, Transport, Day titles, things to do or see, and Chapters, each day's things naming their owningStop: on a Changeover day (one day two Stops share) a thing is listed under both Stops but is owned by, and costed against, that one Stop. Each thing's openingHours (same shape as set_opening_hours) is null when not known. Transport with departure/arrival places and local times (each end in its own zone; a Home end is read in the trip's Home timezone, homeTimezone, when it's set), each Stop's timezone, and the trip's Travellers. A dated thing to do or see that falls on no Stop's days is listed in unplacedDatedItems. Each thing lists its files by title. Read one with get_attachment, or see them all with list_attachments. To re-check one thing, use get_stop, get_item, get_transport, get_accommodation or get_day instead of reading the whole plan again.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_trip_plan", () => loadTripPlanForMcp(tripId)),
  );

  server.registerTool(
    "get_stop",
    {
      title: "Get stop",
      description:
        "Reads one Stop of the real plan exactly as get_trip_plan shows it: nights or dates, timezone, Pinned, Chapter, its Accommodation, its things to do, and each of its days with the Day title and the things to do scheduled on it. Each day's things name their owningStop, which on a Changeover day may be the neighbouring Stop. Use it to re-check one Stop instead of reading the whole trip.",
      inputSchema: { stopId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ stopId }) => runTool("get_stop", () => loadStopForMcp(stopId)),
  );

  server.registerTool(
    "get_item",
    {
      title: "Get thing to do",
      description:
        "Reads one thing to do or see exactly as get_trip_plan shows it, with its date and Stop, its Costs (as list_costs shows them), its files, its openingHours (same shape as set_opening_hours; null when not known), and notesOnItem: the Notes the Travellers left on it. Its own notes field is different. That is the Item's description, part of the Item, changed with update_thing_to_do. A Note is a separate comment, added with add_note and removed with delete_note.",
      inputSchema: { itemId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ itemId }) => runTool("get_item", () => loadItemForMcp(itemId)),
  );

  server.registerTool(
    "get_transport",
    {
      title: "Get transport",
      description:
        "Reads one Transport leg exactly as get_trip_plan shows it (each end with its local time and zone, a Home end in the trip's Home timezone), with its Costs.",
      inputSchema: { transportId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ transportId }) => runTool("get_transport", () => loadTransportForMcp(transportId)),
  );

  server.registerTool(
    "get_accommodation",
    {
      title: "Get accommodation",
      description: "Reads one Accommodation exactly as get_trip_plan shows it, with the Stop it belongs to and its Costs.",
      inputSchema: { accommodationId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ accommodationId }) => runTool("get_accommodation", () => loadAccommodationForMcp(accommodationId)),
  );

  server.registerTool(
    "get_day",
    {
      title: "Get day",
      description:
        "Reads one day of the trip as the Day view shows it: the day's Stop (the arriving one on a Changeover day), the Day title, tonight's Accommodation, and the timeline in order; each thing names its owningStop, which on a Changeover day can be the departing Stop, and its openingHours (same shape as set_opening_hours). The timeline holds departures and arrivals, check-out and check-in, and timed things to do; then come the untimed things to do (anytime). date is YYYY-MM-DD within the trip's dates.",
      inputSchema: { tripId: z.string(), date: isoDate },
      annotations: { readOnlyHint: true },
    },
    ({ tripId, date }) => runTool("get_day", () => loadDayForMcp(tripId, date)),
  );

  server.registerTool(
    "get_wishlist",
    {
      title: "Get wishlist",
      description: "Reads the trip's Wishlist: ideas not yet placed, with their Votes.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_wishlist", () => loadWishlist(tripId)),
  );

  server.registerTool(
    "get_notes",
    {
      title: "Get notes",
      description:
        "Reads the Notes on this trip: comments the Travellers left on the Trip, its Stops, things to do, Transport and Accommodation, each with its id, what it is on (targetType, targetId), who wrote it and when. A Note is never edited: remove one with delete_note and add it again with add_note. A thing to do's own notes (its description) are not Notes. They are read with get_item or get_trip_plan and changed with update_thing_to_do.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_notes", () => loadNotesForMcp(tripId)),
  );

  server.registerTool(
    "get_reminders",
    {
      title: "Get reminders",
      description:
        "Reads this trip's Reminders dated on or after a date (today by default), soonest first. Each carries its notes and what it is about: stopId/stopName, itemId/itemTitle or transportId/transportLabel (all null when it is about the Trip as a whole).",
      inputSchema: { tripId: z.string(), fromDate: isoDate.optional() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId, fromDate }) => runTool("get_reminders", () => listRemindersForTrip(tripId, fromDate ?? todayISO())),
  );

  server.registerTool(
    "get_checklists",
    {
      title: "Get checklists",
      description: "Reads the trip's pre-trip, packing, and shopping checklists, plus the Traveller's saved packing templates.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_checklists", () => loadChecklists(tripId)),
  );

  server.registerTool(
    "get_activity",
    {
      title: "Get activity",
      description: "Reads this trip's recent Activity, newest first.",
      inputSchema: {
        tripId: z.string(),
        since: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ tripId, since, limit }) => runTool("get_activity", () => loadActivity(tripId, since, limit ?? 50)),
  );

  server.registerTool(
    "get_budget",
    {
      title: "Get budget",
      description: "Reads the trip's budget roll-up in its home currency: grand total, by category, by stop, and currencies missing an exchange rate.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_budget", () => loadBudgetForMcp(tripId)),
  );

  server.registerTool(
    "get_flags",
    {
      title: "Get flags",
      description: "Reads the trip's health flags: things worth a second look, such as a stop with no accommodation booked or a packed day.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_flags", () => loadFlagsForMcp(tripId)),
  );

  server.registerTool(
    "list_costs",
    {
      title: "List costs",
      description:
        "Lists the trip's individual Costs on the real plan: amount in its own currency and in the home currency (null when no exchange rate is known), paid or unpaid with due date, Before you go or On the trip, and what it belongs to. unpaidOnly keeps unpaid Costs; dueWithinDays keeps unpaid Costs due within that many days (overdue included). Soonest due first.",
      inputSchema: {
        tripId: z.string(),
        unpaidOnly: z.boolean().optional(),
        dueWithinDays: z.number().int().min(0).max(366).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ tripId, unpaidOnly, dueWithinDays }) => runTool("list_costs", () => loadCostsForMcp(tripId, { unpaidOnly, dueWithinDays })),
  );

  server.registerTool(
    "list_attachments",
    {
      title: "List attachments",
      description:
        "Lists the trip's files (tickets, confirmations, screenshots) on the real plan: title, type, size, who uploaded it, and what it's attached to: the trip itself, a Stop, Transport, Accommodation or thing to do. Read one with get_attachment.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("list_attachments", () => loadAttachmentIndexForMcp(tripId)),
  );

  server.registerTool(
    "get_attachment",
    {
      title: "Get attachment",
      description:
        "Reads one file from list_attachments or a plan item's files. Images come back as images (up to 3 MB); PDFs come back as their text (up to 10 MB; a scanned PDF with no text layer says so). Other file types can't be read here.",
      inputSchema: { attachmentId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ attachmentId }) => runToolContent("get_attachment", () => loadAttachmentContentForMcp(attachmentId)),
  );

  server.registerTool(
    "list_globe_markers",
    {
      title: "List globe markers",
      description: "Lists the Traveller's Globe markers.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => runTool("list_globe_markers", () => loadGlobeMarkers()),
  );

  server.registerTool(
    "search_places",
    {
      title: "Search places",
      description: "Use before adding a Stop or Item to get coordinates and a country code.",
      inputSchema: { query: z.string().min(2) },
      annotations: { readOnlyHint: true },
    },
    ({ query }) => runTool("search_places", () => findPlaces(query)),
  );
}
