import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/globe", () => ({
  requireGlobeAccess: vi.fn(async () => ({ user: { id: "u1" }, globe: { id: "g1" } })),
}));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/geocode", () => ({
  searchPlaces: vi.fn(),
  reverseGeocode: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    marker: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    globeInvite: { create: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { createMarker, updateMarker, deleteMarker, inviteToGlobe } from "./globe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbm = db as any;
beforeEach(() => vi.clearAllMocks());

describe("createMarker", () => {
  it("rejects an invalid marker without touching the db", async () => {
    const res = await createMarker({ title: "", category: "OTHER" });
    expect(res.success).toBe(false);
    expect(dbm.marker.create).not.toHaveBeenCalled();
  });

  it("creates a marker on the user's globe", async () => {
    dbm.marker.create.mockResolvedValue({ id: "m1" });
    const res = await createMarker({
      title: "Tokyo Tower",
      category: "SIGHTSEEING",
      lat: 35.6,
      lng: 139.7,
      city: "Tokyo",
      country: "Japan",
      countryCode: "jp",
    });
    expect(res.success).toBe(true);
    expect(dbm.marker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ globeId: "g1", createdById: "u1", title: "Tokyo Tower" }),
      }),
    );
  });
});

describe("updateMarker", () => {
  it("404s (throws) when the marker is on another globe", async () => {
    dbm.marker.findUnique.mockResolvedValue({ id: "m1", globeId: "OTHER" });
    await expect(updateMarker("m1", { title: "X", category: "OTHER" })).rejects.toBeDefined();
    expect(dbm.marker.update).not.toHaveBeenCalled();
  });

  it("updates a marker on the user's globe", async () => {
    dbm.marker.findUnique.mockResolvedValue({ id: "m1", globeId: "g1" });
    dbm.marker.update.mockResolvedValue({ id: "m1" });
    const res = await updateMarker("m1", { title: "New", category: "FOOD" });
    expect(res.success).toBe(true);
    expect(dbm.marker.update).toHaveBeenCalled();
  });
});

describe("deleteMarker", () => {
  it("deletes a marker on the user's globe", async () => {
    dbm.marker.findUnique.mockResolvedValue({ id: "m1", globeId: "g1" });
    dbm.marker.delete.mockResolvedValue({ id: "m1" });
    const res = await deleteMarker("m1");
    expect(res.success).toBe(true);
    expect(dbm.marker.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});

describe("inviteToGlobe", () => {
  it("rejects an invalid email", async () => {
    const res = await inviteToGlobe("not-an-email");
    expect(res.success).toBe(false);
    expect(dbm.globeInvite.create).not.toHaveBeenCalled();
  });

  it("creates a pending invite on the user's globe (lowercased email)", async () => {
    dbm.globeInvite.create.mockResolvedValue({ id: "i1" });
    const res = await inviteToGlobe("Partner@Example.com");
    expect(res.success).toBe(true);
    expect(dbm.globeInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ globeId: "g1", email: "partner@example.com" }),
      }),
    );
  });
});
