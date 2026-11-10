import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { TRAVELLER_SELECT } from "@/lib/traveller";

/**
 * Tests for checklist server actions.
 *
 * Mocks: lib/db, lib/guards, lib/revalidate, next/navigation
 */

const {
  requireTripAccessMock,
  requireUserMock,
  revalidateTripMock,
  notFoundMock,
  // ChecklistItem mocks
  checklistItemFindUniqueMock,
  checklistItemFindFirstMock,
  checklistItemFindManyMock,
  checklistItemCreateMock,
  checklistItemCreateManyMock,
  checklistItemUpdateMock,
  checklistItemDeleteMock,
  // TripMember mocks
  tripMemberFindUniqueMock,
  // PackingTemplate mocks
  packingTemplateFindUniqueMock,
  packingTemplateCreateMock,
  packingTemplateDeleteMock,
  queryRawMock,
  transactionMock,
  recordActivityMock,
  loadPackingViewerMock,
} = vi.hoisted(() => {
  const checklistItemUpdateMock = vi.fn();
  const queryRawMock = vi.fn();
  const transactionMock = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        $queryRaw: queryRawMock,
        checklistItem: { update: checklistItemUpdateMock },
      });
    }
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
    revalidateTripMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NOT_FOUND");
    }),
    checklistItemFindUniqueMock: vi.fn(),
    checklistItemFindFirstMock: vi.fn(),
    checklistItemFindManyMock: vi.fn(),
    checklistItemCreateMock: vi.fn(),
    checklistItemCreateManyMock: vi.fn(),
    checklistItemUpdateMock,
    checklistItemDeleteMock: vi.fn(),
    tripMemberFindUniqueMock: vi.fn(),
    packingTemplateFindUniqueMock: vi.fn(),
    packingTemplateCreateMock: vi.fn(),
    packingTemplateDeleteMock: vi.fn(),
    queryRawMock,
    transactionMock,
    recordActivityMock: vi.fn().mockResolvedValue(undefined),
    loadPackingViewerMock: vi.fn(),
  };
});

vi.mock("@/lib/activity-record", () => ({ recordActivity: recordActivityMock }));
vi.mock("@/lib/packing-viewer", () => ({ loadPackingViewer: loadPackingViewerMock }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
// requireChecklistItemAccess is now a thin adapter over requireRowAccess
// (Task 5) — forward to the same checklistItemFindUniqueMock/
// requireTripAccessMock every test already seeds, so existing
// mockResolvedValueOnce chains for the guard's own lookup keep working
// unchanged. ChecklistItem has no Surprise ref (unchanged behaviour), so
// there's no requireOutsideSurprise call to forward.
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async () => {
    const row = await checklistItemFindUniqueMock();
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccessMock(row.tripId);
    return { row, user, membership, surpriseOf: null };
  }),
);
vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  requireUser: requireUserMock,
  requireRowAccess: requireRowAccessMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    checklistItem: {
      findUnique: checklistItemFindUniqueMock,
      findFirst: checklistItemFindFirstMock,
      findMany: checklistItemFindManyMock,
      create: checklistItemCreateMock,
      createMany: checklistItemCreateManyMock,
      update: checklistItemUpdateMock,
      delete: checklistItemDeleteMock,
    },
    tripMember: {
      findUnique: tripMemberFindUniqueMock,
    },
    packingTemplate: {
      findUnique: packingTemplateFindUniqueMock,
      create: packingTemplateCreateMock,
      findMany: vi.fn().mockResolvedValue([]),
      delete: packingTemplateDeleteMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  reorderChecklistItem,
  saveAsTemplate,
  applyTemplate,
  deleteTemplate,
  setBuyState,
  movePackingItem,
} from "./checklists";

const VALID_PRETRIP_INPUT = {
  kind: "PRETRIP" as const,
  text: "Book airport transfer",
};

const VALID_PACKING_INPUT = {
  kind: "PACKING" as const,
  text: "Sunscreen",
};

