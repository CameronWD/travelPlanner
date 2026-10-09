/**
 * Read-only Trip tools for the Claude connection (spec 2026-10-09).
 *
 * list_trips reads memberships directly with the same filter as the /trips
 * page loader (member + not deleted, real plan Stops only) rather than calling
 * loadTripsPage: the page's cards carry no end date or Phase, and the loader
 * also runs the travel stats and next-step queries a list does not need.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { todayISO } from "@/lib/dates";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { orderForCarousel } from "@/lib/trips/trip-status";
import { runTool } from "../run-tool";

async function listMyTrips(userId: string) {
  const memberships = await db.tripMember.findMany({
    where: { userId, trip: { deletedAt: null } },
    select: {
      trip: {
        select: {
          id: true, name: true, startDate: true, endDate: true, createdAt: true,
          stops: {
            where: REAL_PLAN,
            orderBy: { sortOrder: "asc" },
            select: { id: true, sortOrder: true, arriveDate: true, departDate: true, timezone: true },
          },
        },
      },
    },
  });
  const trips = memberships.map((m) => m.trip);
  const todayByTripId = new Map(trips.map((t) => [t.id, tripTodayISO(t.stops)]));
  const ordered = orderForCarousel(
    trips.map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, createdAt: t.createdAt, stopCount: t.stops.length })),
    todayISO(),
    todayByTripId,
  );
  return ordered.map((t) => ({
    id: t.id,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    phase: computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today: todayByTripId.get(t.id) ?? todayISO() }),
  }));
}

export function registerTripReadTools(server: McpServer): void {
  server.registerTool(
    "list_trips",
    {
      title: "List my trips",
      description: "Lists the Trips you are a member of, with id, name, dates and phase. Use the id with the other tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool("list_trips", async () => {
        const user = await requireUser();
        return listMyTrips(user.id);
      }),
  );
}
