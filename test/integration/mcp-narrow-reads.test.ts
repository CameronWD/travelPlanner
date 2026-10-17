import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the Next boundary with no meaning outside a request; guards, the
// Surprise loader and every query run for real, as the acting Traveller.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { db } from "@/lib/db";
import { runAsTraveller } from "@/lib/mcp/acting-traveller";
import { loadTripPlanForMcp } from "@/lib/mcp/reads/trip-plan";
import { loadAccommodationForMcp, loadItemForMcp, loadStopForMcp, loadTransportForMcp, readMcpStops } from "@/lib/mcp/reads/entities";
import { loadDayForMcp } from "@/lib/mcp/reads/day";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";
import type { HoursSpan } from "@/lib/opening-hours";

const OWNER = "it-narrow-owner";
const MEMBER = "it-narrow-member";
const TRIP_ID = "it-narrow-trip";
const FORK_ID = "it-narrow-fork";
const PORTO = "it-narrow-porto";
const SECRET = "it-narrow-secret"; // Surprise Stop, hidden from MEMBER
const TOUR = "it-narrow-tour"; // timed, Porto, 06-02
const MARKET = "it-narrow-market"; // untimed, Porto, 06-02
const TRAIN = "it-narrow-train"; // dated 06-04 (the Changeover day), no Stop
const TASTING = "it-narrow-tasting"; // undated thing to do under Porto
const GIFT = "it-narrow-gift"; // Surprise Item in Porto on 06-03, hidden from MEMBER
const FORK_ITEM = "it-narrow-fork-item";
const CASA = "it-narrow-casa";
const FLIGHT = "it-narrow-flight";
const FAREWELL = "it-narrow-farewell"; // Porto's, on the Changeover day (R5)

export const as = (id: string) => <T,>(fn: () => Promise<T>) =>
  runAsTraveller({ id, name: id, email: `${id}@example.test`, image: null }, fn);