const PRETRIP_ITEM = {
  id: "ci-1",
  tripId: "trip-1",
  kind: "PRETRIP",
  text: "Travel insurance",
  done: false,
  dueDate: null,
  ownerId: null,
  buy: null,
  assignedTo: null,
};

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  requireUserMock.mockResolvedValue({ id: "user-1" });
  loadPackingViewerMock.mockResolvedValue({ userId: "user-1", open: false });
});

// ---------------------------------------------------------------------------
// addChecklistItem
// ---------------------------------------------------------------------------

describe("addChecklistItem", () => {
  it("creates item with sortOrder = max + 1 within (trip, kind)", async () => {
    checklistItemFindFirstMock.mockResolvedValue({ sortOrder: 3 });
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    const result = await addChecklistItem("trip-1", VALID_PRETRIP_INPUT);

    expect(result).toEqual({ success: true, id: "ci-1" });
    expect(checklistItemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        kind: "PRETRIP",
        text: "Book airport transfer",
        sortOrder: 4,
        done: false,
      }),
      select: { id: true },
    });
  });

  it("sets sortOrder to 0 when no existing items", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    const result = await addChecklistItem("trip-1", VALID_PACKING_INPUT);

    expect(result.success).toBe(true);
    expect(checklistItemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 0 }),
      select: { id: true },
    });
  });

  it("queries sortOrder only for the same (trip, kind)", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    await addChecklistItem("trip-1", VALID_PRETRIP_INPUT);

    expect(checklistItemFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: "trip-1", kind: "PRETRIP" },
      }),
    );
  });

  it("revalidates the checklists path", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    await addChecklistItem("trip-1", VALID_PRETRIP_INPUT);

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "lists");
  });

  it("access-checks via requireTripAccess", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    await addChecklistItem("trip-99", VALID_PRETRIP_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-99");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, checklistItemCreateMock);
  });

  it("validates assignedToId is a trip member", async () => {
    tripMemberFindUniqueMock.mockResolvedValue(null); // not a member

    const result = await addChecklistItem("trip-1", {
      ...VALID_PRETRIP_INPUT,
      assignedToId: "user-unknown",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.assignedToId).toBeDefined();
    }
    expect(checklistItemCreateMock).not.toHaveBeenCalled();
  });

  it("accepts assignedToId that is a trip member", async () => {
    tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-2" });
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    const result = await addChecklistItem("trip-1", {
      ...VALID_PRETRIP_INPUT,
      assignedToId: "user-2",
    });

    expect(result.success).toBe(true);
    expect(checklistItemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ assignedToId: "user-2" }),
      select: { id: true },
    });
  });

  it("returns validation error for empty text and does not write", async () => {
    const result = await addChecklistItem("trip-1", {
      ...VALID_PRETRIP_INPUT,
      text: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.text).toBeDefined();
    }
    expect(checklistItemCreateMock).not.toHaveBeenCalled();
    expect(revalidateTripMock).not.toHaveBeenCalled();
  });

  it("returns validation error for invalid kind", async () => {
    const result = await addChecklistItem("trip-1", {
      // @ts-expect-error intentional bad kind
      kind: "INVALID",
      text: "Test",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.kind).toBeDefined();
    }
    expect(checklistItemCreateMock).not.toHaveBeenCalled();
  });

  it("returns validation error for text exceeding 200 chars", async () => {
    const result = await addChecklistItem("trip-1", {
      ...VALID_PRETRIP_INPUT,
      text: "a".repeat(201),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.text).toBeDefined();
    }
    expect(checklistItemCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toggleChecklistItem
// ---------------------------------------------------------------------------

describe("toggleChecklistItem", () => {
  it("sets done = true", async () => {
    // was false — a real on → off transition, not a double-click no-op.
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, done: false });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await toggleChecklistItem("ci-1", true);

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { done: true },
    });
  });

  it("sets done = false", async () => {
    // was true — a real on → off transition, not a double-click no-op.
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, done: true });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await toggleChecklistItem("ci-1", false);

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { done: false },
    });
  });

  it("access-checks via item's tripId", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      ...PRETRIP_ITEM,
      tripId: "trip-5",
      kind: "PACKING",
    });
    checklistItemUpdateMock.mockResolvedValue({});

    await toggleChecklistItem("ci-1", true);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-5");
    expectAccessCheckedBeforeWrite(requireRowAccessMock, checklistItemUpdateMock);
  });

  it("revalidates checklists path", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING" });
    checklistItemUpdateMock.mockResolvedValue({});

    await toggleChecklistItem("ci-1", true);

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "lists");
  });

  it("throws notFound when item does not exist", async () => {
    checklistItemFindUniqueMock.mockResolvedValue(null);

    await expect(toggleChecklistItem("ci-missing", true)).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setBuyState
// ---------------------------------------------------------------------------

describe("setBuyState", () => {
  it("refuses a PRETRIP item and writes nothing", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM });

    const result = await setBuyState("ci-1", "NEEDED");

    expect(result).toEqual({
      success: false,
      errors: { _: ["Only a Packing item can be marked to buy."] },
    });
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });

  it("sets buy: NEEDED on a PACKING item after the access check", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING" });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await setBuyState("ci-1", "NEEDED");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { buy: "NEEDED" },
    });
    expectAccessCheckedBeforeWrite(requireRowAccessMock, checklistItemUpdateMock);
  });

  it("clears buy state with null", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING" });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await setBuyState("ci-1", null);

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { buy: null },
    });
  });

  it("revalidates the checklists path", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING" });
    checklistItemUpdateMock.mockResolvedValue({});

    await setBuyState("ci-1", "BOUGHT");

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "lists");
  });

  it("refuses an invalid buy value on a PACKING item and writes nothing", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING" });

    const result = await setBuyState("ci-1", "BOGUS" as unknown as "NEEDED");

    expect(result).toEqual({ success: false, errors: { _: ["Invalid buy state."] } });
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteChecklistItem
// ---------------------------------------------------------------------------

describe("deleteChecklistItem", () => {
  it("deletes and revalidates", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PACKING",
      ownerId: null,
    });
    checklistItemDeleteMock.mockResolvedValue({});

    const result = await deleteChecklistItem("ci-1");

    expect(result.success).toBe(true);
    expect(checklistItemDeleteMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
    });
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "lists");
  });

  it("access-checks via item's tripId", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-7",
      kind: "PRETRIP",
    });
    checklistItemDeleteMock.mockResolvedValue({});

    await deleteChecklistItem("ci-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-7");
    expectAccessCheckedBeforeWrite(requireRowAccessMock, checklistItemDeleteMock);
  });
});

