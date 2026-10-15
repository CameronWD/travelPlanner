import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  consentFindManyMock,
  consentFindFirstMock,
  accessTokenGroupByMock,
  disconnectMock,
  notFoundMock,
  revalidateAccountPageMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  consentFindManyMock: vi.fn(),
  consentFindFirstMock: vi.fn(),
  accessTokenGroupByMock: vi.fn(),
  disconnectMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  revalidateAccountPageMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    oauthConsent: { findMany: consentFindManyMock, findFirst: consentFindFirstMock },
    oauthAccessToken: { groupBy: accessTokenGroupByMock },
  },
}));
vi.mock("@/lib/auth", () => ({ authServer: { api: { disconnectMcpClient: disconnectMock } } }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/revalidate", () => ({ revalidateAccountPage: revalidateAccountPageMock }));

import { disconnectApp, listConnectedApps } from "@/server/actions/connected-apps";

const consentRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "consent-1",
  clientId: "client-1",
  userId: "user-1",
  createdAt: new Date("2026-10-12T01:00:00.000Z"),
  client: { name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] },
  ...over,
});

beforeEach(() => {
  consentFindManyMock.mockResolvedValue([]);
  consentFindFirstMock.mockResolvedValue(null);
  accessTokenGroupByMock.mockResolvedValue([]);
  disconnectMock.mockResolvedValue({ disconnected: true });
});

afterEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

describe("listConnectedApps", () => {
  it("checks the Traveller first and reads only their own consents", async () => {
    await listConnectedApps();
    expect(requireUserMock).toHaveBeenCalled();
    expect(consentFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });

  it("refuses a signed-out caller before touching the database", async () => {
    requireUserMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(listConnectedApps()).rejects.toThrow("NEXT_REDIRECT");
    expect(consentFindManyMock).not.toHaveBeenCalled();
  });

  it("returns nothing when nothing is connected", async () => {
    expect(await listConnectedApps()).toEqual([]);
  });

  it("shows each app's name, where it returns to, when it was connected and when it was last used", async () => {
    consentFindManyMock.mockResolvedValue([consentRow()]);
    accessTokenGroupByMock.mockResolvedValue([
      { clientId: "client-1", _max: { createdAt: new Date("2026-10-12T08:00:00.000Z") } },
    ]);

    expect(await listConnectedApps()).toEqual([
      {
        id: "consent-1",
        clientName: "Claude",
        returnsTo: "claude.ai",
        connectedAt: "2026-10-12T01:00:00.000Z",
        lastUsedAt: "2026-10-12T08:00:00.000Z",
      },
    ]);
    // Last used is the Traveller's OWN latest token for that app, never another Traveller's.
    expect(accessTokenGroupByMock).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["clientId"], where: { userId: "user-1", clientId: { in: ["client-1"] } } }),
    );
  });

  it("names an unnamed app 'An app', with the host it returns to so it can be recognised", async () => {
    consentFindManyMock.mockResolvedValue([
      consentRow({ client: { name: null, redirectUris: ["http://localhost:53712/callback"] } }),
    ]);
    const [app] = await listConnectedApps();
    expect(app.clientName).toBe("An app");
    expect(app.returnsTo).toBe("localhost:53712");
  });

  it("has no last-used time for an app with no token left, and no host for a client with no redirect", async () => {
    consentFindManyMock.mockResolvedValue([consentRow({ client: { name: "Claude", redirectUris: [] } })]);
    const [app] = await listConnectedApps();
    expect(app.lastUsedAt).toBeNull();
    expect(app.returnsTo).toBeNull();
  });

  it("skips the last-used read entirely when nothing is connected", async () => {
    await listConnectedApps();
    expect(accessTokenGroupByMock).not.toHaveBeenCalled();
  });
});

describe("disconnectApp", () => {
  it("ends that app's access for this Traveller through the auth server", async () => {
    consentFindFirstMock.mockResolvedValue(consentRow());
    expect(await disconnectApp("consent-1")).toEqual({ success: true });
    expect(consentFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "consent-1", userId: "user-1" } }),
    );
    expect(disconnectMock).toHaveBeenCalledWith({ body: { userId: "user-1", clientId: "client-1" } });
  });

  it("revalidates the Account page after a successful disconnect", async () => {
    consentFindFirstMock.mockResolvedValue(consentRow());
    await disconnectApp("consent-1");
    expect(revalidateAccountPageMock).toHaveBeenCalledOnce();
  });

  it("answers not found for a consent that is not this Traveller's, and revokes nothing", async () => {
    consentFindFirstMock.mockResolvedValue(null);
    await expect(disconnectApp("someone-elses")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
    expect(disconnectMock).not.toHaveBeenCalled();
    expect(revalidateAccountPageMock).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller before looking anything up", async () => {
    requireUserMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(disconnectApp("consent-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(consentFindFirstMock).not.toHaveBeenCalled();
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("reports a failure plainly when the revoke throws, without revalidating", async () => {
    consentFindFirstMock.mockResolvedValue(consentRow());
    disconnectMock.mockRejectedValueOnce(new Error("db down"));
    expect(await disconnectApp("consent-1")).toEqual({
      success: false,
      errors: { _: ["Couldn't disconnect that app. Try again."] },
    });
    expect(revalidateAccountPageMock).not.toHaveBeenCalled();
  });
});
