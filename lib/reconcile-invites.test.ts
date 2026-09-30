import { describe, it, expect, vi } from "vitest";

const { acceptInvites, acceptGlobeInvites } = vi.hoisted(() => ({ acceptInvites: vi.fn(), acceptGlobeInvites: vi.fn() }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: acceptInvites }));
vi.mock("@/lib/globe-invites", () => ({ acceptPendingGlobeInvitesForUser: acceptGlobeInvites }));

import { reconcilePendingInvites } from "./reconcile-invites";

describe("reconcilePendingInvites (ADR 0017)", () => {
  it("accepts pending Trip and Globe Invites for the signed-in email", async () => {
    await reconcilePendingInvites("u1", "alice@example.com");
    expect(acceptInvites).toHaveBeenCalledWith("u1", "alice@example.com");
    expect(acceptGlobeInvites).toHaveBeenCalledWith("u1", "alice@example.com");
  });
});
