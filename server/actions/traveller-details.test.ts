import { afterEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, requireTripAccessMock, upsertMock, updateManyMock, revalidatePathMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireTripAccessMock: vi.fn(),
  upsertMock: vi.fn(),
  updateManyMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock, requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({ db: { travellerDetails: { upsert: upsertMock }, tripMember: { updateMany: updateManyMock } } }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { saveTravellerDetails, saveTravelNumber } from "@/server/actions/traveller-details";

afterEach(() => vi.clearAllMocks());

describe("saveTravellerDetails", () => {
  it("upserts the viewer's own row with trimmed values and nulls", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    upsertMock.mockResolvedValue({});
    const result = await saveTravellerDetails({ mobile: " 0400 ", emergencyName: "Mum", emergencyPhone: "", bankDetails: "BSB 000-000 Acc 1" });
    expect(result).toEqual({ success: true });
    const data = { mobile: "0400", emergencyName: "Mum", emergencyPhone: null, bankDetails: "BSB 000-000 Acc 1" };
    expect(upsertMock).toHaveBeenCalledWith({ where: { userId: "u1" }, create: { userId: "u1", ...data }, update: data });
    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
  });

  it("returns field errors and writes nothing when a value is too long", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await saveTravellerDetails({ bankDetails: "b".repeat(501) });
    expect(result.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user first", async () => {
    requireUserMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveTravellerDetails({})).rejects.toThrow("NEXT_REDIRECT");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("saveTravelNumber", () => {
  it("writes only the viewer's membership row on that trip", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
    updateManyMock.mockResolvedValue({ count: 1 });
    const result = await saveTravelNumber("t1", " +39 333 1234567 ");
    expect(result).toEqual({ success: true });
    expect(updateManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u1" }, data: { travelNumber: "+39 333 1234567" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/t1/settings");
  });

  it("empty clears it", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
    await saveTravelNumber("t1", "   ");
    expect(updateManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u1" }, data: { travelNumber: null } });
  });

  it("refuses a non-member before writing", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(saveTravelNumber("t1", "x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
