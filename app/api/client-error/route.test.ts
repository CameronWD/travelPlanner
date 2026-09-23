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

  // C1 (fix round 1): message is the entire entropy of reportError's dedup
  // signature and this route is unauthenticated — an unbounded message let
  // a caller mint a fresh signature (and, before this round, a fresh push)
  // on demand.
  //
  // D2 (final fix wave): the bound TRUNCATES rather than rejects. Rejecting
  // dropped the whole report — no row, no console line — for a legitimate
  // client error that happened to carry a long message, which trades an
  // observation away for nothing: truncation bounds the entropy identically.
  it("D2: truncates an over-long message instead of dropping the report", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    const res = await POST(post({ message: "x".repeat(900) }));

    expect(res.status).toBe(204);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const err = reportErrorMock.mock.calls[0][0] as Error;
    expect(err.message).toHaveLength(500);
  });

  it("D2: truncates an over-long route instead of dropping the report", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    const res = await POST(post({ message: "boom", route: "/".repeat(400) }));

    expect(res.status).toBe(204);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const ctx = reportErrorMock.mock.calls[0][1] as { route?: string };
    expect(ctx.route).toHaveLength(200);
  });

  it("D2: truncates an over-long digest instead of dropping the report", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    const res = await POST(post({ message: "boom", digest: "d".repeat(400) }));

    expect(res.status).toBe(204);
    const ctx = reportErrorMock.mock.calls[0][1] as { digest?: string };
    expect(ctx.digest).toHaveLength(200);
  });

  it("C1: accepts a message right at the cap unchanged", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);
    const res = await POST(post({ message: "x".repeat(500) }));
    expect(res.status).toBe(204);
    expect(reportErrorMock).toHaveBeenCalled();
    expect((reportErrorMock.mock.calls[0][0] as Error).message).toHaveLength(500);
  });

  it("still drops a body with no message at all — min(1) is untouched", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(post({ message: "" }));
    expect(res.status).toBe(204);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  // I2 (fix round 1): React replaces a server-component error's message with
  // one fixed generic string in production — the digest is the only thing
  // left that can tell two such reports apart.
  it("I2: passes the React error digest through to reportError", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    await POST(post({ message: "boom", digest: "abc123" }));

    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ digest: "abc123" }),
    );
  });

  it("I2: digest is optional — omitting it still reports", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    await POST(post({ message: "boom" }));

    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ digest: undefined }),
    );
  });

  // I3 (fix round 1): when the client sends no stack, `new Error(message)`
  // retains its OWN stack — pointing at this route handler — unless it's
  // explicitly cleared. A stored stack describing app/api/client-error's own
  // POST function, not the client failure, would be actively misleading
  // (and would feed a wrong frame into reportError's signature).
  it("I3: an omitted client stack does not leak this route's own stack", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    await POST(post({ message: "boom" }));

    const [err] = reportErrorMock.mock.calls[0] as [Error, unknown];
    expect(err.stack).toBeUndefined();
  });

  it("I3: a provided client stack is used verbatim (capped)", async () => {
    authMock.mockResolvedValue(null);
    reportErrorMock.mockResolvedValue(undefined);

    await POST(post({ message: "boom", stack: "at ClientComponent" }));

    const [err] = reportErrorMock.mock.calls[0] as [Error, unknown];
    expect(err.stack).toBe("at ClientComponent");
  });
});
