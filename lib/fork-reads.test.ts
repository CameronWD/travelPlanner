import { describe, it, expect, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const { requireTripAccess, forkFindMany } = vi.hoisted(() => ({
  requireTripAccess: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  forkFindMany: vi.fn().mockResolvedValue([{ id: "f1", name: "Plan B", sortOrder: 0 }]),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({ db: { fork: { findMany: forkFindMany } } }));

import { listForks } from "./fork-reads";

describe("listForks", () => {
  it("checks Trip access, then lists the Trip's Forks in sortOrder", async () => {
    expect(await listForks("t1")).toEqual([{ id: "f1", name: "Plan B", sortOrder: 0 }]);
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
    expectAccessCheckedBeforeWrite(requireTripAccess, forkFindMany);
    expect(forkFindMany).toHaveBeenCalledWith({ where: { tripId: "t1" }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sortOrder: true } });
  });
});
