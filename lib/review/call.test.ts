import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_PLAN, SAMPLE_TODAY } from "@/test/fixtures/review/sample-plan";

const { streamMock, clientMock } = vi.hoisted(() => ({ streamMock: vi.fn(), clientMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number | undefined;
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
    }
  }
  class APIConnectionError extends APIError {
    constructor() {
      super(undefined, "Connection error.");
    }
  }
  class APIUserAbortError extends APIError {
    constructor() {
      super(undefined, "Request was aborted.");
    }
  }
  function MockAnthropic() {
    clientMock();
    return { messages: { stream: streamMock } };
  }
  return { default: MockAnthropic, APIError, APIConnectionError, APIUserAbortError };
});

import { NO_TOKENS } from "@/lib/ai-pricing";
import { callReviewModel, REVIEW_MAX_CONTINUATIONS, REVIEW_MAX_SEARCHES } from "./call";
import { reviewInputFromPlan } from "./input-shape";
import { REVIEW_SYSTEM_PROMPT, SUBMIT_NUDGE, SUBMIT_REVIEW_TOOL } from "./prompt";

type SdkErrors = {
  APIError: new (status: number | undefined, message: string) => Error;
  APIConnectionError: new () => Error;
  APIUserAbortError: new () => Error;
};
const sdk = async () => (await import("@anthropic-ai/sdk")) as unknown as SdkErrors;

