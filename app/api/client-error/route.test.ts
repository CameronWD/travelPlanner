import { describe, expect, it, vi, afterEach } from "vitest";

const { reportErrorMock, authMock } = vi.hoisted(() => ({
  reportErrorMock: vi.fn(),
  authMock: vi.fn(),
}));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { POST } from "./route";

afterEach(() => vi.clearAllMocks());

function post(body: unknown) {
  return new Request("http://x/api/client-error", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/client-error", () => {
  it("records a client error and returns 204", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    const res = await POST(
      post({ message: "render failed", stack: "at Foo", route: "/trips/t1" }),
    );

    expect(res.status).toBe(204);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "client" }),
    );
  });

  it("ignores a malformed body without throwing", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(post("not json"));
    expect(res.status).toBe(204);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("is reachable without a session and reports with no userId", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    await POST(post({ message: "sign-in page blew up" }));

    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: "client", userId: undefined }),
    );
  });

  it("captures the session user id when there is one", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    reportErrorMock.mockResolvedValue(undefined);

    await POST(post({ message: "boom" }));

    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "u1" }),
    );
  });

  it("caps an oversized stack before it reaches the sink", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    const hugeStack = "at Foo\n".repeat(10_000); // far beyond any sane cap
    await POST(post({ message: "boom", stack: hugeStack }));

    const [err] = reportErrorMock.mock.calls[0] as [Error, unknown];
    expect(err.stack!.length).toBeLessThan(hugeStack.length);
  });

  it("rejects a body missing the required message field, still 204", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(post({ stack: "at Foo" }));
    expect(res.status).toBe(204);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("never throws even when reportError rejects", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockRejectedValue(new Error("db down"));
    const res = await POST(post({ message: "boom" }));
    expect(res.status).toBe(204);
  });
});
