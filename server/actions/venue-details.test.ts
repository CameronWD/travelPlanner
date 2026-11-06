import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const { requireTripAccessMock, takeGoogleQuotaMock, fetchVenueDetailsMock, hasServerKeyMock } = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  takeGoogleQuotaMock: vi.fn(),
  fetchVenueDetailsMock: vi.fn(),
  hasServerKeyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/google-usage", () => ({ takeGoogleQuota: takeGoogleQuotaMock }));
vi.mock("@/lib/geocode", () => ({ fetchVenueDetails: fetchVenueDetailsMock, hasServerKey: hasServerKeyMock }));

import { venueDetailsForPick } from "./venue-details";

const DETAILS = { openingHours: null, website: "https://x.test", businessStatus: "OPERATIONAL" };

describe("venueDetailsForPick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasServerKeyMock.mockReturnValue(true);
    takeGoogleQuotaMock.mockResolvedValue(true);
    fetchVenueDetailsMock.mockResolvedValue(DETAILS);
  });

  it("returns the venue's details under the venue-details cap of 33", async () => {
    expect(await venueDetailsForPick("trip-1", "ChIJ1")).toEqual(DETAILS);
    expect(takeGoogleQuotaMock).toHaveBeenCalledWith("venue-details", 33);
    expect(fetchVenueDetailsMock).toHaveBeenCalledWith("ChIJ1");
  });

  it("checks trip access before spending the quota", async () => {
    await venueDetailsForPick("trip-1", "ChIJ1");
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, takeGoogleQuotaMock);
  });

  it("refuses the 16th call of the day without calling Google", async () => {
    takeGoogleQuotaMock.mockResolvedValueOnce(false);
    expect(await venueDetailsForPick("trip-1", "ChIJ1")).toBeNull();
    expect(fetchVenueDetailsMock).not.toHaveBeenCalled();
  });

  it("never reaches Google for a trip the caller can't access", async () => {
    requireTripAccessMock.mockRejectedValueOnce(new Error("NOT_FOUND"));
    await expect(venueDetailsForPick("trip-2", "ChIJ1")).rejects.toThrow("NOT_FOUND");
    expect(takeGoogleQuotaMock).not.toHaveBeenCalled();
    expect(fetchVenueDetailsMock).not.toHaveBeenCalled();
  });

  it("keyless, returns null without taking the quota or calling Google", async () => {
    hasServerKeyMock.mockReturnValue(false);
    expect(await venueDetailsForPick("trip-1", "ChIJ1")).toBeNull();
    expect(takeGoogleQuotaMock).not.toHaveBeenCalled();
    expect(fetchVenueDetailsMock).not.toHaveBeenCalled();
  });

  it("is null for a blank place ID without spending the quota", async () => {
    expect(await venueDetailsForPick("trip-1", "")).toBeNull();
    expect(takeGoogleQuotaMock).not.toHaveBeenCalled();
  });
});
