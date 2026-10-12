import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  stopFindUniqueMock,
  itemFindUniqueMock,
  accommodationFindUniqueMock,
  costFindUniqueMock,
  noteFindUniqueMock,
  attachmentFindUniqueMock,
  reminderFindUniqueMock,
  dayTitleFindUniqueMock,
} = vi.hoisted(() => ({
  stopFindUniqueMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  accommodationFindUniqueMock: vi.fn(),
  costFindUniqueMock: vi.fn(),
  noteFindUniqueMock: vi.fn(),
  attachmentFindUniqueMock: vi.fn(),
  reminderFindUniqueMock: vi.fn(),
  dayTitleFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findUnique: stopFindUniqueMock },
    item: { findUnique: itemFindUniqueMock },
    accommodation: { findUnique: accommodationFindUniqueMock },
    cost: { findUnique: costFindUniqueMock },
    note: { findUnique: noteFindUniqueMock },
    attachment: { findUnique: attachmentFindUniqueMock },
    reminder: { findUnique: reminderFindUniqueMock },
    dayTitle: { findUnique: dayTitleFindUniqueMock },
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import type { SurpriseColumns } from "./surprise";
import { requireOutsideSurprise, surpriseRootFor, surpriseRootForEntity } from "./surprise-guard";

const NOW = new Date("2026-06-15T12:00:00.000Z");

const PLAIN: SurpriseColumns = { surprisePlannerId: null, surpriseForIds: null, surpriseRevealedAt: null };
const LIVE: SurpriseColumns = { surprisePlannerId: "cam", surpriseForIds: '["sam"]', surpriseRevealedAt: null };

function stopRow(id: string, surprise = PLAIN) {
  return { id, departDate: "2026-06-20", timezone: "UTC", ...surprise };
}
function itemRow(id: string, stopId: string | null, surprise = PLAIN) {
  return { id, stopId, date: "2026-06-18", ...surprise, stop: stopId ? { timezone: "UTC" } : null };
}

beforeEach(() => {
  vi.clearAllMocks();
  stopFindUniqueMock.mockResolvedValue(null);
  itemFindUniqueMock.mockResolvedValue(null);
  accommodationFindUniqueMock.mockResolvedValue(null);
  costFindUniqueMock.mockResolvedValue(null);
});

describe("surpriseRootFor / requireOutsideSurprise", () => {
  it("{ stopId } on a live Surprise Stop: root is the Stop, the surprised are refused, others get the root", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", LIVE));
    expect(await surpriseRootFor({ stopId: "stop-1" }, NOW)).toEqual({ type: "STOP", id: "stop-1" });
    await expect(requireOutsideSurprise("sam", { stopId: "stop-1" }, NOW)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await requireOutsideSurprise("cam", { stopId: "stop-1" }, NOW)).toEqual({ type: "STOP", id: "stop-1" });
  });

  it("{ itemId }: an Item that is itself a Surprise is the root", async () => {
    itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1", LIVE));
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1"));
    expect(await surpriseRootFor({ itemId: "item-1" }, NOW)).toEqual({ type: "ITEM", id: "item-1" });
    await expect(requireOutsideSurprise("sam", { itemId: "item-1" }, NOW)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  describe("a Surprise Item inside a Surprise Stop", () => {
    const FOR_CAM: SurpriseColumns = { surprisePlannerId: "pat", surpriseForIds: '["cam"]', surpriseRevealedAt: null };
    const FOR_SAM: SurpriseColumns = { surprisePlannerId: "pat", surpriseForIds: '["sam"]', surpriseRevealedAt: null };

    it("refuses a viewer surprised by the Stop only", async () => {
      itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1", FOR_CAM));
      stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", FOR_SAM));
      await expect(requireOutsideSurprise("sam", { itemId: "item-1" }, NOW)).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("refuses a viewer surprised by the Item only", async () => {
      itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1", FOR_SAM));
      stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", FOR_CAM));
      await expect(requireOutsideSurprise("sam", { itemId: "item-1" }, NOW)).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("returns the Item as the root to a viewer surprised by neither", async () => {
      itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1", FOR_CAM));
      stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", FOR_SAM));
      expect(await requireOutsideSurprise("pat", { itemId: "item-1" }, NOW)).toEqual({ type: "ITEM", id: "item-1" });
      expect(await surpriseRootFor({ itemId: "item-1" }, NOW)).toEqual({ type: "ITEM", id: "item-1" });
    });
  });

  it("{ itemId }: a plain Item inside a Surprise Stop resolves to the Stop", async () => {
    itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1"));
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", LIVE));
    expect(await surpriseRootFor({ itemId: "item-1" }, NOW)).toEqual({ type: "STOP", id: "stop-1" });
    await expect(requireOutsideSurprise("sam", { itemId: "item-1" }, NOW)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("{ itemId }: plain Item in a plain Stop is null", async () => {
    itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1"));
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1"));
    expect(await surpriseRootFor({ itemId: "item-1" }, NOW)).toBeNull();
    expect(await requireOutsideSurprise("sam", { itemId: "item-1" }, NOW)).toBeNull();
  });

  it("{ accommodationId } resolves through its stopId", async () => {
    accommodationFindUniqueMock.mockResolvedValue({ stopId: "stop-1" });
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", LIVE));
    expect(await surpriseRootFor({ accommodationId: "acc-1" }, NOW)).toEqual({ type: "STOP", id: "stop-1" });
    expect(stopFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "stop-1" } }));
    await expect(requireOutsideSurprise("sam", { accommodationId: "acc-1" }, NOW)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("{ target } TRIP and TRANSPORT are null without querying", async () => {
    expect(await surpriseRootFor({ target: { targetType: "TRIP", targetId: "trip-1" } }, NOW)).toBeNull();
    expect(await surpriseRootFor({ target: { targetType: "TRANSPORT", targetId: "tr-1" } }, NOW)).toBeNull();
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
    expect(itemFindUniqueMock).not.toHaveBeenCalled();
    expect(accommodationFindUniqueMock).not.toHaveBeenCalled();
  });

  it("{ target } STOP / ITEM / ACCOMMODATION resolve", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", LIVE));
    itemFindUniqueMock.mockResolvedValue(itemRow("item-1", null, LIVE));
    accommodationFindUniqueMock.mockResolvedValue({ stopId: "stop-1" });
    expect(await surpriseRootFor({ target: { targetType: "STOP", targetId: "stop-1" } }, NOW)).toEqual({ type: "STOP", id: "stop-1" });
    expect(await surpriseRootFor({ target: { targetType: "ITEM", targetId: "item-1" } }, NOW)).toEqual({ type: "ITEM", id: "item-1" });
    expect(await surpriseRootFor({ target: { targetType: "ACCOMMODATION", targetId: "acc-1" } }, NOW)).toEqual({ type: "STOP", id: "stop-1" });
  });

  it("{ costOwner } ITEM resolves through the Item; TRANSPORT / OTHER are null", async () => {
    itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1"));
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", LIVE));
    expect(await surpriseRootFor({ costOwner: { ownerType: "ITEM", ownerId: "item-1" } }, NOW)).toEqual({ type: "STOP", id: "stop-1" });
    vi.clearAllMocks();
    expect(await surpriseRootFor({ costOwner: { ownerType: "TRANSPORT", ownerId: "tr-1" } }, NOW)).toBeNull();
    expect(await surpriseRootFor({ costOwner: { ownerType: "OTHER", ownerId: null } }, NOW)).toBeNull();
    expect(itemFindUniqueMock).not.toHaveBeenCalled();
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
  });

  it("a revealed Surprise is null everywhere", async () => {
    const REVEALED: SurpriseColumns = { ...LIVE, surpriseRevealedAt: new Date("2026-06-10T00:00:00.000Z") };
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", REVEALED));
    itemFindUniqueMock.mockResolvedValue(itemRow("item-1", "stop-1", REVEALED));
    accommodationFindUniqueMock.mockResolvedValue({ stopId: "stop-1" });
    expect(await surpriseRootFor({ stopId: "stop-1" }, NOW)).toBeNull();
    expect(await surpriseRootFor({ itemId: "item-1" }, NOW)).toBeNull();
    expect(await surpriseRootFor({ accommodationId: "acc-1" }, NOW)).toBeNull();
    expect(await requireOutsideSurprise("sam", { stopId: "stop-1" }, NOW)).toBeNull();
    expect(await requireOutsideSurprise("sam", { itemId: "item-1" }, NOW)).toBeNull();
  });

  it("an automatically revealed Surprise (past its departDate) is null", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...stopRow("stop-1", LIVE), departDate: "2026-06-10" });
    expect(await requireOutsideSurprise("sam", { stopId: "stop-1" }, NOW)).toBeNull();
  });

  it("{ stopId: null } is null without querying", async () => {
    expect(await surpriseRootFor({ stopId: null }, NOW)).toBeNull();
    expect(await requireOutsideSurprise("sam", { stopId: undefined }, NOW)).toBeNull();
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
  });

  it("a missing row is null", async () => {
    expect(await surpriseRootFor({ stopId: "gone" }, NOW)).toBeNull();
    expect(await surpriseRootFor({ itemId: "gone" }, NOW)).toBeNull();
  });
});

describe("surpriseRootForEntity", () => {
  beforeEach(() => {
    stopFindUniqueMock.mockResolvedValue(stopRow("stop-1", LIVE));
  });

  it("null entityId is null", async () => {
    expect(await surpriseRootForEntity("STOP", null, NOW)).toBeNull();
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
  });

  it("resolves STOP, REMINDER, DAY_TITLE, NOTE, ATTACHMENT, COST through their parents", async () => {
    reminderFindUniqueMock.mockResolvedValue({ stopId: "stop-1" });
    dayTitleFindUniqueMock.mockResolvedValue({ stopId: "stop-1" });
    noteFindUniqueMock.mockResolvedValue({ targetType: "STOP", targetId: "stop-1" });
    attachmentFindUniqueMock.mockResolvedValue({ targetType: "STOP", targetId: "stop-1" });
    costFindUniqueMock.mockResolvedValue({ ownerType: "ACCOMMODATION", ownerId: "acc-1" });
    accommodationFindUniqueMock.mockResolvedValue({ stopId: "stop-1" });
    const root = { type: "STOP", id: "stop-1" };
    for (const t of ["STOP", "REMINDER", "DAY_TITLE", "NOTE", "ATTACHMENT", "COST", "ACCOMMODATION"]) {
      expect(await surpriseRootForEntity(t, t === "STOP" ? "stop-1" : "x", NOW)).toEqual(root);
    }
  });

  it("TRANSPORT and TRIP are null", async () => {
    expect(await surpriseRootForEntity("TRANSPORT", "tr-1", NOW)).toBeNull();
    expect(await surpriseRootForEntity("TRIP", "trip-1", NOW)).toBeNull();
  });
});
