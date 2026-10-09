import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, findMany } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireUser }));
vi.mock("@/lib/db", () => ({ db: { tripMember: { findMany } } }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";

const trip = (id: string, name: string, startDate: string | null, endDate: string | null) => ({
  trip: { id, name, startDate, endDate, createdAt: new Date("2026-01-01"), stops: [] },
});

describe("list_trips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "u1" });
  });

  it("is listed as a tool", async () => {
    const c = await connectTestClient();
    expect((await c.listTools()).tools.map((t) => t.name)).toContain("list_trips");
  });

  it("lists the acting traveller's non-deleted trips with dates and phase", async () => {
    findMany.mockResolvedValue([
      trip("t1", "Japan", "2099-04-01", "2099-04-20"),
      trip("t2", "Someday Peru", null, null),
      trip("t3", "Lisbon", "2001-05-01", "2001-05-08"),
    ]);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "list_trips", arguments: {} });
    expect(r.isError).toBeFalsy();
    const out = JSON.parse((r.content as { text: string }[])[0].text);
    expect(out).toEqual(expect.arrayContaining([
      { id: "t1", name: "Japan", startDate: "2099-04-01", endDate: "2099-04-20", phase: "planning" },
      { id: "t2", name: "Someday Peru", startDate: null, endDate: null, phase: "sketching" },
      { id: "t3", name: "Lisbon", startDate: "2001-05-01", endDate: "2001-05-08", phase: "past" },
    ]));
    expect(out).toHaveLength(3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", trip: { deletedAt: null } } }));
  });

  it("returns a tool error, not data, when signed out", async () => {
    requireUser.mockRejectedValue(Object.assign(new Error("r"), { digest: "NEXT_REDIRECT;replace;/;307;" }));
    const c = await connectTestClient();
    const r = await c.callTool({ name: "list_trips", arguments: {} });
    expect(r.isError).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });
});
