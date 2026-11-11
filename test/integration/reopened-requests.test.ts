import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { requireAdminMock } = vi.hoisted(() => ({ requireAdminMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/guards", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireAdmin: requireAdminMock,
}));

type DbModule = typeof import("@/lib/db");

const OWNER_ID = "reopened-owner";
const OWNER = "owner@reopened.test";
const TRIP_ID = "reopened-trip";
const DELETED_TRIP_ID = "reopened-trip-deleted";
const FIRST = "first@reopened.test";
const EARLY = "early@reopened.test";
const GONE = "gone@reopened.test";
const FRESH = "fresh@reopened.test";
const EMAILS = [FIRST, EARLY, GONE, FRESH];
const T0 = new Date("2026-11-01T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe.skipIf(process.env.INTEGRATION !== "1")("Reopened requests (real Postgres)", () => {
  let db: DbModule["db"];
  let actions: typeof import("@/server/actions/access-requests");
  let countAdminQueue: typeof import("@/lib/admin-queue-loader").countAdminQueue;

  async function clean() {
    await db.invite.deleteMany({ where: { tripId: { in: [TRIP_ID, DELETED_TRIP_ID] } } });
    await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, DELETED_TRIP_ID] } } });
    await db.user.deleteMany({ where: { id: OWNER_ID } });
    await db.accessRequest.deleteMany({ where: { email: { in: EMAILS } } });
    await db.allowedEmail.deleteMany({ where: { email: { in: EMAILS } } });
  }

  const dismissed = (email: string) =>
    db.accessRequest.create({ data: { email, status: "dismissed", resolvedAt: T0, createdAt: new Date(T0.getTime() - HOUR) } });
  const invite = (tripId: string, email: string, createdAt: Date, token: string) =>
    db.invite.create({ data: { tripId, email, token, createdAt } });

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    actions = await import("@/server/actions/access-requests");
    ({ countAdminQueue } = await import("@/lib/admin-queue-loader"));
    requireAdminMock.mockResolvedValue({ id: "admin", email: "admin@reopened.test" });
    await clean();

    await db.user.create({ data: { id: OWNER_ID, email: OWNER, name: "Olive Owner", isEmailVerified: true } });
    for (const [id, deletedAt] of [[TRIP_ID, null], [DELETED_TRIP_ID, new Date()]] as const) {
      await db.trip.create({
        data: {
          id,
          name: id,
          homeCurrency: "AUD",
          createdById: OWNER_ID,
          deletedAt,
          members: { create: [{ userId: OWNER_ID, role: "owner" }] },
        },
      });
    }
  });

  afterAll(async () => {
    await clean();
  });

  it("surfaces, counts, re-dismisses and approves reopened requests", async () => {
    const baseline = (await countAdminQueue()).accessRequests;

    const first = await dismissed(FIRST);
    await invite(TRIP_ID, FIRST, new Date(T0.getTime() + HOUR), "reopened-t1");
    await dismissed(EARLY);
    await invite(TRIP_ID, EARLY, new Date(T0.getTime() - HOUR), "reopened-t2");
    await dismissed(GONE);
    await invite(DELETED_TRIP_ID, GONE, new Date(T0.getTime() + HOUR), "reopened-t3");

    const list = await actions.listAccessRequests();
    const byEmail = new Map(list.map((r) => [r.email, r]));
    expect(byEmail.get(FIRST)).toMatchObject({ dismissedEarlier: true, invitedTo: [{ tripName: TRIP_ID, ownerName: expect.any(String) }] });
    expect(byEmail.has(EARLY)).toBe(false);
    expect(byEmail.has(GONE)).toBe(false);
    expect((await countAdminQueue()).accessRequests).toBe(baseline + 1);

    expect((await actions.dismissAccessRequest(first.id)).success).toBe(true);
    expect((await actions.listAccessRequests()).some((r) => r.email === FIRST)).toBe(false);
    expect((await countAdminQueue()).accessRequests).toBe(baseline);

    const fresh = await dismissed(FRESH);
    await invite(TRIP_ID, FRESH, new Date(T0.getTime() + HOUR), "reopened-t4");
    expect((await actions.approveAccessRequest(fresh.id)).success).toBe(true);
    expect(await db.allowedEmail.findUnique({ where: { email: FRESH } })).not.toBeNull();
    expect(await db.accessRequest.findUnique({ where: { id: fresh.id } })).toMatchObject({ status: "pending" });
    expect((await actions.listAccessRequests()).some((r) => r.email === FRESH)).toBe(false);
  });
});
