import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for recordAccessRequest (lib/access-requests.ts).
 *
 * The sign-in attempt IS the Access request — this only ever runs from
 * inside the Auth.js signIn callback (lib/auth.ts), given Google's verified
 * profile. `@/lib/admin-notify` is mocked out entirely: its own behaviour
 * (resolving admins, loading Devices, calling sendPush) is covered by
 * lib/admin-notify.test.ts, not here.
 */

const {
  accessRequestFindUniqueMock,
  accessRequestCreateMock,
  accessRequestUpdateMock,
  allowedEmailFindUniqueMock,
  notifyAdminsMock,
} = vi.hoisted(() => ({
  accessRequestFindUniqueMock: vi.fn(),
  accessRequestCreateMock: vi.fn(),
  accessRequestUpdateMock: vi.fn(),
  // Defaults to "not allowlisted" — the reopen check (I2) only ever asks
  // about a resolved, non-dismissed row, and the answer for those is what
  // distinguishes a revoked Traveller from a standing approval.
  allowedEmailFindUniqueMock: vi.fn().mockResolvedValue(null),
  notifyAdminsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: {
      findUnique: accessRequestFindUniqueMock,
      create: accessRequestCreateMock,
      update: accessRequestUpdateMock,
    },
    allowedEmail: {
      findUnique: allowedEmailFindUniqueMock,
    },
  },
}));

vi.mock("@/lib/admin-notify", () => ({ notifyAdmins: notifyAdminsMock }));