// ---------------------------------------------------------------------------
// saveAsTemplate
// ---------------------------------------------------------------------------

describe("saveAsTemplate", () => {
  it("serializes PACKING texts into itemsJson and creates a template", async () => {
    checklistItemFindManyMock.mockResolvedValue([
      { text: "Sunscreen", ownerId: "user-1" },
      { text: "Adapter", ownerId: null },
      { text: "Passport", ownerId: "user-1" },
    ]);
    packingTemplateCreateMock.mockResolvedValue({ id: "tpl-1" });

    const result = await saveAsTemplate("trip-1", "Summer Essentials");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.templateId).toBe("tpl-1");
    }
    expect(packingTemplateCreateMock).toHaveBeenCalledWith({
      data: {
        ownerId: "user-1",
        name: "Summer Essentials",
        itemsJson: JSON.stringify([
          { text: "Sunscreen", shared: false },
          { text: "Passport", shared: false },
          { text: "Adapter", shared: true },
        ]),
      },
      select: { id: true },
    });
  });

  it("excludes another Traveller's items", async () => {
    checklistItemFindManyMock.mockResolvedValue([]);
    packingTemplateCreateMock.mockResolvedValue({ id: "tpl-1" });

    await saveAsTemplate("trip-1", "Mine");

    expect(checklistItemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId: "trip-1",
          kind: "PACKING",
          OR: [{ ownerId: null }, { ownerId: "user-1" }],
        },
      }),
    );
  });

  it("queries only PACKING items, ordered by sortOrder", async () => {
    checklistItemFindManyMock.mockResolvedValue([]);
    packingTemplateCreateMock.mockResolvedValue({ id: "tpl-1" });

    await saveAsTemplate("trip-1", "Empty List");

    expect(checklistItemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", kind: "PACKING" }),
        orderBy: { sortOrder: "asc" },
      }),
    );
  });

  it("returns validation error for empty name", async () => {
    const result = await saveAsTemplate("trip-1", "");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
    }
    expect(packingTemplateCreateMock).not.toHaveBeenCalled();
  });

  it("returns validation error for name exceeding 80 chars", async () => {
    const result = await saveAsTemplate("trip-1", "x".repeat(81));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
    }
    expect(packingTemplateCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// applyTemplate
// ---------------------------------------------------------------------------

describe("applyTemplate", () => {
  it("adds only non-duplicate items from the template", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
      itemsJson: JSON.stringify(["Sunscreen", "Passport", "Camera"]),
    });
    checklistItemFindManyMock.mockResolvedValue([
      { text: "Passport", sortOrder: 0 },
    ]);
    checklistItemCreateManyMock.mockResolvedValue({ count: 2 });

    const result = await applyTemplate("trip-1", "tpl-1");

    expect(result.success).toBe(true);
    expect(checklistItemCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ text: "Sunscreen", kind: "PACKING" }),
        expect.objectContaining({ text: "Camera", kind: "PACKING" }),
      ]),
    });
    // Passport should NOT be in the data
    const createData = checklistItemCreateManyMock.mock.calls[0][0].data as Array<{ text: string }>;
    expect(createData.some((d) => d.text === "Passport")).toBe(false);
  });

  it("puts shared entries in Shared and personal in the caller's list, deduping each against its own section", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
      name: "Tpl",
      itemsJson: JSON.stringify([
        { text: "Adapter", shared: false },
        { text: "adapter", shared: true },
        { text: "Tent", shared: true },
      ]),
    });
    checklistItemFindManyMock.mockResolvedValue([
      { text: "Adapter", sortOrder: 0, ownerId: null },
      { text: "Socks", sortOrder: 1, ownerId: "user-1" },
    ]);
    checklistItemCreateManyMock.mockResolvedValue({ count: 2 });

    await applyTemplate("trip-1", "tpl-1");

    expect(checklistItemCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ text: "Adapter", ownerId: "user-1", sortOrder: 2 }),
        expect.objectContaining({ text: "Tent", ownerId: null, sortOrder: 3 }),
      ],
    });
  });

  it("reports corrupted template data", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
      name: "Tpl",
      itemsJson: "nope",
    });

    const result = await applyTemplate("trip-1", "tpl-1");

    expect(result).toEqual({ success: false, errors: { _root: ["Template data is corrupted"] } });
  });

  it("is case-insensitive when skipping duplicates", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
      itemsJson: JSON.stringify(["SUNSCREEN"]),
    });
    checklistItemFindManyMock.mockResolvedValue([
      { text: "sunscreen", sortOrder: 0 },
    ]);
    checklistItemCreateManyMock.mockResolvedValue({ count: 0 });

    const result = await applyTemplate("trip-1", "tpl-1");

    expect(result.success).toBe(true);
    // createMany should not be called because there's nothing new
    expect(checklistItemCreateManyMock).not.toHaveBeenCalled();
  });

  it("rejects template not owned by the current user (IDOR protection)", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-OTHER", // different owner
      itemsJson: JSON.stringify(["Item"]),
    });

    await expect(applyTemplate("trip-1", "tpl-1")).rejects.toThrow("NOT_FOUND");
    expect(checklistItemCreateManyMock).not.toHaveBeenCalled();
  });

  it("throws notFound when template does not exist", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue(null);

    await expect(applyTemplate("trip-1", "tpl-missing")).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("does nothing when all template items are duplicates", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
      itemsJson: JSON.stringify(["Hat"]),
    });
    checklistItemFindManyMock.mockResolvedValue([
      { text: "Hat", sortOrder: 0 },
    ]);

    const result = await applyTemplate("trip-1", "tpl-1");

    expect(result.success).toBe(true);
    expect(checklistItemCreateManyMock).not.toHaveBeenCalled();
    // No revalidate when nothing changed
    expect(revalidateTripMock).not.toHaveBeenCalled();
  });

  it("assigns sortOrders starting after the current max", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
      itemsJson: JSON.stringify(["Camera", "Adapter"]),
    });
    checklistItemFindManyMock.mockResolvedValue([
      { text: "Existing", sortOrder: 5 },
    ]);
    checklistItemCreateManyMock.mockResolvedValue({ count: 2 });

    await applyTemplate("trip-1", "tpl-1");

    const createData = checklistItemCreateManyMock.mock.calls[0][0].data as Array<{ sortOrder: number }>;
    expect(createData[0].sortOrder).toBe(6);
    expect(createData[1].sortOrder).toBe(7);
  });

  it("access-checks via requireTripAccess", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
      itemsJson: JSON.stringify(["Item"]),
    });
    checklistItemFindManyMock.mockResolvedValue([]);
    checklistItemCreateManyMock.mockResolvedValue({ count: 1 });

    await applyTemplate("trip-5", "tpl-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-5");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, checklistItemCreateManyMock);
  });
});

