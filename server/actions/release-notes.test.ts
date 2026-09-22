import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { user: { update: vi.fn() } },
}));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { revalidatePath } from "next/cache";
import { RELEASE_NOTES } from "@/lib/release-notes";
import { dismissWhatsNew } from "./release-notes";

const mockUpdate = db.user.update as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const mockRevalidatePath = revalidatePath as unknown as ReturnType<typeof vi.fn>;

describe("dismissWhatsNew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1", email: "a@b.c" });
    mockUpdate.mockResolvedValue({});
  });

  it("stamps the signed-in Traveller as caught up", async () => {
    const result = await dismissWhatsNew();
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1" });
    expect(arg.data.whatsNewSeenAt).toBeInstanceOf(Date);
    expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/[tripId]", "page");
  });

  it("writes only to the session's own user, never to an id from the caller", async () => {
    // The action takes no arguments at all — there is no user id on the wire
    // for a caller to tamper with. This test pins that shape.
    expect(dismissWhatsNew.length).toBe(0);
    await dismissWhatsNew();
    expect(mockUpdate.mock.calls[0][0].where).toEqual({ id: "u1" });
  });

  it("identifies the Traveller before it writes", async () => {
    const order: string[] = [];
    mockRequireUser.mockImplementation(async () => {
      order.push("auth");
      return { id: "u1", email: "a@b.c" };
    });
    mockUpdate.mockImplementation(async () => {
      order.push("write");
      return {};
    });
    await dismissWhatsNew();
    expect(order).toEqual(["auth", "write"]);
  });

  it("stamps at least as late as a future-dated note, so the dismissal actually sticks", async () => {
    // Notes are hand-written constants with no relationship to deploy time.
    // A note timestamped ahead of "now" must not leave the card
    // un-dismissable: seenAt has to cover it, not just the moment of the
    // click, or unreadReleaseNotes would call it unread again immediately.
    const futurePublishedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    RELEASE_NOTES.unshift({ publishedAt: futurePublishedAt, text: "From the future" });
    try {
      await dismissWhatsNew();
      const stamped = mockUpdate.mock.calls[0][0].data.whatsNewSeenAt as Date;
      expect(stamped.getTime()).toBeGreaterThanOrEqual(Date.parse(futurePublishedAt));
    } finally {
      RELEASE_NOTES.shift();
    }
  });
});
