/**
 * Read-only tools for the Claude connection beyond `list_trips` (spec
 * 2026-10-09, Tasks 9 and 10): the trip plan, Wishlist, Notes, Reminders,
 * Checklists, Activity, Globe markers, place search, Budget, and Flags.
 *
 * Every trip-scoped read starts with `requireTripAccess(tripId)` (directly,
 * or through a reused loader/action that itself starts with it), so a
 * non-member's trip id reads as `NOT_FOUND_TEXT`, same as a made-up one.
 * Every plan query is scoped to the real plan (`REAL_PLAN` / `forkId: null`)
 * — this never accepts or passes a `forkId`.
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
import { listRemindersForTrip } from "@/server/actions/reminders";
import { findPlaces } from "@/server/actions/places";
import { headline, viaLabel, type ActivityEntityType, type ActivityVerb } from "@/lib/activity";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";
import { loadTripPlanForMcp } from "../reads/trip-plan";
import { loadBudget } from "@/lib/budget-loader";
import { loadFlags } from "@/lib/flags-loader";
import { runTool } from "../run-tool";

// ---------------------------------------------------------------------------
// get_wishlist
// ---------------------------------------------------------------------------

async function loadWishlist(tripId: string) {
  await requireTripAccess(tripId);
  const items = await db.item.findMany({
    where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      category: true,
      notes: true,
      link: true,
      votes: { select: { level: true, user: { select: TRAVELLER_SELECT } } },
    },
  });
  return {
    ideas: items.map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      notes: i.notes,
      link: i.link,
      votes: i.votes.map((v) => ({ traveller: travellerName(v.user), level: v.level })),
    })),
  };
}

// ---------------------------------------------------------------------------
// get_notes
// ---------------------------------------------------------------------------

async function loadNotes(tripId: string) {
  await requireTripAccess(tripId);
  const notes = await db.note.findMany({
    where: { tripId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      body: true,
      createdAt: true,
      author: { select: TRAVELLER_SELECT },
    },
  });
  return {
    notes: notes.map((n) => ({
      id: n.id,
      targetType: n.targetType,
      targetId: n.targetId,
      body: n.body,
      author: travellerName(n.author),
      createdAt: n.createdAt.toISOString(),
    })),
  };
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
      select: { id: true, kind: true, text: true, done: true, dueDate: true, sortOrder: true, buy: true },
    }),
    listTemplates(),
  ]);

  const view = (i: (typeof rawItems)[number]) => ({ id: i.id, text: i.text, done: i.done, dueDate: i.dueDate, buyState: i.buy });

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
  await requireTripAccess(tripId);
  const rows = await db.activity.findMany({
    where: { tripId, ...(since ? { createdAt: { gte: new Date(since) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      verb: true,
      entityType: true,
      entityLabel: true,
      source: true,
      createdAt: true,
      actor: { select: TRAVELLER_SELECT },
    },
  });
  return rows.map((r) => ({
    at: r.createdAt.toISOString(),
    who: travellerName(r.actor),
    what: headline({
      verb: r.verb as ActivityVerb,
      entityType: r.entityType as ActivityEntityType,
      entityLabel: r.entityLabel,
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
  const budget = await loadBudget(tripId);
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
  const flags = await loadFlags(tripId);
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
        "Reads the trip's real plan: Stops in order with their nights and dates, Accommodation, Transport, Day titles, things to do or see, and Chapters.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_trip_plan", () => loadTripPlanForMcp(tripId)),
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
      description: "Reads notes left on this trip's Stops, Transport, Accommodation, and Items.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("get_notes", () => loadNotes(tripId)),
  );

  server.registerTool(
    "get_reminders",
    {
      title: "Get reminders",
      description: "Reads this trip's Reminders dated on or after a date (today by default), soonest first.",
      inputSchema: { tripId: z.string(), fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
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