import { recordAccessRequest } from "./access-requests";

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordAccessRequest", () => {
  it("creates a pending request on first attempt", async () => {
    accessRequestFindUniqueMock.mockResolvedValue(null);
    await recordAccessRequest({ email: "New@example.com", name: "New Person", image: null });
    expect(accessRequestCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "new@example.com", status: "pending" }) }),
    );
  });

  it("notifies admins only on a brand-new request", async () => {
    accessRequestFindUniqueMock.mockResolvedValue(null);
    await recordAccessRequest({ email: "new@example.com", name: "New Person", image: null });
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
  });

  it("bumps lastAttemptAt and atomically increments attempts on a repeat, without duplicating", async () => {
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", status: "pending", attempts: 3 });
    await recordAccessRequest({ email: "new@example.com", name: null, image: null });
    expect(accessRequestCreateMock).not.toHaveBeenCalled();
    // Fix round 1, item 4: `attempts: { increment: 1 }`, not a
    // read-modify-write off `existing.attempts` — that read goes stale the
    // instant a concurrent attempt for the same address lands in between.
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ar1" },
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });

  it("does not re-notify admins on a repeat attempt", async () => {
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", status: "pending", attempts: 3 });
    await recordAccessRequest({ email: "new@example.com", name: null, image: null });
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  it("does NOT reopen a dismissed request", async () => {
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", status: "dismissed", attempts: 1 });
    await recordAccessRequest({ email: "declined@example.com", name: null, image: null });
    const data = accessRequestUpdateMock.mock.calls[0][0].data;
    expect(data.status).toBeUndefined(); // still dismissed
  });

  // -------------------------------------------------------------------------
  // Reopening a revoked Traveller (final fix wave, I2)
  // -------------------------------------------------------------------------
  //
  // After revocation the row is still `resolvedAt`-stamped from its approval,
  // so listAccessRequests (which filters on resolvedAt: null) never shows it
  // again — and /admin has no reopen control and no add-an-address control.
  // Without this the person is stranded and invisible, with raw SQL the only
  // way back.
  describe("reopening", () => {
    it("clears resolvedAt and notifies when an approved address is no longer allowlisted", async () => {
      accessRequestFindUniqueMock.mockResolvedValue({
        id: "ar1",
        status: "pending",
        attempts: 2,
        resolvedAt: new Date("2026-09-01T00:00:00Z"),
      });
      allowedEmailFindUniqueMock.mockResolvedValue(null);

      await recordAccessRequest({ email: "revoked@example.com", name: "Revoked Person", image: null });

      expect(accessRequestUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ar1" },
          data: expect.objectContaining({ resolvedAt: null, attempts: { increment: 1 } }),
        }),
      );
      expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
      expect(notifyAdminsMock.mock.calls[0][2]).toBe("/admin");
    });

    it("looks the allowlist up by the same lowercased needle it stores", async () => {
      accessRequestFindUniqueMock.mockResolvedValue({
        id: "ar1",
        status: "pending",
        attempts: 2,
        resolvedAt: new Date("2026-09-01T00:00:00Z"),
      });

      await recordAccessRequest({ email: "  ReVoked@Example.COM ", name: null, image: null });

      expect(allowedEmailFindUniqueMock).toHaveBeenCalledWith({
        where: { email: "revoked@example.com" },
        select: { id: true },
      });
    });

    it("does NOT reopen while the approval still stands — the address is allowlisted", async () => {
      accessRequestFindUniqueMock.mockResolvedValue({
        id: "ar1",
        status: "pending",
        attempts: 2,
        resolvedAt: new Date("2026-09-01T00:00:00Z"),
      });
      allowedEmailFindUniqueMock.mockResolvedValue({ id: "ae1" });

      await recordAccessRequest({ email: "approved@example.com", name: null, image: null });

      const data = accessRequestUpdateMock.mock.calls[0][0].data;
      expect(data.resolvedAt).toBeUndefined();
      expect(notifyAdminsMock).not.toHaveBeenCalled();
    });

    it("does NOT reopen a DISMISSED request, even with no allowlist row — dismiss means dismissed", async () => {
      accessRequestFindUniqueMock.mockResolvedValue({
        id: "ar1",
        status: "dismissed",
        attempts: 5,
        resolvedAt: new Date("2026-09-01T00:00:00Z"),
      });
      allowedEmailFindUniqueMock.mockResolvedValue(null);

      await recordAccessRequest({ email: "declined@example.com", name: null, image: null });

      const data = accessRequestUpdateMock.mock.calls[0][0].data;
      expect(data.resolvedAt).toBeUndefined();
      expect(data.status).toBeUndefined();
      expect(notifyAdminsMock).not.toHaveBeenCalled();
      // The allowlist is never even consulted for a dismissed row.
      expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
    });

    it("does NOT reopen (or re-notify) a request that is still open", async () => {
      accessRequestFindUniqueMock.mockResolvedValue({
        id: "ar1",
        status: "pending",
        attempts: 2,
        resolvedAt: null,
      });

      await recordAccessRequest({ email: "waiting@example.com", name: null, image: null });

      expect(notifyAdminsMock).not.toHaveBeenCalled();
      expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
    });

    it("still never throws when the reopen notification rejects", async () => {
      accessRequestFindUniqueMock.mockResolvedValue({
        id: "ar1",
        status: "pending",
        attempts: 2,
        resolvedAt: new Date("2026-09-01T00:00:00Z"),
      });
      allowedEmailFindUniqueMock.mockResolvedValue(null);
      notifyAdminsMock.mockRejectedValueOnce(new Error("push down"));

      await expect(
        recordAccessRequest({ email: "revoked@example.com", name: null, image: null }),
      ).resolves.toBeUndefined();
    });
  });

  it("stamps a fresh lastAttemptAt on a repeat", async () => {
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", status: "pending", attempts: 1 });
    await recordAccessRequest({ email: "new@example.com", name: null, image: null });
    const data = accessRequestUpdateMock.mock.calls[0][0].data;
    expect(data.lastAttemptAt).toBeInstanceOf(Date);
  });

  it("writes the email lowercased and trimmed, matching lib/allowlist.ts's needle", async () => {
    accessRequestFindUniqueMock.mockResolvedValue(null);
    await recordAccessRequest({ email: "  MiXed@Example.COM  ", name: null, image: null });
    expect(accessRequestFindUniqueMock).toHaveBeenCalledWith({ where: { email: "mixed@example.com" } });
    expect(accessRequestCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "mixed@example.com" }) }),
    );
  });

  it("never throws when the database rejects — a clean refusal must not become a 500", async () => {
    accessRequestFindUniqueMock.mockRejectedValue(new Error("db down"));
    await expect(
      recordAccessRequest({ email: "x@example.com", name: null, image: null }),
    ).resolves.toBeUndefined();
  });

  it("never throws when notifyAdmins itself rejects", async () => {
    accessRequestFindUniqueMock.mockResolvedValue(null);
    notifyAdminsMock.mockRejectedValue(new Error("push exploded"));
    await expect(
      recordAccessRequest({ email: "y@example.com", name: null, image: null }),
    ).resolves.toBeUndefined();
  });

  it("does nothing for an email that is empty once trimmed", async () => {
    await recordAccessRequest({ email: "   ", name: null, image: null });
    expect(accessRequestFindUniqueMock).not.toHaveBeenCalled();
    expect(accessRequestCreateMock).not.toHaveBeenCalled();
  });

  describe("losing a create race (fix round 1, item 5)", () => {
    it("falls through to a bump (by email, not id) when create raises P2002", async () => {
      accessRequestFindUniqueMock.mockResolvedValue(null);
      accessRequestCreateMock.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );

      await recordAccessRequest({ email: "race@example.com", name: null, image: null });

      expect(accessRequestUpdateMock).toHaveBeenCalledWith({
        where: { email: "race@example.com" },
        data: {
          lastAttemptAt: expect.any(Date),
          attempts: { increment: 1 },
        },
      });
    });

    it("does not notify on the losing side of the race — the winning create already will", async () => {
      accessRequestFindUniqueMock.mockResolvedValue(null);
      accessRequestCreateMock.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );

      await recordAccessRequest({ email: "race@example.com", name: null, image: null });

      expect(notifyAdminsMock).not.toHaveBeenCalled();
    });

    it("still resolves without throwing when create raises P2002", async () => {
      accessRequestFindUniqueMock.mockResolvedValue(null);
      accessRequestCreateMock.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );

      await expect(
        recordAccessRequest({ email: "race@example.com", name: null, image: null }),
      ).resolves.toBeUndefined();
    });

    it("does not swallow a non-P2002 create error into the bump path (still never throws overall)", async () => {
      accessRequestFindUniqueMock.mockResolvedValue(null);
      accessRequestCreateMock.mockRejectedValue(new Error("db exploded"));

      await expect(
        recordAccessRequest({ email: "z@example.com", name: null, image: null }),
      ).resolves.toBeUndefined();
      expect(accessRequestUpdateMock).not.toHaveBeenCalled();
      expect(notifyAdminsMock).not.toHaveBeenCalled();
    });
  });
});
