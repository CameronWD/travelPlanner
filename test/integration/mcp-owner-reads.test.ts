import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loadSurpriseVisibility, NO_SURPRISES } from "@/lib/surprise-visibility";
import { readMcpNotes } from "@/lib/mcp/reads/notes";

// Real Postgres (npm run test:integration), spec 2026-10-16 F2/F6/F7: the
// Claude connection's reads narrowed to one row or one owner. Each narrow
// query is the same query get_notes / list_costs / get_trip_plan run, plus a
// `where`; this pins that the `where` reaches Postgres and selects the right
// rows. The guards and the narrow tools are covered in mcp-narrow-reads.
const OWNER = "it-or-owner";
const TRIP_ID = "it-or-trip";

describe.skipIf(process.env.INTEGRATION !== "1")("MCP reads for one row or owner (real Postgres)", () => {
  let itemId = "";
  let stopId = "";
  const noteIds: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "or-owner@example.test", name: "OR Owner" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT owner reads", homeCurrency: "AUD", createdById: OWNER, members: { create: { userId: OWNER, role: "owner" } } },
    });
    stopId = (await db.stop.create({ data: { tripId: TRIP_ID, name: "IT Porto", sortOrder: 0 } })).id;
    itemId = (await db.item.create({ data: { tripId: TRIP_ID, title: "IT Port tasting", category: "ACTIVITY", stopId } })).id;
    for (const [i, n] of [
      { targetType: "ITEM", targetId: itemId, body: "IT Book ahead" },
      { targetType: "STOP", targetId: stopId, body: "IT Parking is hard" },
      { targetType: "ITEM", targetId: itemId, body: "IT Bring cash" },
    ].entries()) {
      const note = await db.note.create({
        data: { tripId: TRIP_ID, authorId: OWNER, ...n, createdAt: new Date(Date.UTC(2026, 9, 16, 9, i)) },
      });
      noteIds.push(note.id);
    }
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  describe("readMcpNotes", () => {
    it("reads every Note on the Trip oldest first, in get_notes' shape", async () => {
      const v = await loadSurpriseVisibility(TRIP_ID, OWNER);
      const notes = await readMcpNotes(TRIP_ID, v);
      expect(notes.map((n) => n.id)).toEqual(noteIds);
      expect(notes[0]).toEqual({
        id: noteIds[0], targetType: "ITEM", targetId: itemId, body: "IT Book ahead",
        author: "OR Owner", createdAt: "2026-10-16T09:00:00.000Z",
      });
    });

    it("narrows to one Note by id", async () => {
      const notes = await readMcpNotes(TRIP_ID, NO_SURPRISES, { id: noteIds[1] });
      expect(notes).toEqual([expect.objectContaining({ id: noteIds[1], targetType: "STOP", body: "IT Parking is hard" })]);
    });

    it("narrows to the Notes on one thing", async () => {
      const notes = await readMcpNotes(TRIP_ID, NO_SURPRISES, { targetType: "ITEM", targetId: itemId });
      expect(notes.map((n) => n.body)).toEqual(["IT Book ahead", "IT Bring cash"]);
    });

    it("never reads another Trip's Note, even by id", async () => {
      expect(await readMcpNotes("it-or-no-such-trip", NO_SURPRISES, { id: noteIds[0] })).toEqual([]);
    });
  });
});
