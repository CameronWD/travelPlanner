import { describe, expect, it, vi, afterEach } from "vitest";

const { healMock } = vi.hoisted(() => ({ healMock: vi.fn() }));
vi.mock("@/server/actions/push", () => ({ healRotatedSubscription: healMock }));

import { POST } from "./route";

afterEach(() => vi.clearAllMocks());

function post(body: unknown, ua = "Mozilla/5.0") {
  return new Request("http://localhost/api/push", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push", () => {
  it("heals a rotation and answers 200", async () => {
    healMock.mockResolvedValue({ ok: true, mode: "updated" });
    const res = await POST(post({ oldEndpoint: "https://old", endpoint: "https://new", keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "updated" });
  });

  it("passes the request's user agent through so a new row gets a device label", async () => {
    healMock.mockResolvedValue({ ok: true, mode: "registered" });
    await POST(post({ endpoint: "https://new", keys: { p256dh: "p", auth: "a" } }, "iPhone-UA"));
    expect(healMock).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "iPhone-UA" }));
  });

  it("rejects a body with no endpoint", async () => {
    const res = await POST(post({ keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(400);
    expect(healMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without throwing", async () => {
    const req = new Request("http://localhost/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("answers 401 when there is no session", async () => {
    healMock.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" }));
    const res = await POST(post({ endpoint: "https://new", keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(401);
  });
});
