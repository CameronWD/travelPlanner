/**
 * `get_trip_plan`'s loader (spec 2026-10-09, Task 9). Mirrors the Plan
 * editor's queries (`app/(app)/trips/[tripId]/plan/page.tsx`), trimmed to
 * what a Claude connection needs to read and reason about the Plan — no
 * Costs, no Attachment contents, no edit-time bookkeeping. Transport
 * endpoints carry each end's local time and zone (spec 2026-10-11 Task 1),
 * computed the same way the Plan editor shows them (`transportTimeDisplay`),
 * the file lists the trip's Travellers, and the trip, each Stop,
 * Accommodation, Transport, thing to do and day item carries its Attachments
 * by title (`loadTripAttachments`, Task 3) — titles only, not contents; read
 * one with `get_attachment`. Real plan only: every query is scoped with
 * `REAL_PLAN`, never `resolvePlan`, and this never accepts a `forkId`.
 *
 * Surprise (CONTEXT.md, ADR 0051): the connection acts as a Traveller, so it
 * reads what that Traveller sees. A Surprise Stop hidden from them keeps its
 * shell (name, dates, nights, Transport) with nothing inside it; a hidden
 * Surprise Item shows as a "Surprise" placeholder on its date and time. Every
 * Surprise, hidden or not, carries `surprise` so Claude knows what it is.
 */
import { requireTripAccess } from "@/lib/guards";
import { db } from "@/lib/db";
import { REAL_PLAN, THINGS_TO_DO_WHERE } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { loadDayTitles } from "@/lib/day-titles-loader";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";
import { loadSurpriseVisibility, maskSurpriseStops } from "@/lib/surprise-visibility";
import { loadTripAttachments } from "./attachments";
import { ownerKey } from "./owners";
import {
  buildMcpStops,
  MCP_CHAPTER_SELECT,
  MCP_DATED_ITEM_SELECT,
  MCP_THING_TO_DO_SELECT,
  MCP_TRANSPORT_SELECT,
  MCP_TRIP_SELECT,
  mcpStopSelect,
  toMcpItem,
  toMcpTransport,
  toMcpTrip,
  withPlaceholders,
  type FilesFor,
  type McpChapter,
  type McpStop,
  type McpTransport,
  type McpTripSummary,
  type McpUnplacedDatedItem,
} from "./plan-shapes";

/** A Trip's Traveller, named and never carrying an email. */
interface McpTraveller {
  /** The Traveller's id, e.g. for `set_surprise`'s `forUserIds`. */
  id: string;
  name: string;
  role: "owner" | "traveller";
  /** True for the Traveller making this Claude connection's request. */
  you: boolean;
}

export interface McpTripPlan {
  trip: McpTripSummary;
  stops: McpStop[];
  transports: McpTransport[];
  chapters: McpChapter[];
  /** Dated things to do that fall on no Stop's days, soonest first. */
  unplacedDatedItems: McpUnplacedDatedItem[];
  travellers: McpTraveller[];
}

export async function loadTripPlanForMcp(tripId: string): Promise<McpTripPlan> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);

  const [trip, stopsRaw, transportsRaw, chaptersRaw, thingsToDoItems, scheduledItems, members, { byOwner }] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: MCP_TRIP_SELECT }),
    db.stop.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: { sortOrder: "asc" }, select: mcpStopSelect(v.where.accommodation) }),
    db.transport.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: { sortOrder: "asc" }, select: MCP_TRANSPORT_SELECT }),
    db.chapter.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }], select: MCP_CHAPTER_SELECT }),
    db.item.findMany({ where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, ...v.where.item }, orderBy: { sortOrder: "asc" }, select: MCP_THING_TO_DO_SELECT }),
    // No stopId filter: a dated Item with no Stop is still on the plan (ADR 0049).
    db.item.findMany({ where: { tripId, ...REAL_PLAN, date: { not: null }, ...v.where.item }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }], select: MCP_DATED_ITEM_SELECT }),
    db.tripMember.findMany({ where: { tripId }, orderBy: { createdAt: "asc" }, select: { role: true, user: { select: TRAVELLER_SELECT } } }),
    loadTripAttachments(tripId, v),
  ]);

  const filesFor: FilesFor = (kind, id) => byOwner.get(ownerKey(kind, id)) ?? [];
  const stops = maskSurpriseStops(orderPlanStops(stopsRaw), v, v.views.stops);
  const hiddenStopIds = new Set(v.hiddenStopIds);
  const openStops = stops.filter((s) => !hiddenStopIds.has(s.id));
  const datedItems = withPlaceholders(scheduledItems, v);
  const dayTitles = await loadDayTitles(openStops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })));

  const built = buildMcpStops({
    stops, thingsToDo: thingsToDoItems, datedItems, dayTitles, hiddenStopIds,
    itemView: (id) => v.views.items.get(id) ?? null, filesFor,
  });

  const stopNameById = new Map(stops.map((s) => [s.id, s.name]));
  const tzById = new Map(stops.map((s) => [s.id, s.timezone]));
  const homeTimezone = trip?.homeTimezone ?? null;

  return {
    trip: toMcpTrip(tripId, trip, byOwner.get(ownerKey("TRIP", tripId)) ?? []),
    stops: built.stops,
    transports: transportsRaw.map((t) => toMcpTransport(t, { stopNameById, tzById, homeTimezone, filesFor })),
    chapters: chaptersRaw,
    unplacedDatedItems: datedItems
      .filter((i) => !built.coveredItemIds.has(i.id))
      .map((i) => ({ ...toMcpItem(i, filesFor), date: i.date as string })),
    travellers: members.map((m) => ({
      id: m.user.id,
      name: travellerName(m.user),
      role: m.role === "owner" ? "owner" : "traveller",
      you: m.user.id === user.id,
    })),
  };
}
