import { beforeEach, describe, expect, it, vi } from "vitest";

const { itemFindManyMock, surpriseRootForMock } = vi.hoisted(() => ({
  itemFindManyMock: vi.fn(),
  surpriseRootForMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { item: { findMany: itemFindManyMock } } }));
vi.mock("@/lib/surprise-guard", () => ({ surpriseRootFor: surpriseRootForMock }));

import { itemFamilyRecipients, itemFamilyRoot, itemFamilyWhere, writeItemFamily } from "./item-family";

const COPY = { id: "copy-1", tripId: "trip-1", sourceItemId: "idea-1" };
const hiddenIf = (ids: string[]) => async (ref: { itemId?: string }) =>
  ref.itemId && ids.includes(ref.itemId) ? { type: "ITEM", id: ref.itemId } : null;

beforeEach(() => {
  vi.clearAllMocks();
  surpriseRootForMock.mockResolvedValue(null);
});

describe("the Item family (a thing to do and its placed copies: Opening hours, Try list)", () => {
  it("the root is the source idea for a placed copy, else the Item itself", () => {
    expect(itemFamilyRoot({ id: "copy-1", sourceItemId: "idea-1" })).toBe("idea-1");
    expect(itemFamilyRoot({ id: "idea-1", sourceItemId: null })).toBe("idea-1");
  });

  it("selects the root and every copy placed from it, in the Trip", () => {
    expect(itemFamilyWhere("trip-1", "idea-1")).toEqual({ tripId: "trip-1", OR: [{ id: "idea-1" }, { sourceItemId: "idea-1" }] });
  });
});

describe("itemFamilyRecipients (never crosses a Surprise)", () => {
  it("is every other family row, read by id only", async () => {
    itemFindManyMock.mockResolvedValue([{ id: "idea-1" }, { id: "copy-2" }]);
    expect(await itemFamilyRecipients(COPY)).toEqual(["idea-1", "copy-2"]);
    expect(itemFindManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-1", OR: [{ id: "idea-1" }, { sourceItemId: "idea-1" }], id: { not: "copy-1" } },
      select: { id: true },
    });
  });

  it("leaves out a row inside a live Surprise", async () => {
    itemFindManyMock.mockResolvedValue([{ id: "idea-1" }, { id: "hidden-copy" }]);
    surpriseRootForMock.mockImplementation(hiddenIf(["hidden-copy"]));
    expect(await itemFamilyRecipients(COPY)).toEqual(["idea-1"]);
  });

  it("is no one, without even reading the family, when the edited row is itself inside a Surprise", async () => {
    surpriseRootForMock.mockImplementation(hiddenIf(["copy-1"]));
    expect(await itemFamilyRecipients(COPY)).toEqual([]);
    expect(itemFindManyMock).not.toHaveBeenCalled();
  });

  it("reads the family through the client it is given (a transaction)", async () => {
    const txFindMany = vi.fn().mockResolvedValue([{ id: "idea-1" }]);
    expect(await itemFamilyRecipients(COPY, { item: { findMany: txFindMany } } as never)).toEqual(["idea-1"]);
    expect(txFindMany).toHaveBeenCalledTimes(1);
    expect(itemFindManyMock).not.toHaveBeenCalled();
  });

  it("runs its Surprise checks through that client too (one connection, not two)", async () => {
    const tx = { item: { findMany: vi.fn().mockResolvedValue([{ id: "idea-1" }]) } };
    await itemFamilyRecipients(COPY, tx as never);
    expect(surpriseRootForMock.mock.calls).toEqual([
      [{ itemId: "copy-1" }, undefined, tx],
      [{ itemId: "idea-1" }, undefined, tx],
    ]);
  });
});

describe("writeItemFamily", () => {
  it("writes the shared columns to every recipient in one updateMany", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    await writeItemFamily({ item: { updateMany } } as never, ["idea-1", "copy-2"], { openingHours: null, tryList: "[]" });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["idea-1", "copy-2"] } }, data: { openingHours: null, tryList: "[]" } });
  });

  it("writes nothing with no recipients or nothing to share", async () => {
    const updateMany = vi.fn();
    await writeItemFamily({ item: { updateMany } } as never, [], { openingHours: null });
    await writeItemFamily({ item: { updateMany } } as never, ["idea-1"], {});
    expect(updateMany).not.toHaveBeenCalled();
  });
});
