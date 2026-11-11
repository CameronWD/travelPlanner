import { beforeEach, describe, expect, it, vi } from "vitest";

const accessRequestFindManyMock = vi.hoisted(() => vi.fn());
const inviteFindManyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: { findMany: accessRequestFindManyMock },
    invite: { findMany: inviteFindManyMock },
  },
}));

import { reopenedByInvite } from "./reopened-requests";

const T0 = new Date("2026-11-01T00:00:00.000Z");
const dismissed = (id: string, email: string) => ({ id, email, status: "dismissed", resolvedAt: T0 });

beforeEach(() => {
  accessRequestFindManyMock.mockReset().mockResolvedValue([]);
  inviteFindManyMock.mockReset().mockResolvedValue([]);
});

describe("reopenedByInvite", () => {
  it("returns a dismissed request with an Invite created after its resolvedAt", async () => {
    accessRequestFindManyMock.mockResolvedValue([dismissed("a", "sam@example.com")]);
    inviteFindManyMock.mockResolvedValue([{ email: "sam@example.com", createdAt: new Date("2026-11-02T00:00:00.000Z") }]);
    await expect(reopenedByInvite()).resolves.toEqual([dismissed("a", "sam@example.com")]);
  });

  it("ignores an Invite created before the dismissal", async () => {
    accessRequestFindManyMock.mockResolvedValue([dismissed("a", "sam@example.com")]);
    inviteFindManyMock.mockResolvedValue([{ email: "sam@example.com", createdAt: new Date("2026-10-31T00:00:00.000Z") }]);
    await expect(reopenedByInvite()).resolves.toEqual([]);
  });

  it("matches a mixed-case request email to a lowercased Invite", async () => {
    accessRequestFindManyMock.mockResolvedValue([dismissed("a", "Sam@Example.com")]);
    inviteFindManyMock.mockResolvedValue([{ email: "sam@example.com", createdAt: new Date("2026-11-02T00:00:00.000Z") }]);
    await expect(reopenedByInvite()).resolves.toHaveLength(1);
    expect(inviteFindManyMock.mock.calls[0][0].where.email).toEqual({ in: ["sam@example.com"] });
  });

  it("onlyId restricts the dismissed lookup to that id", async () => {
    await reopenedByInvite("a");
    expect(accessRequestFindManyMock).toHaveBeenCalledWith({ where: { status: "dismissed", id: "a" } });
  });
});
