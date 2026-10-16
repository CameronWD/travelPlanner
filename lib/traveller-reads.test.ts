import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));

import { readWhatsNewSeen, readWelcomeState } from "./traveller-reads";

beforeEach(() => vi.clearAllMocks());

describe("traveller reads", () => {
  it("readWhatsNewSeen selects the What's new stamp and the sign-up date", async () => {
    findUnique.mockResolvedValue({ whatsNewSeenAt: null, createdAt: new Date("2026-01-01T00:00:00Z") });
    await readWhatsNewSeen("u1");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { whatsNewSeenAt: true, createdAt: true } });
  });

  it("readWelcomeState reads the Welcome stamp and both names in one query", async () => {
    findUnique.mockResolvedValue({ welcomeSeenAt: null, name: "Cam", displayName: null });
    await readWelcomeState("u1");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { welcomeSeenAt: true, name: true, displayName: true } });
  });

  it("both return null for a missing row", async () => {
    findUnique.mockResolvedValue(null);
    expect(await readWhatsNewSeen("gone")).toBeNull();
    expect(await readWelcomeState("gone")).toBeNull();
  });
});
