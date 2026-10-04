import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("./welcome-dialog", () => ({
  WelcomeDialog: () => "welcome-dialog",
}));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WelcomeDialog } from "./welcome-dialog";
import { WelcomeGate } from "./welcome-gate";

const mockFindUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;

const SEEN = new Date("2026-10-01T00:00:00Z");

describe("WelcomeGate (spec 2026-10-01 §G; waits for a name, spec 2026-10-04 §E)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1" });
  });

  it("reads the Welcome stamp and both names in one query", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: "Cam", displayName: null });
    await WelcomeGate();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { welcomeSeenAt: true, name: true, displayName: true },
    });
  });

  it("a named Traveller who hasn't seen the Welcome gets it", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: "Cameron Williams", displayName: null });
    expect(((await WelcomeGate()) as ReactElement | null)?.type).toBe(WelcomeDialog);
  });

  it("holds the Welcome back while the Traveller is nameless (the layout's NameDialog asks first)", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: null, displayName: null });
    expect(await WelcomeGate()).toBeNull();
  });

  it("a whitespace-only provider name counts as nameless", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: "   ", displayName: null });
    expect(await WelcomeGate()).toBeNull();
  });

  it("once a display name is saved, the still-owed Welcome follows", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: null, displayName: "Xanthia" });
    expect(((await WelcomeGate()) as ReactElement | null)?.type).toBe(WelcomeDialog);
  });

  it("renders nothing once named and seen", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: SEEN, name: null, displayName: "Xanthia" });
    expect(await WelcomeGate()).toBeNull();
  });

  it("renders nothing rather than throwing when the user row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await WelcomeGate()).toBeNull();
  });
});