// ---------------------------------------------------------------------------
// deleteTemplate
// ---------------------------------------------------------------------------

describe("deleteTemplate", () => {
  it("deletes the template when owned by current user", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-1",
    });
    packingTemplateDeleteMock.mockResolvedValue({});

    const result = await deleteTemplate("tpl-1");

    expect(result.success).toBe(true);
    expect(packingTemplateDeleteMock).toHaveBeenCalledWith({
      where: { id: "tpl-1" },
    });
  });

  it("throws notFound when template belongs to another user (IDOR protection)", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({
      id: "tpl-1",
      ownerId: "user-OTHER",
    });

    await expect(deleteTemplate("tpl-1")).rejects.toThrow("NOT_FOUND");
    expect(packingTemplateDeleteMock).not.toHaveBeenCalled();
  });

  it("throws notFound when template does not exist", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue(null);

    await expect(deleteTemplate("tpl-missing")).rejects.toThrow("NOT_FOUND");
    expect(packingTemplateDeleteMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateChecklistItem
// ---------------------------------------------------------------------------

describe("updateChecklistItem", () => {
  it("updates text, dueDate, assignedToId", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PRETRIP",
    });
    tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-2" });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await updateChecklistItem("ci-1", {
      text: "Updated text",
      dueDate: "2026-08-01",
      assignedToId: "user-2",
    });

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: expect.objectContaining({
        text: "Updated text",
        dueDate: "2026-08-01",
        assignedToId: "user-2",
      }),
      select: { text: true, dueDate: true, assignedTo: { select: TRAVELLER_SELECT } },
    });
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "lists");
  });

  it("rejects assignedToId that is not a trip member", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PRETRIP",
    });
    tripMemberFindUniqueMock.mockResolvedValue(null);

    const result = await updateChecklistItem("ci-1", {
      assignedToId: "user-unknown",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.assignedToId).toBeDefined();
    }
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });

  it("clears the assignee and due date when passed empty strings", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PRETRIP",
    });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await updateChecklistItem("ci-1", {
      assignedToId: "",
      dueDate: "",
    });

    expect(result.success).toBe(true);
    // No membership check when clearing (empty string → null, not a user id).
    expect(tripMemberFindUniqueMock).not.toHaveBeenCalled();
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: expect.objectContaining({
        assignedToId: null,
        dueDate: null,
      }),
      select: { text: true, dueDate: true, assignedTo: { select: TRAVELLER_SELECT } },
    });
  });
});

