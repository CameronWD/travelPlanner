import { describe, expect, it } from "vitest";
import { estimateCostMicroUsd, NO_TOKENS, type AiTokenUsage } from "./ai-pricing";

const usage = (u: Partial<AiTokenUsage>): AiTokenUsage => ({ ...NO_TOKENS, ...u });

describe("estimateCostMicroUsd", () => {
  it("prices Haiku 5.5 at the base tier up to 100K prompt tokens", () => {
    // 10,000 × $0.10 + 1,000 × $0.50 per MTok = $0.0015 = 1,500 µ$
    expect(estimateCostMicroUsd("claude-haiku-5-5", usage({ inputTokens: 10_000, outputTokens: 1_000 }))).toBe(1_500);
  });

  it("keeps the base tier at exactly 100K prompt tokens", () => {
    expect(estimateCostMicroUsd("claude-haiku-5-5", usage({ inputTokens: 100_000 }))).toBe(10_000);
  });

  it("switches every token to the long-context tier above 100K prompt tokens", () => {
    // 150,000 × 0.50 + 2,000 × 2.50 = 80,000 µ$
    expect(estimateCostMicroUsd("claude-haiku-5-5", usage({ inputTokens: 150_000, outputTokens: 2_000 }))).toBe(80_000);
  });

  it("counts cache reads and writes towards the prompt size and prices them", () => {
    // 60K input + 50K cache read = 110K prompt → long tier: 60,000×0.5 + 50,000×0.05 = 32,500
    expect(estimateCostMicroUsd("claude-haiku-5-5", usage({ inputTokens: 60_000, cacheReadTokens: 50_000 }))).toBe(32_500);
  });

  it("prices Sonnet 5.5 and Opus 5.5 flat, cache read at 5% and cache write at 1.25× input", () => {
    // 1,000×2 + 100×10 + 2,000×0.10 + 500×2.50 = 4,450
    expect(
      estimateCostMicroUsd("claude-sonnet-5-5", usage({ inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 2_000, cacheWriteTokens: 500 })),
    ).toBe(4_450);
    // 1,000×4 + 100×20 = 6,000
    expect(estimateCostMicroUsd("claude-opus-5-5", usage({ inputTokens: 1_000, outputTokens: 100 }))).toBe(6_000);
  });

  it("returns null for a model with no price", () => {
    expect(estimateCostMicroUsd("claude-mystery-9", usage({ inputTokens: 1 }))).toBeNull();
  });

  it("prices Sonnet 5 and Opus 5 (the Review models) flat, cache read at 10% and cache write at 1.25× input", () => {
    // 1,000×2 + 100×10 + 2,000×0.20 + 500×2.50 = 4,650
    expect(
      estimateCostMicroUsd("claude-sonnet-5", usage({ inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 2_000, cacheWriteTokens: 500 })),
    ).toBe(4_650);
    // 1,000×5 + 100×25 + 2,000×0.50 + 500×6.25 = 11,625
    expect(
      estimateCostMicroUsd("claude-opus-5", usage({ inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 2_000, cacheWriteTokens: 500 })),
    ).toBe(11_625);
  });

  it("adds US$10 per 1,000 web searches (10,000 µ$ each) on top of tokens", () => {
    // 1,000×2 + 3 × 10,000 = 32,000
    expect(estimateCostMicroUsd("claude-sonnet-5", usage({ inputTokens: 1_000, webSearchRequests: 3 }))).toBe(32_000);
    expect(estimateCostMicroUsd("claude-sonnet-5", usage({ inputTokens: 1_000 }))).toBe(2_000);
  });
});
