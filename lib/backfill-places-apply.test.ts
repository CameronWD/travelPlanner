import { beforeEach, describe, expect, it, vi } from "vitest";

const { itemFindUnique, itemUpdate, fetchVenueDetails } = vi.hoisted(() => ({
  itemFindUnique: vi.fn(),
  itemUpdate: vi.fn(),
  fetchVenueDetails: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    item: { findUnique: itemFindUnique, update: itemUpdate },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({ item: { update: itemUpdate } }),
  },
}));
vi.mock("@/lib/geocode", () => ({ fetchVenueDetails }));
vi.mock("@/lib/item-family", () => ({ itemFamilyRecipientsForSave: vi.fn(), writeItemFamily: vi.fn() }));

import { fillItemDetails } from "./backfill-places-apply";

const ROW = { id: "i1", tripId: "t1", sourceItemId: null, stopId: null, openingHours: null, link: null };

describe("fillItemDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemFindUnique.mockResolvedValue(ROW);
  });

  it("stamps statusCheckedAt when it writes a business status", async () => {
    fetchVenueDetails.mockResolvedValue({ openingHours: null, website: null, businessStatus: "CLOSED_PERMANENTLY" });
    await fillItemDetails("i1", "place-1");
    const data = itemUpdate.mock.calls[0][0].data;
    expect(data.businessStatus).toBe("CLOSED_PERMANENTLY");
    expect(data.statusCheckedAt).toBeInstanceOf(Date);
  });

  it("leaves both untouched when Google gave no status", async () => {
    fetchVenueDetails.mockResolvedValue({ openingHours: null, website: null, businessStatus: null });
    await fillItemDetails("i1", "place-1");
    const data = itemUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("businessStatus");
    expect(data).not.toHaveProperty("statusCheckedAt");
  });
});