// ---------------------------------------------------------------------------
// reorderChecklistItem
// ---------------------------------------------------------------------------

describe("reorderChecklistItem", () => {
  const items = [
    { id: "ci-1", sortOrder: 0 },
    { id: "ci-2", sortOrder: 1 },
    { id: "ci-3", sortOrder: 2 },
  ];

  it("locks the (trip, kind) list with FOR UPDATE inside a transaction before swapping", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-2", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await reorderChecklistItem("ci-2", "up");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    const sqlParts = queryRawMock.mock.calls[0][0] as string[];
    expect(sqlParts.join(" ")).toContain("FOR UPDATE");
    // Bound params: tripId then kind.
    expect(queryRawMock.mock.calls[0][1]).toBe("trip-1");
    expect(queryRawMock.mock.calls[0][2]).toBe("PRETRIP");
  });

  it("swaps sortOrder with the previous item when moving up", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-2", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);
    checklistItemUpdateMock.mockResolvedValue({});

    await reorderChecklistItem("ci-2", "up");

    expect(checklistItemUpdateMock).toHaveBeenCalledTimes(2);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-2" }, data: { sortOrder: 0 } });
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-1" }, data: { sortOrder: 1 } });
  });

  it("swaps sortOrder with the next item when moving down", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-2", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);
    checklistItemUpdateMock.mockResolvedValue({});

    await reorderChecklistItem("ci-2", "down");

    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-2" }, data: { sortOrder: 2 } });
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-3" }, data: { sortOrder: 1 } });
  });

  it("is a no-op at the top boundary", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-1", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);

    const result = await reorderChecklistItem("ci-1", "up");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });

  it("is a no-op at the bottom boundary", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-3", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);

    const result = await reorderChecklistItem("ci-3", "down");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

describe("Activity", () => {
  it("adding records CREATED with the list named", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-new" });
    await addChecklistItem("trip-1", { kind: "PRETRIP", text: "Travel insurance" });
    expect(recordActivityMock).toHaveBeenCalledWith({
      tripId: "trip-1",
      verb: "CREATED",
      entityType: "CHECKLIST_ITEM",
      entityId: "ci-new",
      entityLabel: "Travel insurance",
      changes: { summary: "added Travel insurance to the pre-trip checklist" },
    });
  });

  it("editing records UPDATED with field diffs, assignee by name", async () => {
    checklistItemFindUniqueMock.mockResolvedValue(PRETRIP_ITEM);
    tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-2" });
    checklistItemUpdateMock.mockResolvedValue({
      text: "Travel insurance",
      dueDate: "2026-11-20",
      assignedTo: { id: "user-2", name: "Sam", displayName: null, email: "s@x", image: null },
    });
    await updateChecklistItem("ci-1", { text: "Travel insurance", dueDate: "2026-11-20", assignedToId: "user-2" });
    const call = recordActivityMock.mock.calls[0][0];
    expect(call).toMatchObject({ verb: "UPDATED", entityType: "CHECKLIST_ITEM", entityId: "ci-1", entityLabel: "Travel insurance" });
    expect(call.changes.map((c: { label: string }) => c.label)).toEqual(["Due date", "Assigned to"]);
  });

  it("an edit that changes nothing passes empty changes (recordActivity drops it)", async () => {
    checklistItemFindUniqueMock.mockResolvedValue(PRETRIP_ITEM);
    checklistItemUpdateMock.mockResolvedValue({ text: "Travel insurance", dueDate: null, assignedTo: null });
    await updateChecklistItem("ci-1", { text: "Travel insurance" });
    expect(recordActivityMock.mock.calls[0][0].changes).toEqual([]);
  });

  it("ticking a Pre-trip item records it; un-ticking too", async () => {
    checklistItemFindUniqueMock.mockResolvedValue(PRETRIP_ITEM);
    await toggleChecklistItem("ci-1", true);
    expect(recordActivityMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ verb: "UPDATED", changes: { summary: "ticked off Travel insurance" } }),
    );
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, done: true });
    await toggleChecklistItem("ci-1", false);
    expect(recordActivityMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ changes: { summary: "un-ticked Travel insurance" } }),
    );
  });

  it("toggling a Pre-trip item to the state it is already in records nothing", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, done: true });
    await toggleChecklistItem("ci-1", true);
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it.each(["PACKING", "SHOPPING"])("ticking a %s item records nothing", async (kind) => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind });
    await toggleChecklistItem("ci-1", true);
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("removing records DELETED with the list named", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING", text: "Sunscreen" });
    await deleteChecklistItem("ci-1");
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityLabel: "Sunscreen", changes: { summary: "removed Sunscreen from the packing list" } }),
    );
  });

  it("applying a template records one line with the count", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({ id: "t1", ownerId: "user-1", name: "Beach", itemsJson: '["Sunscreen","Hat"]' });
    checklistItemFindManyMock.mockResolvedValue([]);
    await applyTemplate("trip-1", "t1");
    expect(recordActivityMock).toHaveBeenCalledTimes(1);
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "CREATED",
        entityType: "CHECKLIST_ITEM",
        entityId: null,
        entityLabel: "Beach",
        changes: { summary: "added 2 items from the Beach template to the packing list" },
      }),
    );
  });

  it("applying a template that adds nothing records nothing", async () => {
    packingTemplateFindUniqueMock.mockResolvedValue({ id: "t1", ownerId: "user-1", name: "Beach", itemsJson: '["Sunscreen"]' });
    checklistItemFindManyMock.mockResolvedValue([{ text: "Sunscreen", sortOrder: 0 }]);
    await applyTemplate("trip-1", "t1");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("buy state, reorder and templates record nothing", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING" });
    await setBuyState("ci-1", "NEEDED");
    queryRawMock.mockResolvedValue([{ id: "ci-0", sortOrder: 0 }, { id: "ci-1", sortOrder: 1 }]);
    await reorderChecklistItem("ci-1", "up");
    checklistItemFindManyMock.mockResolvedValue([]);
    packingTemplateCreateMock.mockResolvedValue({ id: "t2" });
    await saveAsTemplate("trip-1", "Ski");
    packingTemplateFindUniqueMock.mockResolvedValue({ id: "t2", ownerId: "user-1" });
    await deleteTemplate("t2");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Packing rules (per-person Packing lists)
// ---------------------------------------------------------------------------

const PACKING_ITEM = { ...PRETRIP_ITEM, kind: "PACKING", ownerId: null as string | null };
const THEIRS = { ...PACKING_ITEM, ownerId: "user-2" };
const NOT_YOURS = {
  success: false,
  errors: { _: ["That's on someone else's packing list."] },
};

describe("addChecklistItem (Packing)", () => {
  it("defaults the owner to the caller", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-1" });
    checklistItemCreateMock.mockResolvedValue({ id: "new" });

    await addChecklistItem("trip-1", VALID_PACKING_INPUT);

    expect(checklistItemCreateMock.mock.calls[0][0].data.ownerId).toBe("user-1");
  });

  it('owner "SHARED" creates ownerId null', async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "new" });

    await addChecklistItem("trip-1", { ...VALID_PACKING_INPUT, owner: "SHARED" });

    expect(checklistItemCreateMock.mock.calls[0][0].data.ownerId).toBeNull();
  });

  it("refuses another member's list when Private", async () => {
    tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-2" });

    const result = await addChecklistItem("trip-1", { ...VALID_PACKING_INPUT, owner: "user-2" });

    expect(result).toEqual({
      success: false,
      errors: { _: ["This trip's packing lists are private."] },
    });
    expect(checklistItemCreateMock).not.toHaveBeenCalled();
  });

  it("adds to another member's list when Open", async () => {
    loadPackingViewerMock.mockResolvedValue({ userId: "user-1", open: true });
    tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-2" });
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "new" });

    const result = await addChecklistItem("trip-1", { ...VALID_PACKING_INPUT, owner: "user-2" });

    expect(result.success).toBe(true);
    expect(checklistItemCreateMock.mock.calls[0][0].data.ownerId).toBe("user-2");
  });

  it("refuses a non-member owner", async () => {
    tripMemberFindUniqueMock.mockResolvedValue(null);

    const result = await addChecklistItem("trip-1", { ...VALID_PACKING_INPUT, owner: "stranger" });

    expect(result).toEqual({ success: false, errors: { _: ["They aren't on this trip."] } });
    expect(checklistItemCreateMock).not.toHaveBeenCalled();
  });

  it("ignores owner on a non-Packing item", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "new" });

    await addChecklistItem("trip-1", { ...VALID_PRETRIP_INPUT, owner: "user-2" });

    expect(checklistItemCreateMock.mock.calls[0][0].data.ownerId).toBeNull();
  });
});