const NOT_FOUND = { digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") };
const future = JSON.stringify([MEMBER]);

describe.skipIf(process.env.INTEGRATION !== "1")("MCP narrow reads (real Postgres)", () => {
  beforeAll(async () => {
    for (const id of [OWNER, MEMBER]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
    }
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Narrow", homeCurrency: "AUD", createdById: OWNER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07", homeName: "Brisbane", homeTimezone: "Australia/Brisbane",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: OWNER } });
    await db.stop.createMany({
      data: [
        { id: PORTO, tripId: TRIP_ID, name: "IT Porto", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0, notes: "Port lodges" },
        { id: SECRET, tripId: TRIP_ID, name: "IT Secret", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1, notes: "the secret", surprisePlannerId: OWNER, surpriseForIds: future },
      ],
    });
    await db.item.createMany({
      data: [
        { id: TOUR, tripId: TRIP_ID, stopId: PORTO, title: "IT Lodge tour", category: "ACTIVITY", date: "2027-06-02", startTime: "10:00", notes: "Be early", sortOrder: 0, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20", slotTime: "10:15", arriveByMinutes: 15, refundable: false },
        { id: MARKET, tripId: TRIP_ID, stopId: PORTO, title: "IT Market", category: "FOOD", date: "2027-06-02", sortOrder: 1 },
        { id: TRAIN, tripId: TRIP_ID, title: "IT Train", category: "GETTING_AROUND", date: "2027-06-04", startTime: "09:00", sortOrder: 2 },
        { id: TASTING, tripId: TRIP_ID, stopId: PORTO, title: "IT Tasting", category: "FOOD", sortOrder: 3 },
        { id: GIFT, tripId: TRIP_ID, stopId: PORTO, title: "IT Gift dinner", category: "FOOD", date: "2027-06-03", startTime: "19:00", sortOrder: 4, surprisePlannerId: OWNER, surpriseForIds: future, slotTime: "19:15", refundable: false },
        { id: FORK_ITEM, tripId: TRIP_ID, forkId: FORK_ID, title: "IT Fork thing", category: "OTHER", date: "2027-06-02", sortOrder: 0 },
      ],
    });
    // The Changeover day's only Day title belongs to the arriving Stop.
    await db.dayTitle.createMany({ data: [{ stopId: PORTO, dayIndex: 1, title: "IT Ribeira day" }, { stopId: SECRET, dayIndex: 0, title: "IT Secret arrival" }] });
    await db.accommodation.create({ data: { id: CASA, tripId: TRIP_ID, stopId: PORTO, name: "IT Casa", checkIn: "2027-06-01", checkOut: "2027-06-04", checkInTime: "15:00", bookingState: "TO_BOOK" } });
    await db.transport.create({
      data: { id: FLIGHT, tripId: TRIP_ID, mode: "FLIGHT", depIsHome: true, toStopId: PORTO, depAt: new Date("2027-05-31T22:00:00Z"), arrAt: new Date("2027-06-01T10:00:00Z"), reference: "IT QF1", bookingState: "BOOKED" },
    });
    await db.cost.createMany({
      data: [
        { tripId: TRIP_ID, ownerType: "ITEM", ownerId: TOUR, costMinor: 3000, currency: "EUR" },
        { tripId: TRIP_ID, ownerType: "ACCOMMODATION", ownerId: CASA, costMinor: 45000, currency: "EUR" },
        { tripId: TRIP_ID, ownerType: "TRANSPORT", ownerId: FLIGHT, costMinor: 150000, currency: "AUD" },
      ],
    });
    await db.note.create({ data: { tripId: TRIP_ID, authorId: MEMBER, targetType: "ITEM", targetId: TOUR, body: "IT Bring the voucher" } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it.each([OWNER, MEMBER])("get_stop equals get_trip_plan's stop, Changeover title and Stopless Item included (as %s)", async (who) => {
    const plan = await as(who)(() => loadTripPlanForMcp(TRIP_ID));
    const stop = await as(who)(() => loadStopForMcp(PORTO));
    expect(stop).toEqual(plan.stops.find((s) => s.id === PORTO));
  });

  it("the owner sees the arriving Stop's title on Porto's last day; the surprised member does not", async () => {
    const lastDay = async (who: string) => (await as(who)(() => loadStopForMcp(PORTO))).days.at(-1)!;
    expect(await lastDay(OWNER)).toMatchObject({ date: "2027-06-04", dayTitle: "IT Secret arrival", items: [expect.objectContaining({ id: TRAIN })] });
    expect((await lastDay(MEMBER)).dayTitle).toBeNull();
  });

  it("get_item, get_transport and get_accommodation equal their get_trip_plan slices, plus their extras", async () => {
    const plan = await as(OWNER)(() => loadTripPlanForMcp(TRIP_ID));
    const porto = plan.stops.find((s) => s.id === PORTO)!;
    const tourOnDay = porto.days.find((d) => d.date === "2027-06-02")!.items.find((i) => i.id === TOUR)!;

    const item = await as(OWNER)(() => loadItemForMcp(TOUR));
    const { date, stopId, costs, notesOnItem, ...daySlice } = item;
    expect(daySlice).toEqual(tourOnDay);
    expect(item).toMatchObject({ slotTime: "10:15", arriveByMinutes: 15, refundable: "NO" });
    expect({ date, stopId }).toEqual({ date: "2027-06-02", stopId: PORTO });
    expect(costs.map((c) => c.amount.minor)).toEqual([3000]);
    expect(notesOnItem.map((n) => n.body)).toEqual(["IT Bring the voucher"]);
    expect(item.notes).toBe("Be early");

    const { costs: legCosts, ...leg } = await as(OWNER)(() => loadTransportForMcp(FLIGHT));
    expect(leg).toEqual(plan.transports.find((t) => t.id === FLIGHT));
    expect(legCosts.map((c) => c.amount.minor)).toEqual([150000]);

    const { costs: stayCosts, stopId: stayStop, ...stay } = await as(OWNER)(() => loadAccommodationForMcp(CASA));
    expect(stay).toEqual(porto.accommodations[0]);
    expect(stayStop).toBe(PORTO);
    expect(stayCosts.map((c) => c.amount.minor)).toEqual([45000]);

    expect(tourOnDay).toMatchObject({ bookingState: "TO_BOOK", bookBy: "2027-05-20" });
    expect(leg).toMatchObject({ bookingState: "BOOKED", bookBy: null });
    expect(stay).toMatchObject({ bookingState: "TO_BOOK", bookBy: null });
  });

  it("a Fork's row, and a Surprise hidden from the caller, read as not found", async () => {
    await expect(as(OWNER)(() => loadItemForMcp(FORK_ITEM))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(MEMBER)(() => loadStopForMcp(SECRET))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(MEMBER)(() => loadItemForMcp(GIFT))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(OWNER)(() => loadStopForMcp(SECRET))).resolves.toMatchObject({ id: SECRET, notes: "the secret" });
  });

  it("readMcpStops shows the surprised member the Surprise Stop's shell, without refusing", async () => {
    const [shell] = await as(MEMBER)(() => readMcpStops(TRIP_ID, [SECRET]));
    expect(shell).toMatchObject({ id: SECRET, name: "IT Secret", arriveDate: "2027-06-04", notes: null, days: [], accommodations: [], thingsToDo: [] });
  });

  it("get_day shows the hidden Surprise Item as a 'Surprise' placeholder at its time, and the plan's day otherwise", async () => {
    const memberDay = await as(MEMBER)(() => loadDayForMcp(TRIP_ID, "2027-06-03"));
    if ("success" in memberDay) throw new Error("expected a day");
    expect(memberDay.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: GIFT, title: "Surprise" }) }));

    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
    if ("success" in day) throw new Error("expected a day");
    expect(day).toMatchObject({ dayTitle: "IT Ribeira day", stop: { id: PORTO }, tonight: { id: CASA, nightOf: { night: 2, of: 3 } } });
    expect(day.timeline.map((e) => (e.kind === "item" ? e.item.id : e.kind))).toEqual([TOUR]);
    expect(day.anytime.map((i) => i.id)).toEqual([MARKET]);
    // Same as get_trip_plan's day: both go through toMcpDayItem.
    const tour = day.timeline.find((e) => e.kind === "item" && e.item.id === TOUR);
    expect(tour).toMatchObject({ item: { bookingState: "TO_BOOK", bookBy: "2027-05-20" } });
    expect(day.timeline.some((e) => e.kind === "item" && e.item.id === FORK_ITEM)).toBe(false);
  });

  it("get_day agrees on the slot, and the surprised member's placeholder hides it (R3)", async () => {
    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: TOUR, slotTime: "10:15", arriveByMinutes: 15, refundable: "NO" }) }));
    const memberDay = await as(MEMBER)(() => loadDayForMcp(TRIP_ID, "2027-06-03"));
    if ("success" in memberDay) throw new Error("expected a day");
    expect(memberDay.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: GIFT, title: "Surprise", slotTime: null, refundable: "UNKNOWN" }) }));
    const plan = await as(MEMBER)(() => loadTripPlanForMcp(TRIP_ID));
    expect(JSON.stringify(plan)).not.toContain("19:15");
  });

  // Task D.11 (CONTEXT.md "Opening hours"). The brief's fixture assumed the
  // D brief's shape (weekly/closedDates, sourceUrl); d-as-built.md is
  // authoritative, so this stores S's real `week`/`seasons`/`closed`/`source`
  // shape, serialized to the stored JSON string column.
  it("get_item, get_trip_plan and get_day read a thing's opening hours; a hidden Surprise's never leave", async () => {
    const span: HoursSpan[] = [["10:00", "18:00"]];
    const hours = { week: { sun: [], mon: span, tue: span, wed: span, thu: span, fri: span, sat: span }, seasons: [], closed: [] };
    await db.item.update({ where: { id: TOUR }, data: { openingHours: serializeOpeningHours(hours) } });
    await db.item.update({ where: { id: TASTING }, data: { openingHours: serializeOpeningHours(hours) } });
    await db.item.update({ where: { id: GIFT }, data: { openingHours: serializeOpeningHours({ ...hours, source: "https://it-gift-dinner.example" }) } });

    const plan = await as(OWNER)(() => loadTripPlanForMcp(TRIP_ID));
    const porto = plan.stops.find((s) => s.id === PORTO)!;
    expect(porto.days.find((d) => d.date === "2027-06-02")!.items.find((i) => i.id === TOUR)!.openingHours).toEqual(hours);
    expect(porto.thingsToDo.find((t) => t.id === TASTING)!.openingHours).toEqual(hours);
    expect((await as(OWNER)(() => loadItemForMcp(TOUR))).openingHours).toEqual(hours);
    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: TOUR, openingHours: hours }) }));

    const memberPlan = await as(MEMBER)(() => loadTripPlanForMcp(TRIP_ID));
    const memberDay = await as(MEMBER)(() => loadDayForMcp(TRIP_ID, "2027-06-03"));
    expect(JSON.stringify([memberPlan, memberDay])).not.toContain("it-gift-dinner");
  });

  it("marks each Changeover-day Item with its owning Stop in get_trip_plan, get_stop, get_day and get_item (R5)", async () => {
    // Created here, not in beforeEach, so the existing Changeover-day assertions keep their exact item lists.
    await db.item.create({ data: { id: FAREWELL, tripId: TRIP_ID, stopId: PORTO, title: "IT Farewell lunch", category: "FOOD", date: "2027-06-04", startTime: "12:00", sortOrder: 5 } });
    const plan = await as(OWNER)(() => loadTripPlanForMcp(TRIP_ID));
    const owners = (items: { id: string; owningStop: unknown }[]) => Object.fromEntries(items.map((i) => [i.id, i.owningStop]));
    const departing = plan.stops.find((s) => s.id === PORTO)!.days.at(-1)!;
    const arriving = plan.stops.find((s) => s.id === SECRET)!.days[0];
    expect(departing.date).toBe("2027-06-04");
    expect(arriving.date).toBe("2027-06-04");
    expect(owners(departing.items)).toEqual({ [TRAIN]: null, [FAREWELL]: { id: PORTO, name: "IT Porto" } });
    expect(owners(arriving.items)).toEqual(owners(departing.items));

    expect((await as(OWNER)(() => loadStopForMcp(SECRET))).days[0]).toEqual(arriving);

    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-04"));
    if ("success" in day) throw new Error("expected a day");
    expect(day.stop?.id).toBe(SECRET); // the arriving Stop…
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: FAREWELL, owningStop: { id: PORTO, name: "IT Porto" } }) })); // …but the lunch is Porto's

    expect((await as(OWNER)(() => loadItemForMcp(FAREWELL))).owningStop).toEqual({ id: PORTO, name: "IT Porto" });
  });

  // Fix round 1 (controller ruling): get_day's own `rows.stops` (readDayRows'
  // stopRows query) excludes rough Stops, which made owningStopRef invent "a
  // Stop with no dates yet" for an Item owned by one. get_day now fetches
  // every real-plan Stop's name (the same query readMcpStops makes), so a
  // rough owner's real name shows, same as get_item.
  it("an Item owned by a rough Stop gets its real Stop name in get_day, same as get_item (R5)", async () => {
    const ROUGH = "it-narrow-rough-stop";
    const ROUGH_ITEM = "it-narrow-rough-item";
    await db.stop.create({ data: { id: ROUGH, tripId: TRIP_ID, name: "IT Somewhere else", sortOrder: 9 } });
    await db.item.create({ data: { id: ROUGH_ITEM, tripId: TRIP_ID, stopId: ROUGH, title: "IT Day trip", category: "ACTIVITY", date: "2027-06-02", startTime: "15:00", sortOrder: 9 } });

    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: ROUGH_ITEM, owningStop: { id: ROUGH, name: "IT Somewhere else" } }) }));

    expect((await as(OWNER)(() => loadItemForMcp(ROUGH_ITEM))).owningStop).toEqual({ id: ROUGH, name: "IT Somewhere else" });
  });

  it("get_day on a Trip with a start date but no end date is the no-dates tool error, not a one-day Trip", async () => {
    await db.trip.update({ where: { id: TRIP_ID }, data: { endDate: null } });
    expect(await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-01"))).toEqual({
      success: false,
      errors: { date: ["This trip has no dates yet, so it has no days. Read it with get_trip_plan."] },
    });
  });

  it("stopTracker names the Surprise Stop a date push moved, as the surprised member's shell", async () => {
    const { stopTracker } = await import("@/lib/mcp/reads/stop-changes");
    const t = stopTracker();
    await as(MEMBER)(() => t.start(TRIP_ID));
    await db.stop.update({ where: { id: SECRET }, data: { arriveDate: "2027-06-05", departDate: "2027-06-08" } });
    const out = await as(MEMBER)(() => t.stopAndShifted(PORTO));
    expect(out.stop.id).toBe(PORTO);
    expect(out.shifted).toEqual([expect.objectContaining({ id: SECRET, arriveDate: "2027-06-05", notes: null, days: [] })]);
  });

  it("the list readers read real rows", async () => {
    const { loadChecklistOfItemForMcp, loadVotesForMcp } = await import("@/lib/mcp/reads/lists");
    const a = await db.checklistItem.create({ data: { tripId: TRIP_ID, kind: "PACKING", text: "IT Adapter", sortOrder: 1 } });
    await db.checklistItem.create({ data: { tripId: TRIP_ID, kind: "PACKING", text: "IT Hat", sortOrder: 0 } });
    await db.vote.create({ data: { tripId: TRIP_ID, itemId: TOUR, userId: MEMBER, level: "MUST" } });
    expect((await as(OWNER)(() => loadChecklistOfItemForMcp(a.id))).items.map((i) => i.text)).toEqual(["IT Hat", "IT Adapter"]);
    expect(await as(OWNER)(() => loadVotesForMcp(TOUR))).toEqual({ itemId: TOUR, votes: [{ traveller: expect.any(String), level: "MUST" }] });
  });
});
