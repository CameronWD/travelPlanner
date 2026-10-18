import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const { createMock, reportErrorMock } = vi.hoisted(() => ({ createMock: vi.fn(), reportErrorMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { aiUsage: { create: createMock } } }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

import { recordAiUsage, type AiUsageRecord } from "./ai-usage";

const RECORD: AiUsageRecord = {
  tripId: "trip-1",
  userId: "user-1",
  model: "claude-haiku-5-5",
  usage: { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  proposalCount: 3,
  outcome: "ok",
  durationMs: 4_200,
};

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue({ id: "u1" });
});

describe("recordAiUsage", () => {
  it("writes one row with tokens, estimated cost and outcome, and nothing else", async () => {
    await recordAiUsage(RECORD);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        tripId: "trip-1",
        userId: "user-1",
        model: "claude-haiku-5-5",
        inputTokens: 10_000,
        outputTokens: 1_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCostMicroUsd: 1_500,
        proposalCount: 3,
        outcome: "ok",
        durationMs: 4_200,
      },
      select: { id: true },
    });
    await expect(recordAiUsage(RECORD)).resolves.toBe("u1");
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("an unknown model still writes the row, with no cost, and reports the missing price", async () => {
    await recordAiUsage({ ...RECORD, model: "claude-mystery-9" });
    expect(createMock).toHaveBeenCalledWith({ data: expect.objectContaining({ model: "claude-mystery-9", estimatedCostMicroUsd: null }), select: { id: true } });
    expect(reportErrorMock).toHaveBeenCalledWith(expect.objectContaining({ message: "No AI price for model claude-mystery-9" }), expect.objectContaining({ source: "server", userId: "user-1" }));
  });

  it("never throws when the write fails; it reports a fixed-message error, not the original", async () => {
    const dbError = new Error("db down");
    createMock.mockRejectedValueOnce(dbError);
    await expect(recordAiUsage(RECORD)).resolves.toBeNull();
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "AI usage row not written" }),
      expect.objectContaining({ source: "server", userId: "user-1" }),
    );
    const reportedError = reportErrorMock.mock.calls.at(-1)?.[0];
    expect(reportedError).not.toBe(dbError);
  });

  it("reports to the caller's route when one is given (a Review's spend)", async () => {
    createMock.mockRejectedValueOnce(new Error("db down"));
    await recordAiUsage({ ...RECORD, route: "review#usage", outcome: "timed_out" });
    expect(reportErrorMock).toHaveBeenCalledWith(expect.objectContaining({ message: "AI usage row not written" }), expect.objectContaining({ route: "review#usage" }));
  });

  it("prices a Review's web searches into the estimate without storing a count", async () => {
    await recordAiUsage({ ...RECORD, model: "claude-sonnet-5", usage: { inputTokens: 1_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearchRequests: 2 } });
    const data = createMock.mock.calls[0][0].data;
    expect(data.estimatedCostMicroUsd).toBe(22_000);
    expect(data).not.toHaveProperty("webSearchRequests");
  });
});
