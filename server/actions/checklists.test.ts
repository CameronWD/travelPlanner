import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for checklist server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache, next/navigation
 */

const {
  requireTripAccessMock,
  requireUserMock,
  revalidatePathMock,
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
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  revalidatePathMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  checklistItemFindUniqueMock: vi.fn(),
  checklistItemFindFirstMock: vi.fn(),
  checklistItemFindManyMock: vi.fn(),
  checklistItemCreateMock: vi.fn(),
  checklistItemCreateManyMock: vi.fn(),
  checklistItemUpdateMock: vi.fn(),
  checklistItemDeleteMock: vi.fn(),
  tripMemberFindUniqueMock: vi.fn(),
  packingTemplateFindUniqueMock: vi.fn(),
  packingTemplateCreateMock: vi.fn(),
  packingTemplateDeleteMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  requireUser: requireUserMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
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
    $transaction: (ops: unknown[]) => Promise.all(ops),
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
} from "./checklists";

const VALID_PRETRIP_INPUT = {
  kind: "PRETRIP" as const,
  text: "Book airport transfer",
};

const VALID_PACKING_INPUT = {
  kind: "PACKING" as const,
  text: "Sunscreen",
};

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

// ---------------------------------------------------------------------------
// addChecklistItem
// ---------------------------------------------------------------------------

describe("addChecklistItem", () => {
  it("creates item with sortOrder = max + 1 within (trip, kind)", async () => {
    checklistItemFindFirstMock.mockResolvedValue({ sortOrder: 3 });
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    const result = await addChecklistItem("trip-1", VALID_PRETRIP_INPUT);

    expect(result.success).toBe(true);
    expect(checklistItemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        kind: "PRETRIP",
        text: "Book airport transfer",
        sortOrder: 4,
        done: false,
      }),
    });
  });

  it("sets sortOrder to 0 when no existing items", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    const result = await addChecklistItem("trip-1", VALID_PACKING_INPUT);

    expect(result.success).toBe(true);
    expect(checklistItemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 0 }),
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

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/checklists");
  });

  it("access-checks via requireTripAccess", async () => {
    checklistItemFindFirstMock.mockResolvedValue(null);
    checklistItemCreateMock.mockResolvedValue({ id: "ci-1" });

    await addChecklistItem("trip-99", VALID_PRETRIP_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-99");
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
    expect(revalidatePathMock).not.toHaveBeenCalled();
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
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PRETRIP",
    });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await toggleChecklistItem("ci-1", true);

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { done: true },
    });
  });

  it("sets done = false", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PRETRIP",
    });
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
      id: "ci-1",
      tripId: "trip-5",
      kind: "PACKING",
    });
    checklistItemUpdateMock.mockResolvedValue({});

    await toggleChecklistItem("ci-1", true);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-5");
  });

  it("revalidates checklists path", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PACKING",
    });
    checklistItemUpdateMock.mockResolvedValue({});

    await toggleChecklistItem("ci-1", true);

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/checklists");
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
// deleteChecklistItem
// ---------------------------------------------------------------------------

describe("deleteChecklistItem", () => {
  it("deletes and revalidates", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-1",
      tripId: "trip-1",
      kind: "PACKING",
    });
    checklistItemDeleteMock.mockResolvedValue({});

    const result = await deleteChecklistItem("ci-1");

    expect(result.success).toBe(true);
    expect(checklistItemDeleteMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/checklists");
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
  });
});

// ---------------------------------------------------------------------------
// saveAsTemplate
// ---------------------------------------------------------------------------

describe("saveAsTemplate", () => {
  it("serializes PACKING texts into itemsJson and creates a template", async () => {
    checklistItemFindManyMock.mockResolvedValue([
      { text: "Sunscreen" },
      { text: "Passport" },
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
        itemsJson: JSON.stringify(["Sunscreen", "Passport"]),
      },
      select: { id: true },
    });
  });

  it("queries ONLY PACKING items, ordered by sortOrder", async () => {
    checklistItemFindManyMock.mockResolvedValue([]);
    packingTemplateCreateMock.mockResolvedValue({ id: "tpl-1" });

    await saveAsTemplate("trip-1", "Empty List");

    expect(checklistItemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: "trip-1", kind: "PACKING" },
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
    expect(revalidatePathMock).not.toHaveBeenCalled();
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
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/checklists");
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
    });
  });
});

// ---------------------------------------------------------------------------
// reorderChecklistItem
// ---------------------------------------------------------------------------

describe("reorderChecklistItem", () => {
  it("swaps sortOrder with the item above when direction is up", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({
      id: "ci-2",
      tripId: "trip-1",
      kind: "PRETRIP",
    });
    // First findUnique is the access check, second is for fetching sortOrder
    checklistItemFindUniqueMock
      .mockResolvedValueOnce({ id: "ci-2", tripId: "trip-1", kind: "PRETRIP" })
      .mockResolvedValueOnce({ id: "ci-2", sortOrder: 2, kind: "PRETRIP" });
    checklistItemFindFirstMock.mockResolvedValue({ id: "ci-1", sortOrder: 1 });
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await reorderChecklistItem("ci-2", "up");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-2" },
      data: { sortOrder: 1 },
    });
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { sortOrder: 2 },
    });
  });

  it("is a no-op when already at the top", async () => {
    checklistItemFindUniqueMock
      .mockResolvedValueOnce({ id: "ci-1", tripId: "trip-1", kind: "PRETRIP" })
      .mockResolvedValueOnce({ id: "ci-1", sortOrder: 0, kind: "PRETRIP" });
    checklistItemFindFirstMock.mockResolvedValue(null); // no item above

    const result = await reorderChecklistItem("ci-1", "up");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});
