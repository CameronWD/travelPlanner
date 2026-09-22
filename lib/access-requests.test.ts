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
  notifyAdminsMock,
} = vi.hoisted(() => ({
  accessRequestFindUniqueMock: vi.fn(),
  accessRequestCreateMock: vi.fn(),
  accessRequestUpdateMock: vi.fn(),
  notifyAdminsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: {
      findUnique: accessRequestFindUniqueMock,
      create: accessRequestCreateMock,
      update: accessRequestUpdateMock,
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

  it("bumps lastAttemptAt and attempts on a repeat, without duplicating", async () => {
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", status: "pending", attempts: 3 });
    await recordAccessRequest({ email: "new@example.com", name: null, image: null });
    expect(accessRequestCreateMock).not.toHaveBeenCalled();
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ar1" }, data: expect.objectContaining({ attempts: 4 }) }),
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
});
