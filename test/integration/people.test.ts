import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { requireAdminMock } = vi.hoisted(() => ({ requireAdminMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/guards", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireAdmin: requireAdminMock,
}));

type DbModule = typeof import("@/lib/db");

const OWNER_ID = "people-owner";
const GUEST_ID = "people-guest";
const STRANGER_ID = "people-stranger";
const OWNER = "owner@people.test";
const GUEST = "guest@people.test";
const WAITING = "waiting@people.test";
const STRANGER = "stranger@people.test";
const TRIP_ID = "people-trip";
const SESSION_AT = new Date("2026-10-01T09:00:00.000Z");

describe.skipIf(process.env.INTEGRATION !== "1")("People list (real Postgres)", () => {
  let db: DbModule["db"];
  let listPeople: typeof import("@/server/actions/people").listPeople;

  async function clean() {
    await db.invite.deleteMany({ where: { tripId: TRIP_ID } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.authSession.deleteMany({ where: { userId: { in: [OWNER_ID, GUEST_ID, STRANGER_ID] } } });
    await db.user.deleteMany({ where: { id: { in: [OWNER_ID, GUEST_ID, STRANGER_ID] } } });
    await db.allowedEmail.deleteMany({ where: { email: { in: [OWNER, GUEST, WAITING] } } });
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ listPeople } = await import("@/server/actions/people"));
    requireAdminMock.mockResolvedValue({ id: "admin", email: "admin@people.test" });
    await clean();

    await db.user.create({ data: { id: OWNER_ID, email: OWNER, name: "Olive Owner", isEmailVerified: true } });
    await db.user.create({ data: { id: GUEST_ID, email: GUEST, name: "Gus Guest", isEmailVerified: true } });
    await db.user.create({ data: { id: STRANGER_ID, email: STRANGER, name: "Sam Stranger", isEmailVerified: true } });
    await db.allowedEmail.createMany({
      data: [
        { email: OWNER, note: "Approved from an Access request" },
        { email: GUEST, note: "admitted by Trip Invite" },
        { email: WAITING, note: "Approved from an Access request" },
      ],
    });
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "People Trip",
        homeCurrency: "AUD",
        createdById: OWNER_ID,
        members: {
          create: [
            { userId: OWNER_ID, role: "owner" },
            { userId: GUEST_ID, role: "member" },
          ],
        },
      },
    });
    await db.invite.create({
      data: { tripId: TRIP_ID, email: GUEST, token: "people-invite-token", acceptedAt: new Date("2026-09-01T00:00:00.000Z") },
    });
    await db.authSession.create({
      data: { userId: OWNER_ID, token: "people-session-token", expiresAt: new Date("2030-01-01"), updatedAt: SESSION_AT },
    });
  });

  afterAll(async () => {
    await clean();
  });

  it("unions admitted addresses and accounts with status, source, trip counts and last seen", async () => {
    const people = await listPeople();
    const byEmail = new Map(people.map((p) => [p.email, p]));

    expect(byEmail.get(OWNER)).toMatchObject({
      status: "access",
      source: { kind: "approved" },
      tripsOwned: 1,
      tripsOn: 0,
      lastSeenAt: SESSION_AT.toISOString(),
      name: "Olive Owner",
    });
    expect(byEmail.get(GUEST)).toMatchObject({
      status: "access",
      source: { kind: "invited", tripName: "People Trip", ownerName: "Olive Owner" },
      tripsOwned: 0,
      tripsOn: 1,
      lastSeenAt: null,
    });
    expect(byEmail.get(WAITING)).toMatchObject({ status: "never-signed-up", userId: null });
    expect(byEmail.get(STRANGER)).toMatchObject({ status: "no-access", revokeId: null });
    expect(byEmail.get(GUEST)!.revokeId).toBeTruthy();
  });
});
