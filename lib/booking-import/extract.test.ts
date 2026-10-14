import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_EXTRACTION } from "@/test/fixtures/booking-import/sample-extraction";

const { mockParse } = vi.hoisted(() => ({ mockParse: vi.fn() }));

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
  function MockAnthropic() {
    return { messages: { parse: mockParse } };
  }
  return { default: MockAnthropic, APIError, APIConnectionError };
});

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: vi.fn((schema) => ({ _schema: schema, _isAutoParseableFormat: true })),
}));

import { buildContent, extractBooking, EXTRACTION_MAX_TOKENS } from "./extract";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_INSTRUCTION } from "./prompt";

type SdkErrors = {
  APIError: new (status: number | undefined, message: string) => Error;
  APIConnectionError: new () => Error;
};
const sdk = async () => (await import("@anthropic-ai/sdk")) as unknown as SdkErrors;

const SAMPLE_TEXT = readFileSync(path.resolve(__dirname, "../../test/fixtures/booking-import/sample-booking.txt"), "utf8");
const OK_RESPONSE = {
  parsed_output: SAMPLE_EXTRACTION,
  stop_reason: "end_turn",
  usage: { input_tokens: 5_200, output_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-test";
  delete process.env.AI_MODEL;
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_MODEL;
});

describe("buildContent", () => {
  it("puts PDFs and images first, as base64 document and image blocks, then the text, then the instruction", () => {
    const content = buildContent([
      { type: "text", text: SAMPLE_TEXT },
      { type: "pdf", base64: "UERG" },
      { type: "image", mediaType: "image/png", base64: "UE5H" },
    ]);
    expect(content).toEqual([
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "UERG" } },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "UE5H" } },
      { type: "text", text: `<booking_text>\n${SAMPLE_TEXT}\n</booking_text>` },
      { type: "text", text: EXTRACTION_USER_INSTRUCTION },
    ]);
  });
});

describe("extractBooking request", () => {
  it("uses the default model, low effort, the system prompt, and no sampling or thinking params", async () => {
    mockParse.mockResolvedValueOnce(OK_RESPONSE);
    await extractBooking([{ type: "pdf", base64: "UERG" }, { type: "text", text: "hello" }]);
    const req = mockParse.mock.calls[0][0] as Record<string, unknown>;
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(EXTRACTION_MAX_TOKENS);
    expect(req.system).toBe(EXTRACTION_SYSTEM_PROMPT);
    expect(req.output_config).toMatchObject({ effort: "low", format: { _isAutoParseableFormat: true } });
    for (const key of ["temperature", "top_p", "top_k", "thinking"]) expect(req).not.toHaveProperty(key);
    const content = (req.messages as Array<{ role: string; content: Array<{ type: string }> }>)[0].content;
    expect(content.map((b) => b.type)).toEqual(["document", "text", "text"]);
  });

  it("reads the model from AI_MODEL", async () => {
    process.env.AI_MODEL = "claude-sonnet-5-5";
    mockParse.mockResolvedValueOnce(OK_RESPONSE);
    const outcome = await extractBooking([{ type: "text", text: "hello" }]);
    expect(mockParse.mock.calls[0][0]).toMatchObject({ model: "claude-sonnet-5-5" });
    expect(outcome.model).toBe("claude-sonnet-5-5");
  });
});

describe("extractBooking outcomes", () => {
  it("returns the re-validated extraction and the token usage", async () => {
    mockParse.mockResolvedValueOnce(OK_RESPONSE);
    const outcome = await extractBooking([{ type: "text", text: SAMPLE_TEXT }]);
    expect(outcome).toEqual({
      kind: "ok",
      model: "claude-haiku-5-5",
      usage: { inputTokens: 5_200, outputTokens: 900, cacheReadTokens: 0, cacheWriteTokens: 0 },
      extraction: SAMPLE_EXTRACTION,
    });
  });

  it.each(["max_tokens", "refusal"])("treats stop_reason %s as unreadable, with a report", async (stop_reason) => {
    mockParse.mockResolvedValueOnce({ ...OK_RESPONSE, stop_reason });
    const outcome = await extractBooking([{ type: "text", text: "x" }]);
    expect(outcome.kind).toBe("unreadable");
    if (outcome.kind === "unreadable") expect(outcome.report.message).toContain(stop_reason);
    expect(outcome.usage.inputTokens).toBe(5_200);
  });

  it("treats a reply that fails validation as unreadable", async () => {
    mockParse.mockResolvedValueOnce({ ...OK_RESPONSE, parsed_output: { isBooking: "yes" } });
    expect((await extractBooking([{ type: "text", text: "x" }])).kind).toBe("unreadable");
    mockParse.mockResolvedValueOnce({ ...OK_RESPONSE, parsed_output: null });
    expect((await extractBooking([{ type: "text", text: "x" }])).kind).toBe("unreadable");
  });

  it.each([429, 500, 529])("maps Anthropic %i (after SDK retries) to busy", async (status) => {
    const { APIError } = await sdk();
    mockParse.mockRejectedValueOnce(new APIError(status, "Overloaded"));
    expect(await extractBooking([{ type: "text", text: "x" }])).toEqual({
      kind: "busy",
      model: "claude-haiku-5-5",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  });

  it("maps a connection failure to busy", async () => {
    const { APIConnectionError } = await sdk();
    mockParse.mockRejectedValueOnce(new APIConnectionError());
    expect((await extractBooking([{ type: "text", text: "x" }])).kind).toBe("busy");
  });

  it.each([400, 401, 403])("maps Anthropic %i to api_error with its status", async (status) => {
    const { APIError } = await sdk();
    mockParse.mockRejectedValueOnce(new APIError(status, "bad"));
    expect(await extractBooking([{ type: "text", text: "x" }])).toMatchObject({ kind: "api_error", status });
  });

  it("never forwards a thrown error's message (it can quote the document)", async () => {
    mockParse.mockRejectedValueOnce(new SyntaxError("Unexpected token in 'Casa do Rio Lisboa'"));
    const outcome = await extractBooking([{ type: "text", text: "x" }]);
    expect(outcome.kind).toBe("unreadable");
    if (outcome.kind === "unreadable") expect(outcome.report.message).not.toContain("Casa do Rio");
  });
});
