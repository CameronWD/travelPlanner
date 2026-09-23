import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { User } from "@prisma/client";
import { buildChristmasEurope2026 } from "@/lib/real-trip/christmas-europe-2026";

// `persist.ts` no longer imports `@/lib/db` at the top level — it loads `db`
// lazily via a dynamic `import()` inside each function that needs it
// (loadDb()), specifically so this module can be imported, and a dry run can
// execute, with no DATABASE_URL set (there's no Postgres in this test
// environment, and the only DATABASE_URL this repo ever supplies points at
// production). Vitest's `vi.mock` intercepts a dynamic `import()` the same
// way it intercepts a static one, so mocking `@/lib/db` here still works —
// and it's what lets the assertNoExistingRealTrip tests below control
// `trip.findMany`'s return value without a real database.
const {
  findManyMock, userFindUniqueMock, userCreateMock, userUpsertMock, tripMemberUpsertMock,
  tripCreateMock, tripUpdateMock, tripDeleteMock, attachmentFindManyMock,
  chapterCreateMock, stopCreateMock, transportCreateMock, accommodationCreateMock,
  itemCreateMock, voteCreateMock, costCreateMock, exchangeRateCreateMock, checklistItemCreateMock,
  scheduleBlobDeletionMock, storageDeleteMock,
} = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userCreateMock: vi.fn(),
  userUpsertMock: vi.fn(),
  tripMemberUpsertMock: vi.fn(),
  tripCreateMock: vi.fn(),
  tripUpdateMock: vi.fn(),
  tripDeleteMock: vi.fn(),
  attachmentFindManyMock: vi.fn(),
  chapterCreateMock: vi.fn(),
  stopCreateMock: vi.fn(),
  transportCreateMock: vi.fn(),
  accommodationCreateMock: vi.fn(),
  itemCreateMock: vi.fn(),
  voteCreateMock: vi.fn(),
  costCreateMock: vi.fn(),
  exchangeRateCreateMock: vi.fn(),
  checklistItemCreateMock: vi.fn(),
  // ARCH-DAT-3 (fix round 1, C1): wipeRealTrip used to hard-delete blobs
  // directly via storage.delete — the most dangerous instance of the
  // finding, since this file's own docs call wipeRealTrip out as a path
  // meant to run against production. scheduleBlobDeletion is loaded via a
  // dynamic import() inside wipeRealTrip (same lazy-loading discipline as
  // loadDb()); vi.mock intercepts that the same way it intercepts a static
  // import (see the file-level comment above).
  scheduleBlobDeletionMock: vi.fn().mockResolvedValue(undefined),
  storageDeleteMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findMany: findManyMock, create: tripCreateMock, update: tripUpdateMock, delete: tripDeleteMock },
    user: { findUnique: userFindUniqueMock, create: userCreateMock, upsert: userUpsertMock },
    tripMember: { upsert: tripMemberUpsertMock },
    attachment: { findMany: attachmentFindManyMock },
    chapter: { create: chapterCreateMock },
    stop: { create: stopCreateMock },
    transport: { create: transportCreateMock },
    accommodation: { create: accommodationCreateMock },
    item: { create: itemCreateMock },
    vote: { create: voteCreateMock },
    cost: { create: costCreateMock },
    exchangeRate: { create: exchangeRateCreateMock },
    checklistItem: { create: checklistItemCreateMock },
  },
}));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: scheduleBlobDeletionMock }));
vi.mock("@/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    getStorage: vi.fn(() => ({ save: vi.fn(), delete: storageDeleteMock, read: vi.fn() })),
  };
});

import {
  resolvePaidAt,
  assertNoExistingRealTrip,
  addExistingUserAsMember,
  persistRealTrip,
  wipeRealTrip,
  REAL_TRIP_NAME,
  REAL_PARTNER_EMAIL,
  REAL_USER,
} from "./persist";