describe("toggleChecklistItem (Packing)", () => {
  it("records who packed a Shared item, and clears it on untick", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PACKING_ITEM });
    checklistItemUpdateMock.mockResolvedValue({});

    await toggleChecklistItem("ci-1", true);
    expect(checklistItemUpdateMock).toHaveBeenLastCalledWith({
      where: { id: "ci-1" },
      data: { done: true, packedById: "user-1" },
    });

    await toggleChecklistItem("ci-1", false);
    expect(checklistItemUpdateMock).toHaveBeenLastCalledWith({
      where: { id: "ci-1" },
      data: { done: false, packedById: null },
    });
  });

  it("refuses another Traveller's item and writes nothing", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...THEIRS });

    expect(await toggleChecklistItem("ci-1", true)).toEqual(NOT_YOURS);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});

describe("updateChecklistItem / deleteChecklistItem (Packing)", () => {
  it("refuse another Traveller's item", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...THEIRS });

    expect(await updateChecklistItem("ci-1", { text: "x" })).toEqual(NOT_YOURS);
    expect(await deleteChecklistItem("ci-1")).toEqual(NOT_YOURS);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
    expect(checklistItemDeleteMock).not.toHaveBeenCalled();
  });
});

describe("setBuyState (Packing ownership)", () => {
  it("lets you flip NEEDED to BOUGHT on another's item when Open", async () => {
    loadPackingViewerMock.mockResolvedValue({ userId: "user-1", open: true });
    checklistItemFindUniqueMock.mockResolvedValue({ ...THEIRS, buy: "NEEDED" });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await setBuyState("ci-1", "BOUGHT");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { buy: "BOUGHT" },
    });
  });

  it("refuses marking another's item to buy", async () => {
    loadPackingViewerMock.mockResolvedValue({ userId: "user-1", open: true });
    checklistItemFindUniqueMock.mockResolvedValue({ ...THEIRS, buy: null });

    expect(await setBuyState("ci-1", "NEEDED")).toEqual(NOT_YOURS);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});

