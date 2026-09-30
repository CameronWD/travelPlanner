import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { shareFindUnique, memberFindFirst, userFindUnique, serveProfilePhoto } = vi.hoisted(() => ({
  shareFindUnique: vi.fn(),
  memberFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  serveProfilePhoto: vi.fn(async () => new Response("img", { status: 200 })),
}));
vi.mock("@/lib/db", () => ({
  db: { shareLink: { findUnique: shareFindUnique }, tripMember: { findFirst: memberFindFirst }, user: { findUnique: userFindUnique } },
}));
vi.mock("@/lib/avatar-serve", () => ({ serveProfilePhoto }));

import { GET } from "./route";

const call = () =>
  GET(new NextRequest("http://x/share/tok/traveller-photo/u1"), { params: Promise.resolve({ token: "tok", userId: "u1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  shareFindUnique.mockResolvedValue({ tripId: "t1", showTravellers: true });
  memberFindFirst.mockResolvedValue({ id: "m1" });
  userFindUnique.mockResolvedValue({ photoKey: "avatars/u1.jpg" });
});

describe("GET /share/:token/traveller-photo/:userId", () => {
  it("serves a member's photo when the link shows travellers", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(serveProfilePhoto).toHaveBeenCalledWith("avatars/u1.jpg", { cacheControl: "private, max-age=300" });
    expect(memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "t1", userId: "u1" } }));
  });
  it.each([
    ["unknown or revoked token", () => shareFindUnique.mockResolvedValue(null)],
    ["dial off", () => shareFindUnique.mockResolvedValue({ tripId: "t1", showTravellers: false })],
    ["not a member of that trip", () => memberFindFirst.mockResolvedValue(null)],
    ["no uploaded photo", () => userFindUnique.mockResolvedValue({ photoKey: null })],
  ])("404s (no-store) when %s", async (_n, arrange) => {
    arrange();
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(serveProfilePhoto).not.toHaveBeenCalled();
  });
  it("never selects email", async () => {
    await call();
    expect(Object.keys(userFindUnique.mock.calls[0][0].select)).toEqual(["photoKey"]);
  });
});
