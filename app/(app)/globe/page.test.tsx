import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { viewProps, memberFind, stopFind } = vi.hoisted(() => ({ viewProps: vi.fn(), memberFind: vi.fn(), stopFind: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn(async () => ({ user: { id: "u1" }, globe: { id: "g1" } })) }));
vi.mock("@/lib/db", () => ({
  db: {
    marker: { findMany: vi.fn(async () => []) },
    globeMember: { findMany: vi.fn(async () => []) },
    attachment: { findMany: vi.fn(async () => []) },
    tripMember: { findUnique: memberFind },
    stop: { findMany: stopFind },
  },
}));
vi.mock("@/components/globe/globe-view", () => ({
  GlobeView: (p: Record<string, unknown>) => {
    viewProps(p);
    return null;
  },
}));

import GlobePage from "./page";

const page = async (sp: Record<string, string> = {}) => render(await GlobePage({ searchParams: Promise.resolve(sp) }));

describe("/globe", () => {
  beforeEach(() => {
    viewProps.mockReset();
    memberFind.mockReset().mockResolvedValue({ id: "m1" });
    stopFind.mockReset().mockResolvedValue([{ id: "s1", name: "Kyoto", lat: 35.01, lng: 135.77 }]);
  });
  it("without ?added= there is no arrival", async () => {
    await page();
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ arrival: null }));
    expect(stopFind).not.toHaveBeenCalled();
  });
  it("?added= a trip you're on: its located real-plan stops, in order", async () => {
    await page({ added: "t9" });
    expect(memberFind).toHaveBeenCalledWith({ where: { tripId_userId: { tripId: "t9", userId: "u1" } }, select: { id: true } });
    expect(stopFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { tripId: "t9", forkId: null, lat: { not: null }, lng: { not: null } },
      orderBy: { sortOrder: "asc" },
    }));
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ arrival: { tripId: "t9", pins: [{ id: "s1", name: "Kyoto", lat: 35.01, lng: 135.77 }] } }));
  });
  it("?added= a trip you're not on shows nothing", async () => {
    memberFind.mockResolvedValue(null);
    await page({ added: "t9" });
    expect(stopFind).not.toHaveBeenCalled();
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ arrival: null }));
  });
});