const FALLBACK = new Date("2026-09-10T00:00:00.000Z");

describe("resolvePaidAt", () => {
  it("returns null for an unpaid cost", () => {
    expect(resolvePaidAt({ paid: false }, FALLBACK)).toBeNull();
  });

  it("returns null for a missing cost", () => {
    expect(resolvePaidAt(undefined, FALLBACK)).toBeNull();
    expect(resolvePaidAt(null, FALLBACK)).toBeNull();
  });

  it("uses the recorded payment date when the cost has one", () => {
    const got = resolvePaidAt({ paid: true, paidAt: "2026-07-13" }, FALLBACK);
    expect(got).toEqual(new Date("2026-07-13"));
  });

  it("falls back when a paid cost has no recorded date", () => {
    expect(resolvePaidAt({ paid: true }, FALLBACK)).toEqual(FALLBACK);
    expect(resolvePaidAt({ paid: true, paidAt: null }, FALLBACK)).toEqual(FALLBACK);
  });
});

describe("assertNoExistingRealTrip", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("resolves quietly when no trip of that name exists", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await expect(assertNoExistingRealTrip("Christmas in Europe 2026")).resolves.toBeUndefined();
  });

  it("throws, naming every offending id, when a trip already exists", async () => {
    findManyMock.mockResolvedValueOnce([{ id: "trip_abc" }, { id: "trip_def" }]);
    const promise = assertNoExistingRealTrip("Christmas in Europe 2026");
    await expect(promise).rejects.toThrow(/Refusing to write: 2 trip\(s\) already named "Christmas in Europe 2026"/);
    await expect(promise).rejects.toThrow(/trip_abc/);
    await expect(promise).rejects.toThrow(/trip_def/);
  });

  it("defaults to REAL_TRIP_NAME when no name is passed", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await assertNoExistingRealTrip();
    expect(findManyMock).toHaveBeenCalledWith({
      where: { name: "Christmas in Europe 2026" },
      select: { id: true },
    });
  });
});

describe("real trip participants", () => {
  it("names Cam as the owner and Xanthia as the partner", () => {
    expect(REAL_USER.email).toBe("cammark.williams@gmail.com");
    expect(REAL_PARTNER_EMAIL).toBe("xanni99.m@hotmail.com");
  });

  it("keeps the two participants distinct", () => {
    expect(REAL_PARTNER_EMAIL).not.toBe(REAL_USER.email);
  });
});

