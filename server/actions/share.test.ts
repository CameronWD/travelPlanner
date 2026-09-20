import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const {
  requireTripAccessMock,
  revalidatePathMock,
  shareFindManyMock,
  shareFindFirstMock,
  shareCreateMock,
  shareUpdateManyMock,
  shareDeleteManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  shareFindManyMock: vi.fn(),
  shareFindFirstMock: vi.fn(),
  shareCreateMock: vi.fn(),
  shareUpdateManyMock: vi.fn(),
  shareDeleteManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    shareLink: {
      findMany: shareFindManyMock,
      findFirst: shareFindFirstMock,
      create: shareCreateMock,
      updateMany: shareUpdateManyMock,
      deleteMany: shareDeleteManyMock,
    },
  },
}));

import {
  listShareLinks,
  createShareLink,
  updateShareLink,
  rotateShareLink,
  revokeShareLink,
} from "./share";

const TRIP_ID = "trip-abc";
const LINK_ID = "link-1";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: LINK_ID,
  token: "tok-1",
  label: "Mum & Dad",
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  createdAt: new Date("2026-09-20T00:00:00Z"),
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listShareLinks", () => {
  it("is access-checked and returns views ordered oldest-first", async () => {
    shareFindManyMock.mockResolvedValue([row()]);
    const links = await listShareLinks(TRIP_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expect(shareFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: TRIP_ID },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(links).toEqual([
      expect.objectContaining({
        id: LINK_ID,
        label: "Mum & Dad",
        createdAt: "2026-09-20T00:00:00.000Z",
      }),
    ]);
  });
});

describe("createShareLink", () => {
  it("is access-checked before the write", async () => {
    shareCreateMock.mockResolvedValue(row());
    await createShareLink(TRIP_ID, { label: "Mum & Dad" });
    expectAccessCheckedBeforeWrite(requireTripAccessMock, shareCreateMock);
  });

  it("rejects a blank label without touching the database", async () => {
    const result = await createShareLink(TRIP_ID, { label: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.label).toBeDefined();
    expect(shareCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a label over 60 characters", async () => {
    const result = await createShareLink(TRIP_ID, { label: "x".repeat(61) });
    expect(result.success).toBe(false);
    expect(shareCreateMock).not.toHaveBeenCalled();
  });

  it("defaults every dial on and trims the label", async () => {
    shareCreateMock.mockResolvedValue(row());
    await createShareLink(TRIP_ID, { label: "  Mum & Dad  " });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: TRIP_ID,
          label: "Mum & Dad",
          includeAccommodation: true,
          includeTransport: true,
          includeDailyPlans: true,
          token: expect.any(String),
        }),
      }),
    );
  });

  it("honours explicit false dials", async () => {
    shareCreateMock.mockResolvedValue(row({ includeDailyPlans: false }));
    await createShareLink(TRIP_ID, { label: "Group chat", includeDailyPlans: false });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ includeDailyPlans: false }),
      }),
    );
  });
});

describe("updateShareLink", () => {
  it("scopes the write to id AND tripId — a linkId from another trip is unreachable", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ label: "Nana" }));
    await updateShareLink(TRIP_ID, LINK_ID, { label: "Nana" });
    expect(shareUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LINK_ID, tripId: TRIP_ID } }),
    );
  });

  it("fails with a form error when no row matches", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 0 });
    const result = await updateShareLink(TRIP_ID, LINK_ID, { label: "Nana" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.form).toBeDefined();
  });

  it("rejects a blank label without writing", async () => {
    const result = await updateShareLink(TRIP_ID, LINK_ID, { label: " " });
    expect(result.success).toBe(false);
    expect(shareUpdateManyMock).not.toHaveBeenCalled();
  });

  it("updates dials without requiring a label", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ includeTransport: false }));
    const result = await updateShareLink(TRIP_ID, LINK_ID, { includeTransport: false });
    expect(shareUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { includeTransport: false } }),
    );
    expect(result.success).toBe(true);
  });
});

describe("rotateShareLink", () => {
  it("writes a fresh token scoped to id AND tripId", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ token: "tok-2" }));
    const result = await rotateShareLink(TRIP_ID, LINK_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, shareUpdateManyMock);
    expect(shareUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_ID, tripId: TRIP_ID },
        data: { token: expect.any(String) },
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.link.token).toBe("tok-2");
  });

  it("fails with a form error when the link is gone", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 0 });
    const result = await rotateShareLink(TRIP_ID, LINK_ID);
    expect(result.success).toBe(false);
  });
});

describe("revokeShareLink", () => {
  it("deletes scoped to id AND tripId, and is a no-op-safe ok() when already gone", async () => {
    shareDeleteManyMock.mockResolvedValue({ count: 0 });
    const result = await revokeShareLink(TRIP_ID, LINK_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, shareDeleteManyMock);
    expect(shareDeleteManyMock).toHaveBeenCalledWith({
      where: { id: LINK_ID, tripId: TRIP_ID },
    });
    expect(result.success).toBe(true);
  });
});
