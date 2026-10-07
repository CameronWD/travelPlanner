import { describe, it, expect, vi } from "vitest";

const { acceptInvites, acceptGlobeInvites } = vi.hoisted(() => ({ acceptInvites: vi.fn(), acceptGlobeInvites: vi.fn() }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: acceptInvites }));
vi.mock("@/lib/globe-invites", () => ({ acceptPendingGlobeInvitesForUser: acceptGlobeInvites }));

import { reconcilePendingInvites } from "./reconcile-invites";

describe("reconcilePendingInvites (ADR 0017)", () => {
  it("accepts pending Trip and Globe Invites for the signed-in email", async () => {
    acceptInvites.mockResolvedValue(undefined);
    acceptGlobeInvites.mockResolvedValue(undefined);
    await reconcilePendingInvites("u1", "alice@example.com");
    expect(acceptInvites).toHaveBeenCalledWith("u1", "alice@example.com");
    expect(acceptGlobeInvites).toHaveBeenCalledWith("u1", "alice@example.com");
  });

  it("runs the two accepts in parallel (spec 2026-10-06 §C)", async () => {
    acceptInvites.mockImplementation(() => new Promise(() => {})); // never settles
    acceptGlobeInvites.mockResolvedValue(undefined);
    void reconcilePendingInvites("u2", "bob@example.com");
    await vi.waitFor(() => expect(acceptGlobeInvites).toHaveBeenCalledWith("u2", "bob@example.com"));
  });
});