describe("addExistingUserAsMember", () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    userUpsertMock.mockReset();
    tripMemberUpsertMock.mockReset();
  });

  it("returns false and creates nothing when no user matches the email", async () => {
    userFindUniqueMock.mockResolvedValueOnce(null);

    const result = await addExistingUserAsMember("trip_1", "nobody@example.com");

    expect(result).toBe(false);
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "nobody@example.com" },
      select: { id: true },
    });
    expect(tripMemberUpsertMock).not.toHaveBeenCalled();
    expect(userCreateMock).not.toHaveBeenCalled();
    expect(userUpsertMock).not.toHaveBeenCalled();
  });

  it("returns true and upserts a TripMember with the right tripId/userId/role when a user matches", async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: "user_xanthia" });
    tripMemberUpsertMock.mockResolvedValueOnce({});

    const result = await addExistingUserAsMember("trip_1", "xanni99.m@hotmail.com", "member");

    expect(result).toBe(true);
    expect(tripMemberUpsertMock).toHaveBeenCalledWith({
      where: { tripId_userId: { tripId: "trip_1", userId: "user_xanthia" } },
      update: {},
      create: { tripId: "trip_1", userId: "user_xanthia", role: "member" },
    });
  });

  it("defaults the role to member when none is passed", async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: "user_xanthia" });
    tripMemberUpsertMock.mockResolvedValueOnce({});

    await addExistingUserAsMember("trip_1", "xanni99.m@hotmail.com");

    expect(tripMemberUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "member" }) }),
    );
  });

  it("passes a non-default role through to the upsert, proving the parameter is actually read", async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: "user_xanthia" });
    tripMemberUpsertMock.mockResolvedValueOnce({});

    await addExistingUserAsMember("trip_1", "xanni99.m@hotmail.com", "owner");

    expect(tripMemberUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "owner" }) }),
    );
  });

  it("never creates a User row, even when a member is successfully added", async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: "user_xanthia" });
    tripMemberUpsertMock.mockResolvedValueOnce({});

    await addExistingUserAsMember("trip_1", "xanni99.m@hotmail.com");

    expect(userCreateMock).not.toHaveBeenCalled();
    expect(userUpsertMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// persistRealTrip — the function that actually performs the production write.
//
// It maps the descriptor to database rows, and until now nothing exercised it:
// the builder's own tests check the descriptor, and there is no Postgres in
// this sandbox, so a mis-wired `stopId` or a cost attached to the wrong owner
// would have been discovered by reading the live data afterwards. These tests
// drive the real function over the real builder output with `@/lib/db` mocked,
// and assert the payloads handed to Prisma — the closest thing to a rehearsal
// this project can have.
// ---------------------------------------------------------------------------
describe("persistRealTrip", () => {
  const trip = buildChristmasEurope2026();
  const USER = { id: "user_cam", email: REAL_USER.email, name: REAL_USER.name } as User;
  // Deliberately absurd: this is resolvePaidAt's fallback, so if any written
  // cost carries it, a payment date was fabricated from the seed's run clock.
  const RUN_CLOCK = new Date("2099-06-01T00:00:00.000Z");

  /** The `data` payload of every call to a mocked Prisma `create`. */
  const dataOf = (mock: { mock: { calls: unknown[][] } }): Record<string, unknown>[] =>
    mock.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

  let tripId: string;
  let stopIdByName: Map<string, string>;
  let accIdByName: Map<string, string>;
  let trIdBySort: Map<number, string>;
  let stopRows: Record<string, unknown>[];
  let accRows: Record<string, unknown>[];
  let trRows: Record<string, unknown>[];
  let costRows: Record<string, unknown>[];
  /** trip.findMany calls made *by persistRealTrip* (other suites share the mock). */
  let tripLookupsDuringPersist: number;

  beforeAll(async () => {
    for (const m of [
      tripCreateMock, tripUpdateMock, tripDeleteMock, attachmentFindManyMock, chapterCreateMock,
      stopCreateMock, transportCreateMock, accommodationCreateMock, itemCreateMock, voteCreateMock,
      costCreateMock, exchangeRateCreateMock, checklistItemCreateMock,
    ]) m.mockReset();

    // Each create hands back a distinct, recognisable id so the foreign keys in
    // later payloads can be traced back to the row they point at.
    tripCreateMock.mockResolvedValue({ id: "trip_real" });
    let stopN = 0, trN = 0, accN = 0, itemN = 0, chapterN = 0;
    stopCreateMock.mockImplementation(async () => ({ id: `stop_${stopN++}` }));
    transportCreateMock.mockImplementation(async () => ({ id: `tr_${trN++}` }));
    accommodationCreateMock.mockImplementation(async () => ({ id: `acc_${accN++}` }));
    itemCreateMock.mockImplementation(async () => ({ id: `item_${itemN++}` }));
    chapterCreateMock.mockImplementation(async () => ({ id: `chapter_${chapterN++}` }));
    costCreateMock.mockResolvedValue({ id: "cost" });
    exchangeRateCreateMock.mockResolvedValue({ id: "rate" });
    checklistItemCreateMock.mockResolvedValue({ id: "cl" });

    const lookupsBefore = findManyMock.mock.calls.length;
    tripId = await persistRealTrip(trip, USER, RUN_CLOCK);
    tripLookupsDuringPersist = findManyMock.mock.calls.length - lookupsBefore;

    stopRows = dataOf(stopCreateMock);
    accRows = dataOf(accommodationCreateMock);
    trRows = dataOf(transportCreateMock);
    costRows = dataOf(costCreateMock);
    stopIdByName = new Map(stopRows.map((d, i) => [d.name as string, `stop_${i}`]));
    accIdByName = new Map(accRows.map((d, i) => [d.name as string, `acc_${i}`]));
    trIdBySort = new Map(trRows.map((d, i) => [d.sortOrder as number, `tr_${i}`]));
  });

  it("creates one trip row with the envelope and a single owner member", () => {
    expect(tripCreateMock).toHaveBeenCalledTimes(1);
    expect(tripId).toBe("trip_real");
    const d = dataOf(tripCreateMock)[0];
    expect(d).toMatchObject({
      name: "Christmas in Europe 2026",
      startDate: "2026-12-04",
      endDate: "2027-01-08",
      hardEndDate: null,
      homeCurrency: "AUD",
      homeName: "Gold Coast",
      homeLat: -28.0023731,
      homeLng: 153.4145987,
      homeCountryCode: "au",
      roundTrip: true,
      createdById: "user_cam",
    });
    expect(d.members).toEqual({ create: [{ userId: "user_cam", role: "owner" }] });
  });

  it("creates the 11 stops against that trip, in order, with their timezones", () => {
    expect(stopRows).toHaveLength(11);
    expect(stopRows.map((d) => d.name)).toEqual([
      "Denpasar", "Munich", "Strasbourg", "Frankfurt", "Paris", "London",
      "Aghalee", "Dublin", "Como", "Milan", "Rome",
    ]);
    for (const d of stopRows) {
      expect(d.tripId, String(d.name)).toBe("trip_real");
      expect(d.timezone, String(d.name)).toBeTruthy();
      expect(d.chapterId, String(d.name)).toBeNull();
    }
  });

  it("links each of the 11 beds to the id of its own stop, not a neighbour's", () => {
    const EXPECTED: [bed: string, stop: string][] = [
      ["1 Bedroom private pool @Kuta", "Denpasar"],
      ["B&B Hotel München-Hbf", "Munich"],
      ["B&B Hotel Kehl", "Strasbourg"],
      ["Premier Inn Frankfurt City Europaviertel", "Frankfurt"],
      ["Villa Margaux Opéra Montmartre", "Paris"],
      ["Zedwell Underground Hotel Tottenham Court Rd", "London"],
      ["Clenaghans", "Aghalee"],
      ["Point A Dublin The Liberties", "Dublin"],
      ["attico capicci", "Como"],
      ["Ibis Milano Centro", "Milan"],
      ["The Club Navona", "Rome"],
    ];
    expect(accRows).toHaveLength(11);
    const byName = new Map(accRows.map((d) => [d.name as string, d]));
    for (const [bed, stop] of EXPECTED) {
      const d = byName.get(bed);
      expect(d, bed).toBeTruthy();
      expect(d!.tripId, bed).toBe("trip_real");
      expect(d!.stopId, bed).toBe(stopIdByName.get(stop));
    }
    // Distinct stops — a bug that pointed every bed at one stop would still
    // satisfy a per-row check if that stop happened to be the expected one.
    expect(new Set(accRows.map((d) => d.stopId)).size).toBe(11);
  });

  it("wires all 13 legs to the right endpoint stops and home flags", () => {
    const EXPECTED: { sortOrder: number; from: string | null; to: string | null; depIsHome: boolean; arrIsHome: boolean }[] = [
      { sortOrder: 0, from: null, to: "Denpasar", depIsHome: true, arrIsHome: false },
      { sortOrder: 1, from: "Denpasar", to: "Munich", depIsHome: false, arrIsHome: false },
      { sortOrder: 2, from: "Munich", to: "Strasbourg", depIsHome: false, arrIsHome: false },
      { sortOrder: 3, from: "Strasbourg", to: "Frankfurt", depIsHome: false, arrIsHome: false },
      { sortOrder: 4, from: "Frankfurt", to: "Paris", depIsHome: false, arrIsHome: false },
      { sortOrder: 5, from: "Paris", to: "London", depIsHome: false, arrIsHome: false },
      { sortOrder: 6, from: "London", to: "Aghalee", depIsHome: false, arrIsHome: false },
      { sortOrder: 7, from: "Aghalee", to: "Dublin", depIsHome: false, arrIsHome: false },
      { sortOrder: 8, from: "Dublin", to: "Como", depIsHome: false, arrIsHome: false },
      { sortOrder: 9, from: null, to: "Como", depIsHome: false, arrIsHome: false },
      { sortOrder: 10, from: "Como", to: "Milan", depIsHome: false, arrIsHome: false },
      { sortOrder: 11, from: "Milan", to: "Rome", depIsHome: false, arrIsHome: false },
      { sortOrder: 12, from: "Rome", to: null, depIsHome: false, arrIsHome: true },
    ];
    expect(trRows).toHaveLength(13);
    const bySort = new Map(trRows.map((d) => [d.sortOrder as number, d]));
    for (const e of EXPECTED) {
      const d = bySort.get(e.sortOrder);
      const label = `leg #${e.sortOrder}`;
      expect(d, label).toBeTruthy();
      expect(d!.tripId, label).toBe("trip_real");
      expect(d!.fromStopId, label).toBe(e.from === null ? null : stopIdByName.get(e.from));
      expect(d!.toStopId, label).toBe(e.to === null ? null : stopIdByName.get(e.to));
      expect(d!.depIsHome, label).toBe(e.depIsHome);
      expect(d!.arrIsHome, label).toBe(e.arrIsHome);
    }
  });

  it("writes each leg's times as the Date instants the descriptor declares", () => {
    const bySort = new Map(trRows.map((d) => [d.sortOrder as number, d]));
    expect(bySort.get(0)!.depAt).toEqual(new Date("2026-12-04T07:50:00Z"));
    expect(bySort.get(1)!.arrAt).toEqual(new Date("2026-12-06T05:45:00Z"));
    expect(bySort.get(2)!.depAt).toEqual(new Date("2026-12-10T05:51:00Z"));
    expect(bySort.get(8)!.arrAt).toEqual(new Date("2026-12-30T10:45:00Z"));
    expect(bySort.get(12)!.arrAt).toEqual(new Date("2027-01-08T07:30:00Z"));
    // The six unbooked legs must arrive as nulls, not as Invalid Dates.
    for (const sort of [3, 4, 7, 9, 10, 11]) {
      expect(bySort.get(sort)!.depAt, `leg #${sort}`).toBeNull();
      expect(bySort.get(sort)!.arrAt, `leg #${sort}`).toBeNull();
    }
  });

  it("writes 17 costs: 5 on legs, 11 on beds, 1 standalone", () => {
    expect(costRows).toHaveLength(17);
    const count = (ownerType: string) => costRows.filter((d) => d.ownerType === ownerType).length;
    expect(count("TRANSPORT")).toBe(5);
    expect(count("ACCOMMODATION")).toBe(11);
    expect(count("OTHER")).toBe(1);
    expect(count("ITEM")).toBe(0);
    for (const d of costRows) expect(d.tripId).toBe("trip_real");
  });

  it("never attaches a transport cost to an accommodation, or the reverse", () => {
    const trIds = new Set(trIdBySort.values());
    const accIds = new Set(accIdByName.values());
    for (const d of costRows) {
      if (d.ownerType === "TRANSPORT") {
        expect(trIds.has(d.ownerId as string), String(d.ownerId)).toBe(true);
        expect(accIds.has(d.ownerId as string), String(d.ownerId)).toBe(false);
      }
      if (d.ownerType === "ACCOMMODATION") {
        expect(accIds.has(d.ownerId as string), String(d.ownerId)).toBe(true);
        expect(trIds.has(d.ownerId as string), String(d.ownerId)).toBe(false);
      }
      if (d.ownerType === "OTHER") expect(d.ownerId).toBeNull();
    }
  });

  it("prices each leg's cost against the right leg, with its real payment date", () => {
    const EXPECTED: { sortOrder: number; costMinor: number; currency: string; rateToHome: number | null; paidAt: string }[] = [
      { sortOrder: 0, costMinor: 89559, currency: "AUD", rateToHome: null, paidAt: "2026-07-13" },
      { sortOrder: 1, costMinor: 163569, currency: "AUD", rateToHome: null, paidAt: "2026-07-19" },
      { sortOrder: 2, costMinor: 23521, currency: "AUD", rateToHome: null, paidAt: "2026-07-26" },
      { sortOrder: 5, costMinor: 41438, currency: "AUD", rateToHome: null, paidAt: "2026-07-26" },
      { sortOrder: 8, costMinor: 35862, currency: "EUR", rateToHome: 1.63, paidAt: "2026-08-11" },
    ];
    const byOwner = new Map(costRows.filter((d) => d.ownerType === "TRANSPORT").map((d) => [d.ownerId as string, d]));
    expect(byOwner.size).toBe(EXPECTED.length);
    for (const e of EXPECTED) {
      const d = byOwner.get(trIdBySort.get(e.sortOrder)!);
      const label = `leg #${e.sortOrder} cost`;
      expect(d, label).toBeTruthy();
      expect(d!.costMinor, label).toBe(e.costMinor);
      expect(d!.paidMinor, label).toBe(e.costMinor);
      expect(d!.currency, label).toBe(e.currency);
      expect(d!.rateToHome, label).toBe(e.rateToHome);
      expect(d!.paidAt, label).toEqual(new Date(e.paidAt));
    }
  });

  it("prices each bed's cost against the right bed, paid only where it was paid", () => {
    const EXPECTED: { bed: string; costMinor: number; currency: string; rateToHome: number | null; paidAt: string | null }[] = [
      { bed: "1 Bedroom private pool @Kuta", costMinor: 11520, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "B&B Hotel München-Hbf", costMinor: 80609, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "B&B Hotel Kehl", costMinor: 81000, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "Premier Inn Frankfurt City Europaviertel", costMinor: 18700, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "Villa Margaux Opéra Montmartre", costMinor: 91652, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "Zedwell Underground Hotel Tottenham Court Rd", costMinor: 54535, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "Clenaghans", costMinor: 130417, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "Point A Dublin The Liberties", costMinor: 15642, currency: "AUD", rateToHome: null, paidAt: "2026-08-11" },
      { bed: "attico capicci", costMinor: 116873, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "Ibis Milano Centro", costMinor: 16900, currency: "AUD", rateToHome: null, paidAt: null },
      { bed: "The Club Navona", costMinor: 53610, currency: "EUR", rateToHome: 1.63, paidAt: null },
    ];
    const byOwner = new Map(costRows.filter((d) => d.ownerType === "ACCOMMODATION").map((d) => [d.ownerId as string, d]));
    expect(byOwner.size).toBe(EXPECTED.length);
    for (const e of EXPECTED) {
      const d = byOwner.get(accIdByName.get(e.bed)!);
      expect(d, e.bed).toBeTruthy();
      expect(d!.costMinor, e.bed).toBe(e.costMinor);
      expect(d!.currency, e.bed).toBe(e.currency);
      expect(d!.rateToHome, e.bed).toBe(e.rateToHome);
      expect(d!.paidAt, e.bed).toEqual(e.paidAt === null ? null : new Date(e.paidAt));
    }
  });

  it("writes the Rome city tax as a standalone OTHER cost with no owner", () => {
    const other = costRows.find((d) => d.ownerType === "OTHER")!;
    expect(other.ownerId).toBeNull();
    expect(other.label).toBe("Rome city tax");
    expect(other.costMinor).toBe(7000);
    expect(other.currency).toBe("EUR");
    expect(other.rateToHome).toBe(1.63);
    expect(other.paidAt).toBeNull();
  });

  it("converts EUR costs at 1.63 and leaves home-currency costs unconverted", () => {
    for (const d of costRows) {
      expect(d.rateToHome, String(d.currency)).toBe(d.currency === "EUR" ? 1.63 : null);
    }
    expect(costRows.filter((d) => d.currency === "EUR")).toHaveLength(3);
    expect(costRows.filter((d) => d.currency === "AUD")).toHaveLength(14);
  });

  it("never stamps the seed's run clock on a cost — every paid date is a real one", () => {
    for (const d of costRows) {
      expect(d.paidAt, String(d.ownerType)).not.toEqual(RUN_CLOCK);
    }
    expect(costRows.filter((d) => d.paidAt !== null)).toHaveLength(6);
  });

  it("seeds the single EUR→AUD rate the euro costs convert through", () => {
    expect(exchangeRateCreateMock).toHaveBeenCalledTimes(1);
    expect(dataOf(exchangeRateCreateMock)[0]).toEqual({
      tripId: "trip_real",
      base: "EUR",
      quote: "AUD",
      rate: 1.63,
      manual: true,
      fetchedAt: new Date("2026-09-10T00:00:00.000Z"),
    });
  });

  it("writes nothing the real trip does not have — no chapters, items, votes or checklist", () => {
    expect(chapterCreateMock).not.toHaveBeenCalled();
    expect(itemCreateMock).not.toHaveBeenCalled();
    expect(voteCreateMock).not.toHaveBeenCalled();
    expect(checklistItemCreateMock).not.toHaveBeenCalled();
    // No cover gradient on the real trip, so no second write to the trip row.
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("deletes nothing — the write path is purely additive", () => {
    expect(tripDeleteMock).not.toHaveBeenCalled();
    expect(attachmentFindManyMock).not.toHaveBeenCalled();
    expect(tripLookupsDuringPersist).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// wipeRealTrip (ARCH-DAT-3, fix round 1, C1)
// ---------------------------------------------------------------------------

describe("wipeRealTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schedules attachment AND cover blobs for retention instead of destroying them, then deletes the trip row", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "trip_real", coverImageKey: "trips/trip_real/cover.jpg" },
    ]);
    attachmentFindManyMock.mockResolvedValueOnce([
      { storageKey: "trips/trip_real/a.pdf" },
      { storageKey: "trips/trip_real/b.png" },
    ]);
    tripDeleteMock.mockResolvedValue({});

    await wipeRealTrip();

    // I7 (final fix wave): the lookup used to be `select: { id: true }`, so
    // the cover blob persistRealTrip writes was never scheduled — every wipe
    // orphaned one more cover object with no DeletedBlob record behind it.
    expect(findManyMock).toHaveBeenCalledWith({
      where: { name: REAL_TRIP_NAME },
      select: { id: true, coverImageKey: true },
    });
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([
      "trips/trip_real/cover.jpg",
      "trips/trip_real/a.pdf",
      "trips/trip_real/b.png",
    ]);
    expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: "trip_real" } });
    // Blobs scheduled before the row that justified deleting them is gone.
    expect(scheduleBlobDeletionMock.mock.invocationCallOrder[0]).toBeLessThan(
      tripDeleteMock.mock.invocationCallOrder[0],
    );
  });

  it("is a no-op on a fresh DB — no matching trip", async () => {
    findManyMock.mockResolvedValueOnce([]);

    await wipeRealTrip();

    expect(attachmentFindManyMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
    expect(tripDeleteMock).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });
});
