import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { assignTripSlug } from "@/lib/trip-slug-store";
import { resolveTripRef } from "@/lib/trip-ref";

// Real Postgres (INTEGRATION=1, local docker DB). Review focus 3.
const USER = "it-slug-user";
const IDS = ["it-slug-a", "it-slug-b", "it-slug-c"];

async function makeTrip(id: string, name: string) {
  await db.trip.create({ data: { id, name, homeCurrency: "AUD", createdById: USER } });
  return db.$transaction((tx) => assignTripSlug(tx, id, name));
}

describe.skipIf(process.env.INTEGRATION !== "1")("assignTripSlug (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "slug@example.test", name: "Slug IT" } });
  });
  beforeEach(async () => {
    await db.tripSlug.deleteMany({ where: { slug: { startsWith: "it-slug-" } } });
    await db.trip.deleteMany({ where: { id: { in: IDS } } });
  });
  afterAll(async () => {
    await db.tripSlug.deleteMany({ where: { slug: { startsWith: "it-slug-" } } });
    await db.trip.deleteMany({ where: { id: { in: IDS } } });
  });

  it("derives from the name and records the slug in history", async () => {
    expect(await makeTrip("it-slug-a", "IT Slug Paris")).toBe("it-slug-paris");
    expect((await db.trip.findUnique({ where: { id: "it-slug-a" } }))?.slug).toBe("it-slug-paris");
    expect((await db.tripSlug.findUnique({ where: { slug: "it-slug-paris" } }))?.tripId).toBe("it-slug-a");
  });

  it("a clash takes -2", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    expect(await makeTrip("it-slug-b", "IT Slug Paris")).toBe("it-slug-paris-2");
  });

  it("a rename re-derives; the old slug stays in history and no other Trip can take it", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.trip.update({ where: { id: "it-slug-a" }, data: { name: "IT Slug Rome" } });
    expect(await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Rome"))).toBe("it-slug-rome");
    expect(await makeTrip("it-slug-b", "IT Slug Paris")).toBe("it-slug-paris-2");
  });

  it("renaming back to an own old slug reuses it", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Rome"));
    expect(await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Paris"))).toBe("it-slug-paris");
    expect(await db.tripSlug.count({ where: { tripId: "it-slug-a" } })).toBe(2);
  });

  it("a deleted Trip's slugs stay reserved", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.trip.delete({ where: { id: "it-slug-a" } });
    expect((await db.tripSlug.findUnique({ where: { slug: "it-slug-paris" } }))?.tripId).toBeNull();
    expect(await makeTrip("it-slug-b", "IT Slug Paris")).toBe("it-slug-paris-2");
  });

  it("resolveTripRef: current slug, old slug, id; a deleted Trip's old slug resolves to nothing", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Rome"));
    expect(await resolveTripRef("it-slug-rome")).toEqual({ id: "it-slug-a", slug: "it-slug-rome" });
    expect(await resolveTripRef("it-slug-paris")).toEqual({ id: "it-slug-a", slug: "it-slug-rome" });
    expect(await resolveTripRef("it-slug-a")).toEqual({ id: "it-slug-a", slug: "it-slug-rome" });
    expect(await resolveTripRef("it-slug-nope")).toBeNull();
    await db.trip.delete({ where: { id: "it-slug-a" } });
    expect(await resolveTripRef("it-slug-paris")).toBeNull();
  });
});