const INPUT = reviewInputFromPlan(SAMPLE_PLAN, [], SAMPLE_TODAY);
const OUTPUT = {
  summary: "A Monday closure and a holiday to plan around.",
  findings: [{
    severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "museum", date: "2026-11-02",
    title: "The museum is closed on Mondays", detail: "Kyoto National Museum closes every Monday. Move the visit to Tuesday.",
    source: "https://www.kyohaku.go.jp/eng/visit/",
    suggestedFix: { kind: "item.times", itemId: "museum", startTime: null, endTime: null, date: "2026-11-03" },
  }],
};
const USAGE = {
  input_tokens: 8_000, output_tokens: 1_200, cache_read_input_tokens: 500, cache_creation_input_tokens: 7_000,
  server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 },
};
const submit = (input: unknown = OUTPUT) => ({ type: "tool_use", id: "toolu_1", name: SUBMIT_REVIEW_TOOL, input });
const message = (over: Record<string, unknown> = {}) => ({
  stop_reason: "tool_use", usage: USAGE, content: [{ type: "text", text: "Checking the dates." }, submit()], ...over,
});
const paused = message({ stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Kyoto National Museum Monday" } }] });
const replies = (...ms: unknown[]) => {
  for (const m of ms) streamMock.mockReturnValueOnce({ finalMessage: () => Promise.resolve(m) });
};
const fails = (err: unknown) => streamMock.mockReturnValueOnce({ finalMessage: () => Promise.reject(err) });
const request = (kind: "STANDARD" | "DEEP" = "STANDARD", deadline = Date.now() + 60_000) =>
  callReviewModel({ kind, model: kind === "DEEP" ? "claude-opus-5" : "claude-sonnet-5", input: INPUT, deadline });
const params = (call = 0) => streamMock.mock.calls[call][0] as Record<string, unknown> & { tools: Record<string, unknown>[]; messages: unknown[] };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("callReviewModel request (spec 2026-10-17 R11)", () => {
  it("Standard: one streamed request with web search, a strict submit_review tool, medium effort and no explicit thinking", async () => {
    replies(message());
    await request();
    const p = params();
    expect(p).toMatchObject({
      model: "claude-sonnet-5", max_tokens: 32_000, system: REVIEW_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" }, output_config: { effort: "medium" },
    });
    expect(p.tools[0]).toEqual({ type: "web_search_20260209", name: "web_search", max_uses: REVIEW_MAX_SEARCHES });
    expect(p.tools[1]).toMatchObject({ name: SUBMIT_REVIEW_TOOL, strict: true, input_schema: { type: "object", required: ["summary", "findings"] } });
    expect(p.tools[1]).not.toHaveProperty("eager_input_streaming");
    for (const key of ["thinking", "tool_choice", "temperature", "top_p", "top_k"]) expect(p).not.toHaveProperty(key);
    expect(p.output_config).not.toHaveProperty("format");
    expect(p.messages).toEqual([{ role: "user", content: expect.stringContaining("<trip_plan>") }]);
    expect((streamMock.mock.calls[0][1] as { signal: unknown }).signal).toBeInstanceOf(AbortSignal);
  });

  it("Deep: adaptive thinking, high effort, more room, never budget_tokens", async () => {
    replies(message());
    await request("DEEP");
    const p = params();
    expect(p).toMatchObject({ model: "claude-opus-5", max_tokens: 64_000, thinking: { type: "adaptive" }, output_config: { effort: "high" } });
    expect(JSON.stringify(p)).not.toContain("budget_tokens");
  });
});

describe("callReviewModel result", () => {
  it("returns the validated tool input and the usage, web searches included", async () => {
    replies(message());
    expect(await request()).toEqual({
      kind: "ok", output: OUTPUT,
      usage: { inputTokens: 8_000, outputTokens: 1_200, cacheReadTokens: 500, cacheWriteTokens: 7_000, webSearchRequests: 2 },
    });
  });

  it("resumes a paused turn by re-sending it, with no extra user message, and adds both turns' usage", async () => {
    replies(paused, message());
    const out = await request();
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(params(1).messages).toEqual([params(0).messages[0], { role: "assistant", content: paused.content }]);
    expect(out).toMatchObject({ kind: "ok", usage: { inputTokens: 16_000, webSearchRequests: 4 } });
  });

  it("asks once for the tool call when a turn ends without it", async () => {
    const ended = message({ stop_reason: "end_turn", content: [{ type: "text", text: "All checked." }] });
    replies(ended, message());
    expect((await request()).kind).toBe("ok");
    expect(params(1).messages.slice(1)).toEqual([{ role: "assistant", content: ended.content }, { role: "user", content: SUBMIT_NUDGE }]);
  });

  it("gives up when the nudge also ends without the tool call", async () => {
    const ended = message({ stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] });
    replies(ended, ended);
    const out = await request();
    expect(out).toMatchObject({ kind: "unreadable", report: expect.objectContaining({ message: "Review: no result (stop_reason end_turn)" }) });
    expect(streamMock).toHaveBeenCalledTimes(2);
  });

  it(`stops after ${REVIEW_MAX_CONTINUATIONS} continuations`, async () => {
    replies(...Array.from({ length: REVIEW_MAX_CONTINUATIONS + 1 }, () => paused));
    expect(await request()).toMatchObject({ kind: "unreadable", report: expect.objectContaining({ message: "Review: no result (stop_reason pause_turn)" }) });
    expect(streamMock).toHaveBeenCalledTimes(REVIEW_MAX_CONTINUATIONS + 1);
  });

  it("refuses a tool input that fails the schema, without quoting it", async () => {
    replies(message({ content: [submit({ summary: "x", findings: [{ category: "weather" }] })] }));
    const out = await request();
    expect(out).toMatchObject({ kind: "unreadable", report: expect.objectContaining({ message: "Review: the reply failed validation" }) });
    if (out.kind === "unreadable") expect(out.report.message).not.toContain("weather");
  });

  it.each(["max_tokens", "refusal"])("treats stop_reason %s as unreadable, even with a tool call", async (stop_reason) => {
    replies(message({ stop_reason }));
    expect(await request()).toMatchObject({ kind: "unreadable", report: expect.objectContaining({ message: `Review: stop_reason ${stop_reason}` }) });
  });
});

describe("callReviewModel failures", () => {
  it("never throws when the client cannot start (no key), and names only the error's type", async () => {
    clientMock.mockImplementationOnce(() => {
      throw new Error("The ANTHROPIC_API_KEY environment variable is missing");
    });
    const out = await request();
    expect(out).toMatchObject({ kind: "unreadable", usage: NO_TOKENS, report: expect.objectContaining({ message: "Review: the client could not start (Error)" }) });
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("maps 529 and 429 to busy, another status to api_error, a dropped connection to busy and an abort to timeout", async () => {
    const { APIError, APIConnectionError, APIUserAbortError } = await sdk();
    fails(new APIError(529, "Overloaded"));
    expect(await request()).toEqual({ kind: "busy", usage: NO_TOKENS });
    fails(new APIError(429, "Rate limited"));
    expect((await request()).kind).toBe("busy");
    fails(new APIError(400, "Bad request"));
    expect(await request()).toEqual({ kind: "api_error", usage: NO_TOKENS, status: 400 });
    fails(new APIConnectionError());
    expect((await request()).kind).toBe("busy");
    fails(new APIUserAbortError());
    expect(await request()).toEqual({ kind: "timeout", usage: NO_TOKENS });
  });

  it("never forwards an unknown error's message (it could quote the plan)", async () => {
    fails(new Error("leak: Ryokan Yachiyo"));
    const out = await request();
    expect(out).toMatchObject({ kind: "unreadable", report: expect.objectContaining({ message: "Review: the reply could not be read (Error)" }) });
  });

  it("keeps the usage already spent when a continuation fails", async () => {
    const { APIError } = await sdk();
    replies(paused);
    fails(new APIError(529, "Overloaded"));
    expect(await request()).toMatchObject({ kind: "busy", usage: { inputTokens: 8_000, webSearchRequests: 2 } });
  });

  it("makes no request once the deadline has passed", async () => {
    expect(await request("STANDARD", Date.now() - 1)).toEqual({ kind: "timeout", usage: NO_TOKENS });
    expect(streamMock).not.toHaveBeenCalled();
  });
});
