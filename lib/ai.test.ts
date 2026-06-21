/**
 * Tests for lib/ai.ts
 *
 * Strategy:
 *   - When ANTHROPIC_API_KEY is absent → all functions return { ok:false, reason:"disabled" }
 *     and the SDK is never imported/called.
 *   - When the key is set → the SDK is mocked; tests assert correct model selection,
 *     schema forwarding, and output mapping.
 *   - parsed_output: null → { ok:false, reason:"error" }
 *   - SDK throws → { ok:false, reason:"error" }
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK
// ---------------------------------------------------------------------------

const mockParse = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  function MockAnthropic() {
    return {
      messages: {
        parse: mockParse,
      },
    };
  }
  return {
    default: MockAnthropic,
  };
});

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: vi.fn((schema) => ({
    _schema: schema,
    _isAutoParseableFormat: true,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(key: string | undefined, model?: string) {
  if (key === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = key;
  }
  if (model === undefined) {
    delete process.env.AI_MODEL;
  } else {
    process.env.AI_MODEL = model;
  }
}

// ---------------------------------------------------------------------------
// isAiConfigured
// ---------------------------------------------------------------------------

describe("isAiConfigured", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns false when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { isAiConfigured } = await import("@/lib/ai");
    expect(isAiConfigured()).toBe(false);
  });

  it("returns true when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
    const { isAiConfigured } = await import("@/lib/ai");
    expect(isAiConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// suggestActivities
// ---------------------------------------------------------------------------

describe("suggestActivities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_MODEL;
  });

  it("returns disabled when ANTHROPIC_API_KEY is not set", async () => {
    setEnv(undefined);
    const { suggestActivities } = await import("@/lib/ai");
    const result = await suggestActivities({ stopName: "Paris" });
    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("returns ok:true with mapped data on success", async () => {
    setEnv("sk-test-key");
    const mockOutput = {
      suggestions: [
        { title: "Eiffel Tower", category: "SIGHTSEEING", note: "Iconic landmark." },
        { title: "Café de Flore", category: "FOOD", note: "Historic Parisian café." },
      ],
    };
    mockParse.mockResolvedValueOnce({ parsed_output: mockOutput });

    const { suggestActivities } = await import("@/lib/ai");
    const result = await suggestActivities({ stopName: "Paris", country: "France" });

    expect(result).toEqual({ ok: true, data: mockOutput });
    expect(mockParse).toHaveBeenCalledOnce();
  });

  it("uses default model claude-opus-4-8 when AI_MODEL is not set", async () => {
    setEnv("sk-test-key", undefined);
    mockParse.mockResolvedValueOnce({
      parsed_output: { suggestions: [] },
    });

    const { suggestActivities } = await import("@/lib/ai");
    await suggestActivities({ stopName: "Tokyo" });

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-8" }),
    );
  });

  it("uses AI_MODEL override when set", async () => {
    setEnv("sk-test-key", "claude-sonnet-4-6");
    mockParse.mockResolvedValueOnce({
      parsed_output: { suggestions: [] },
    });

    const { suggestActivities } = await import("@/lib/ai");
    await suggestActivities({ stopName: "Tokyo" });

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    );
  });

  it("forwards a zodOutputFormat schema in output_config", async () => {
    setEnv("sk-test-key");
    mockParse.mockResolvedValueOnce({
      parsed_output: { suggestions: [] },
    });

    const { suggestActivities } = await import("@/lib/ai");
    await suggestActivities({ stopName: "Paris" });

    const call = mockParse.mock.calls[0][0] as Record<string, unknown>;
    const outputConfig = call.output_config as { format: { _isAutoParseableFormat: boolean } };
    expect(outputConfig.format._isAutoParseableFormat).toBe(true);
  });

  it("returns error when parsed_output is null", async () => {
    setEnv("sk-test-key");
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    const { suggestActivities } = await import("@/lib/ai");
    const result = await suggestActivities({ stopName: "Berlin" });

    expect(result).toEqual({
      ok: false,
      reason: "error",
      message: "AI returned no output",
    });
  });

  it("returns error when SDK throws", async () => {
    setEnv("sk-test-key");
    mockParse.mockRejectedValueOnce(new Error("network failure"));

    const { suggestActivities } = await import("@/lib/ai");
    const result = await suggestActivities({ stopName: "Rome" });

    expect(result).toEqual({
      ok: false,
      reason: "error",
      message: "network failure",
    });
  });

  it("includes existingTitles avoidance in prompt", async () => {
    setEnv("sk-test-key");
    mockParse.mockResolvedValueOnce({
      parsed_output: { suggestions: [] },
    });

    const { suggestActivities } = await import("@/lib/ai");
    await suggestActivities({
      stopName: "Paris",
      existingTitles: ["Louvre", "Eiffel Tower"],
    });

    const call = mockParse.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const prompt = call.messages[0].content;
    expect(prompt).toContain("Louvre");
    expect(prompt).toContain("Eiffel Tower");
  });
});

// ---------------------------------------------------------------------------
// draftPackingList
// ---------------------------------------------------------------------------

describe("draftPackingList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_MODEL;
  });

  it("returns disabled when ANTHROPIC_API_KEY is not set", async () => {
    setEnv(undefined);
    const { draftPackingList } = await import("@/lib/ai");
    const result = await draftPackingList({
      tripName: "Euro Trip",
      stops: [{ name: "Paris" }],
      startDate: "2025-06-01",
      endDate: "2025-06-14",
    });
    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("returns ok:true with mapped items on success", async () => {
    setEnv("sk-test-key");
    const mockOutput = { items: ["Passport", "Sunscreen", "Adaptor"] };
    mockParse.mockResolvedValueOnce({ parsed_output: mockOutput });

    const { draftPackingList } = await import("@/lib/ai");
    const result = await draftPackingList({
      tripName: "Euro Trip",
      stops: [{ name: "Paris", country: "France" }],
      startDate: "2025-06-01",
      endDate: "2025-06-14",
    });

    expect(result).toEqual({ ok: true, data: mockOutput });
  });

  it("returns error when parsed_output is null", async () => {
    setEnv("sk-test-key");
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    const { draftPackingList } = await import("@/lib/ai");
    const result = await draftPackingList({
      tripName: "Test",
      stops: [],
      startDate: "2025-01-01",
      endDate: "2025-01-07",
    });

    expect(result).toEqual({
      ok: false,
      reason: "error",
      message: "AI returned no output",
    });
  });

  it("returns error when SDK throws", async () => {
    setEnv("sk-test-key");
    mockParse.mockRejectedValueOnce(new Error("timeout"));

    const { draftPackingList } = await import("@/lib/ai");
    const result = await draftPackingList({
      tripName: "Test",
      stops: [],
      startDate: "2025-01-01",
      endDate: "2025-01-07",
    });

    expect(result).toEqual({ ok: false, reason: "error", message: "timeout" });
  });

  it("uses AI_MODEL override", async () => {
    setEnv("sk-test-key", "claude-haiku-4-5");
    mockParse.mockResolvedValueOnce({ parsed_output: { items: [] } });

    const { draftPackingList } = await import("@/lib/ai");
    await draftPackingList({
      tripName: "Test",
      stops: [],
      startDate: "2025-01-01",
      endDate: "2025-01-07",
    });

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" }),
    );
  });
});

// ---------------------------------------------------------------------------
// parseBookingConfirmation
// ---------------------------------------------------------------------------

describe("parseBookingConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_MODEL;
  });

  it("returns disabled when ANTHROPIC_API_KEY is not set", async () => {
    setEnv(undefined);
    const { parseBookingConfirmation } = await import("@/lib/ai");
    const result = await parseBookingConfirmation({ text: "Booking #12345" });
    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("returns ok:true with transport draft on success", async () => {
    setEnv("sk-test-key");
    const mockOutput = {
      kind: "transport" as const,
      transport: {
        mode: "FLIGHT",
        from: "London Heathrow",
        to: "Paris CDG",
        dep: "2025-06-01T10:00:00Z",
        arr: "2025-06-01T12:00:00Z",
        reference: "AB1234",
      },
    };
    mockParse.mockResolvedValueOnce({ parsed_output: mockOutput });

    const { parseBookingConfirmation } = await import("@/lib/ai");
    const result = await parseBookingConfirmation({
      text: "Your flight AB1234 departs LHR at 10:00...",
    });

    expect(result).toEqual({ ok: true, data: mockOutput });
  });

  it("returns ok:true with accommodation draft on success", async () => {
    setEnv("sk-test-key");
    const mockOutput = {
      kind: "accommodation" as const,
      accommodation: {
        name: "Hotel Paris",
        address: "1 Rue de Rivoli, Paris",
        checkIn: "2025-06-01",
        checkOut: "2025-06-07",
        confirmation: "HTL-9999",
      },
    };
    mockParse.mockResolvedValueOnce({ parsed_output: mockOutput });

    const { parseBookingConfirmation } = await import("@/lib/ai");
    const result = await parseBookingConfirmation({
      text: "Hotel booking confirmation HTL-9999...",
    });

    expect(result).toEqual({ ok: true, data: mockOutput });
  });

  it("returns error when parsed_output is null", async () => {
    setEnv("sk-test-key");
    mockParse.mockResolvedValueOnce({ parsed_output: null });

    const { parseBookingConfirmation } = await import("@/lib/ai");
    const result = await parseBookingConfirmation({ text: "garbled text" });

    expect(result).toEqual({
      ok: false,
      reason: "error",
      message: "AI returned no output",
    });
  });

  it("returns error when SDK throws", async () => {
    setEnv("sk-test-key");
    mockParse.mockRejectedValueOnce(new Error("rate limited"));

    const { parseBookingConfirmation } = await import("@/lib/ai");
    const result = await parseBookingConfirmation({ text: "..." });

    expect(result).toEqual({
      ok: false,
      reason: "error",
      message: "rate limited",
    });
  });
});
