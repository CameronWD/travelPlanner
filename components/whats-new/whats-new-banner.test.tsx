import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("./whats-new-card", () => ({
  WhatsNewCard: (props: { notes: unknown[]; totalUnread: number }) => props,
}));
vi.mock("@/lib/release-notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/release-notes")>();
  return {
    ...actual,
    RELEASE_NOTES: [
      { publishedAt: "2026-09-21T12:00:00Z", text: "One" },
      { publishedAt: "2026-09-21T11:00:00Z", text: "Two" },
      { publishedAt: "2026-09-21T10:00:00Z", text: "Three" },
      { publishedAt: "2026-09-21T09:00:00Z", text: "Four" },
    ],
  };
});

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WhatsNewBanner } from "./whats-new-banner";

const mockFindUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;

describe("WhatsNewBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1" });
  });

  it("caps the card at three but reports the true unread total", async () => {
    mockFindUnique.mockResolvedValue({
      whatsNewSeenAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const el = await WhatsNewBanner();
    expect(el!.props.notes).toHaveLength(3);
    expect(el!.props.totalUnread).toBe(4);
  });

  it("renders nothing when the Traveller is caught up", async () => {
    mockFindUnique.mockResolvedValue({
      whatsNewSeenAt: new Date("2026-09-22T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(await WhatsNewBanner()).toBeNull();
  });

  it("renders nothing rather than throwing when the user row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await WhatsNewBanner()).toBeNull();
  });

  it("treats a brand-new Traveller as caught up", async () => {
    mockFindUnique.mockResolvedValue({
      whatsNewSeenAt: null,
      createdAt: new Date("2026-09-22T00:00:00Z"),
    });
    expect(await WhatsNewBanner()).toBeNull();
  });
});
