import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { readWhatsNewSeen, readWelcomeState } from "@/lib/traveller-reads";
import { readSketchingPlan } from "@/lib/sketch-reads";

// Real Postgres (npm run test:integration): the selects moved out of
// WhatsNewBanner, WelcomeGate and PhaseSketching (card 3.N) are ones Postgres
// accepts, and the Sketching read keeps the Fork's rows out.
const USER = "it-home-user";
const TRIP_ID = "it-home-trip";
const FORK_ID = "it-home-fork";

describe.skipIf(process.env.INTEGRATION !== "1")("home reads (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: USER },
      update: { whatsNewSeenAt: null, welcomeSeenAt: null, displayName: "Xanthia" },
      create: { id: USER, email: "home-reads@example.test", name: "Home IT", displayName: "Xanthia" },
    });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades members, forks, stops, chapters
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Home", homeCurrency: "AUD", createdById: USER, members: { create: { userId: USER, role: "owner" } } },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.chapter.createMany({
      data: [
        { id: "it-home-ch-real", tripId: TRIP_ID, name: "IT North", colour: "sky" },
        { id: "it-home-ch-fork", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Fork chapter", colour: "sky" },
      ],
    });
    await db.stop.createMany({
      data: [
        { id: "it-home-porto", tripId: TRIP_ID, name: "IT Porto", nights: 3, sortOrder: 1, chapterId: "it-home-ch-real", chapterSortOrder: 0 },
        { id: "it-home-lisbon", tripId: TRIP_ID, name: "IT Lisbon", nights: 2, sortOrder: 0 },
        { id: "it-home-seville", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Seville", nights: 4, sortOrder: 0 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("readWhatsNewSeen and readWelcomeState read the Traveller's row", async () => {
    expect(await readWhatsNewSeen(USER)).toMatchObject({ whatsNewSeenAt: null, createdAt: expect.any(Date) });
    expect(await readWelcomeState(USER)).toEqual({ welcomeSeenAt: null, name: "Home IT", displayName: "Xanthia" });
    expect(await readWelcomeState("it-home-nobody")).toBeNull();
  });

  it("readSketchingPlan reads the real plan only, chapter order then plan order", async () => {
    const { stops, chapters } = await readSketchingPlan(TRIP_ID, true);
    expect(stops.map((s) => s.name)).toEqual(["IT Lisbon", "IT Porto"]);
    expect(chapters.map((c) => c.name)).toEqual(["IT North"]);
    expect((await readSketchingPlan(TRIP_ID, false)).chapters).toEqual([]);
  });
});