describe("reorderChecklistItem (Packing)", () => {
  it("locks only same-owner siblings", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PACKING_ITEM, id: "ci-2", ownerId: "user-1" });
    queryRawMock.mockResolvedValue([
      { id: "ci-1", sortOrder: 0 },
      { id: "ci-2", sortOrder: 1 },
    ]);
    checklistItemUpdateMock.mockResolvedValue({});

    await reorderChecklistItem("ci-2", "up");

    const sql = (queryRawMock.mock.calls[0][0] as string[]).join(" ");
    expect(sql).toContain('"ownerId" IS NOT DISTINCT FROM');
    expect(queryRawMock.mock.calls[0]).toContain("user-1");
  });

  it("refuses another Traveller's item", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...THEIRS });

    expect(await reorderChecklistItem("ci-1", "up")).toEqual(NOT_YOURS);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("movePackingItem", () => {
  it("moves Shared to a partner when Open and records Activity", async () => {
    loadPackingViewerMock.mockResolvedValue({ userId: "user-1", open: true });
    checklistItemFindUniqueMock.mockResolvedValue({ ...PACKING_ITEM });
    tripMemberFindUniqueMock.mockResolvedValue({
      userId: "user-2",
      user: { id: "user-2", name: "Sam", image: null },
    });
    checklistItemFindFirstMock.mockResolvedValue({ sortOrder: 4 });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await movePackingItem("ci-1", "user-2");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { ownerId: "user-2", sortOrder: 5 },
    });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "CHECKLIST_ITEM",
        changes: { summary: `moved "Travel insurance" to Sam's packing list` },
      }),
    );
  });

  it("refuses moving to a partner when Private", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PACKING_ITEM });
    tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-2", user: { id: "user-2" } });

    expect(await movePackingItem("ci-1", "user-2")).toEqual({
      success: false,
      errors: { _: ["This trip's packing lists are private."] },
    });
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses moving a partner's item anywhere", async () => {
    loadPackingViewerMock.mockResolvedValue({ userId: "user-1", open: true });
    checklistItemFindUniqueMock.mockResolvedValue({ ...THEIRS });

    expect(await movePackingItem("ci-1", "SHARED")).toEqual(NOT_YOURS);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });

  it("is a no-op success when the owner is unchanged", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PACKING_ITEM });

    expect((await movePackingItem("ci-1", "SHARED")).success).toBe(true);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("refuses a non-Packing item", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, ownerId: null });

    expect((await movePackingItem("ci-1", "user-1")).success).toBe(false);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});
