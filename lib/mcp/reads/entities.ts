/**
 * The Claude connection's narrow reads (spec 2026-10-16 F7): one Stop, thing
 * to do, Transport leg, Accommodation, Chapter or the Trip itself, each
 * exactly that entity's slice of get_trip_plan (built from the same
 * ./plan-shapes.ts functions) plus the extras F7 names. Every MCP write
 * reads its row back through these (F6).
 *
 * Real plan only: every id goes through `requireRealPlanRow`, so a Fork's
 * row, a made-up id and a non-member's id all read as `notFound()`, and so
 * does a row inside a Surprise hidden from the acting Traveller (CONTEXT.md
 * Surprise). The queries also carry the Surprise fragments, so nothing
 * hidden leaves the database.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { loadSurpriseVisibility, type SurpriseVisibility } from "@/lib/surprise-visibility";
import { requireRealPlanRow } from "../real-plan";
import { loadTripAttachments, type TripAttachmentsResult } from "./attachments";
import { readMcpCosts, type McpCost } from "./costs";
import { readMcpNotes, type McpNote } from "./notes";
import { ownerKey } from "./owners";
import {
  MCP_ACCOMMODATION_SELECT, MCP_CHAPTER_SELECT, MCP_DATED_ITEM_SELECT, MCP_TRANSPORT_SELECT, MCP_TRIP_SELECT,
  toMcpAccommodation, toMcpItem, toMcpTransport, toMcpTrip,
  type FilesFor, type McpAccommodation, type McpChapter, type McpItem, type McpTransport, type McpTripSummary,
} from "./plan-shapes";

export interface McpItemDetail extends McpItem {
  costs: McpCost[];
  /** The Notes the Travellers left on it (CONTEXT.md Note) — not `notes`, which is the Item's own description. */
  notesOnItem: McpNote[];
}
export interface McpTransportDetail extends McpTransport { costs: McpCost[] }
export interface McpAccommodationDetail extends McpAccommodation { stopId: string; costs: McpCost[] }

async function visibilityFor(tripId: string): Promise<SurpriseVisibility> {
  const { user } = await requireTripAccess(tripId);
  return loadSurpriseVisibility(tripId, user.id);
}

const filesFrom = ({ byOwner }: TripAttachmentsResult): FilesFor => (kind, id) => byOwner.get(ownerKey(kind, id)) ?? [];

export async function loadItemForMcp(itemId: string): Promise<McpItemDetail> {
  const { tripId } = await requireRealPlanRow("item", itemId);
  const v = await visibilityFor(tripId);
  const row = await db.item.findFirst({ where: { id: itemId, tripId, ...REAL_PLAN, ...v.where.item }, select: MCP_DATED_ITEM_SELECT });
  if (!row) notFound();
  const [files, { costs }, notesOnItem] = await Promise.all([
    loadTripAttachments(tripId, v, { targetIds: [itemId] }),
    readMcpCosts(tripId, v, { ownerType: "ITEM", ownerId: itemId }),
    readMcpNotes(tripId, v, { targetType: "ITEM", targetId: itemId }),
  ]);
  return { ...toMcpItem({ ...row, surprise: v.views.items.get(itemId) ?? null }, filesFrom(files)), costs, notesOnItem };
}

export async function loadTransportForMcp(transportId: string): Promise<McpTransportDetail> {
  const { tripId } = await requireRealPlanRow("transport", transportId);
  const v = await visibilityFor(tripId);
  const [trip, t] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { homeTimezone: true } }),
    db.transport.findUnique({ where: { id: transportId }, select: MCP_TRANSPORT_SELECT }),
  ]);
  if (!t) notFound();
  const endIds = [t.fromStopId, t.toStopId].filter((id): id is string => id !== null);
  const [ends, files, { costs }] = await Promise.all([
    // A hidden Surprise Stop keeps its name (its shell), so no fragment here — same as get_trip_plan's endpoints.
    db.stop.findMany({ where: { id: { in: endIds }, tripId, ...REAL_PLAN }, select: { id: true, name: true, timezone: true } }),
    loadTripAttachments(tripId, v, { targetIds: [transportId] }),
    readMcpCosts(tripId, v, { ownerType: "TRANSPORT", ownerId: transportId }),
  ]);
  return {
    ...toMcpTransport(t, {
      stopNameById: new Map(ends.map((s) => [s.id, s.name])),
      tzById: new Map(ends.map((s) => [s.id, s.timezone])),
      homeTimezone: trip?.homeTimezone ?? null,
      filesFor: filesFrom(files),
    }),
    costs,
  };
}

export async function loadAccommodationForMcp(accommodationId: string): Promise<McpAccommodationDetail> {
  const { tripId } = await requireRealPlanRow("accommodation", accommodationId);
  const v = await visibilityFor(tripId);
  const row = await db.accommodation.findFirst({
    where: { id: accommodationId, tripId, ...REAL_PLAN, ...v.where.accommodation },
    select: { ...MCP_ACCOMMODATION_SELECT, stopId: true },
  });
  if (!row) notFound();
  const { stopId, ...stay } = row;
  const [files, { costs }] = await Promise.all([
    loadTripAttachments(tripId, v, { targetIds: [accommodationId] }),
    readMcpCosts(tripId, v, { ownerType: "ACCOMMODATION", ownerId: accommodationId }),
  ]);
  return { ...toMcpAccommodation(stay, filesFrom(files)), stopId, costs };
}

export async function loadChapterForMcp(chapterId: string): Promise<McpChapter> {
  await requireRealPlanRow("chapter", chapterId);
  const chapter = await db.chapter.findUnique({ where: { id: chapterId }, select: MCP_CHAPTER_SELECT });
  if (!chapter) notFound();
  return chapter;
}

export async function loadTripSummaryForMcp(tripId: string): Promise<McpTripSummary> {
  const v = await visibilityFor(tripId);
  const [trip, { byOwner }] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: MCP_TRIP_SELECT }),
    loadTripAttachments(tripId, v, { tripFiles: true }),
  ]);
  return toMcpTrip(tripId, trip, byOwner.get(ownerKey("TRIP", tripId)) ?? []);
}
