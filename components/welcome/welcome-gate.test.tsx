import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("./welcome-dialog", () => ({
  WelcomeDialog: () => "welcome-dialog",
}));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WelcomeGate } from "./welcome-gate";

const mockFindUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;

describe("WelcomeGate (spec 2026-10-01 §G)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1" });
  });

  it("renders the dialog while welcomeSeenAt is null — existing Travellers included", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null });
    const el = await WelcomeGate();
    expect(el).not.toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { welcomeSeenAt: true },
    });
  });

  it("renders nothing once seen", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: new Date("2026-10-01T00:00:00Z") });
    expect(await WelcomeGate()).toBeNull();
  });

  it("renders nothing rather than throwing when the user row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await WelcomeGate()).toBeNull();
  });
});
