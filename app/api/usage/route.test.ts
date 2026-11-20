import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, storeMock, readMock, reportErrorMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  storeMock: vi.fn(),
  readMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));
vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/usage/store", () => ({ storeUsageBatch: storeMock }));
vi.mock("@/lib/usage/switch", () => ({ readUsageRecording: readMock }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

let POST: typeof import("./route").POST;

beforeEach(async () => {
  vi.resetModules();
  ({ POST } = await import("./route"));
  authMock.mockResolvedValue({ user: { id: "it-usage-a", email: "a@example.test", name: null, image: null } });
  readMock.mockResolvedValue(true);
  storeMock.mockResolvedValue(1);
  reportErrorMock.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

const record = () => ({ screen: "trips", at: Date.now(), mode: "desktop" });

function post(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://x/api/usage", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/usage", () => {
  it("stores a batch under the session's user and says recording is on", async () => {
    const res = await POST(post({ records: [record()] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ recording: true });
    expect(storeMock).toHaveBeenCalledWith("it-usage-a", [expect.objectContaining({ screen: "trips" })]);
  });

  it("is 401 with no session and never reads the body", async () => {
    authMock.mockResolvedValue(null);
    const req = post({ records: [record()] });
    const text = vi.spyOn(req, "text");
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
    expect(text).not.toHaveBeenCalled();
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("is 429 on the 31st request in a minute", async () => {
    for (let i = 0; i < 30; i++) expect((await POST(post({ records: [record()] }))).status).toBe(200);
    const res = await POST(post({ records: [record()] }));
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(storeMock).toHaveBeenCalledTimes(30);
  });

  it("is 413 for a 40 KB body", async () => {
    const res = await POST(post({ records: [record()], pad: "x".repeat(40_000) }));
    expect(res.status).toBe(413);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("is 413 from the declared length without reading the body", async () => {
    const req = post({ records: [record()] }, { "content-length": "40000" });
    const text = vi.spyOn(req, "text");
    expect((await POST(req)).status).toBe(413);
    expect(text).not.toHaveBeenCalled();
  });

  it("counts bytes, not characters", async () => {
    const res = await POST(post(`{"records":[],"x":"${"é".repeat(17_000)}"}`));
    expect(res.status).toBe(413);
  });

  it.each([
    ["not JSON", "not json"],
    ["an extra top-level key", { records: [], extra: 1 }],
    ["no records", { records: [] }],
  ])("is 400 for %s", async (_, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(storeMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("stores nothing and says so when recording is off", async () => {
    readMock.mockResolvedValue(false);
    const res = await POST(post({ records: [record()] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recording: false });
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("takes the user from the session even when the body names another", async () => {
    await POST(post({ records: [{ ...record(), userId: "someone-else" }, record()] }));
    expect(storeMock).toHaveBeenCalledWith("it-usage-a", [expect.not.objectContaining({ userId: expect.anything() })]);
  });

  it("a store failure is a 503 with a fixed message and no detail", async () => {
    storeMock.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=hunter2"));
    const res = await POST(post({ records: [record()] }));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const [err, ctx] = reportErrorMock.mock.calls[0];
    expect((err as Error).message).toBe("Usage batch was not stored");
    expect(ctx).toEqual({ route: "/api/usage", source: "server", userId: "it-usage-a" });
  });

  it("a switch read that throws is a 503, never 'recording off'", async () => {
    readMock.mockRejectedValue(new Error("db down"));
    const res = await POST(post({ records: [record()] }));
    expect(res.status).toBe(503);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("an auth() that throws is a 503 with no user", async () => {
    authMock.mockRejectedValue(new Error("auth down"));
    const res = await POST(post({ records: [record()] }));
    expect(res.status).toBe(503);
    expect(reportErrorMock.mock.calls[0][1]).toEqual({ route: "/api/usage", source: "server", userId: undefined });
  });

  it("a reportError that throws still answers 503", async () => {
    storeMock.mockRejectedValue(new Error("x"));
    reportErrorMock.mockRejectedValue(new Error("sink down"));
    expect((await POST(post({ records: [record()] }))).status).toBe(503);
  });
});
