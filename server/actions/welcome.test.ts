import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { user: { update: vi.fn() } },
}));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { revalidatePath } from "next/cache";
import { markWelcomeSeen } from "./welcome";

const mockUpdate = db.user.update as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const mockRevalidatePath = revalidatePath as unknown as ReturnType<typeof vi.fn>;

describe("markWelcomeSeen (spec 2026-10-01 §G)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1", email: "a@b.c" });
    mockUpdate.mockResolvedValue({});
  });

  it("stamps the signed-in Traveller's welcomeSeenAt and revalidates Trips", async () => {
    const before = Date.now();
    const result = await markWelcomeSeen();
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1" });
    expect(arg.data.welcomeSeenAt).toBeInstanceOf(Date);
    expect((arg.data.welcomeSeenAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("takes no arguments: the row written is always the session's own", async () => {
    expect(markWelcomeSeen.length).toBe(0);
    await markWelcomeSeen();
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
    await markWelcomeSeen();
    expect(order).toEqual(["auth", "write"]);
  });
});
