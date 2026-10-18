/**
 * Anthropic list prices (USD per million tokens) for the models TEEPEE may run,
 * keyed by model id. Used only to estimate spend on AiUsage rows
 * (lib/ai-usage.ts). A model missing here still works: its rows carry no cost
 * and an ErrorReport says the price is missing.
 */

export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Server-side web searches (a Review's, spec 2026-10-17 R11): billed per search on top of tokens. */
  webSearchRequests?: number;
}

export const NO_TOKENS: AiTokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** USD per million tokens. */
interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number; // 5-minute cache write
  cacheRead: number;
}

interface PriceEntry {
  base: ModelPrice;
  /** A second tier for every token once the prompt (input + cache read + cache write) is above `promptTokens`. */
  above?: { promptTokens: number; price: ModelPrice };
}

const AI_PRICES: Readonly<Record<string, PriceEntry>> = {
  "claude-haiku-5-5": {
    base: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
    above: { promptTokens: 100_000, price: { input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 } },
  },
  "claude-sonnet-5-5": { base: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 } },
  "claude-opus-5-5": { base: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 } },
  // The Review models (spec 2026-10-17 R11; shared/models.md, shared/prompt-caching.md: cache read 0.1×, 5-minute write 1.25×).
  "claude-sonnet-5": { base: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 } },
  "claude-opus-5": { base: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 } },
};

/** Anthropic's web search list price: US$10 per 1,000 searches, i.e. 10,000 µ$ each. */
const WEB_SEARCH_MICRO_USD = 10_000;

function promptTokens(u: AiTokenUsage): number {
  return u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

/**
 * Estimated cost in millionths of a US dollar (an Int, like every money column
 * here), or null when the model has no price. tokens × ($ per MTok) is already
 * in micro-dollars; web searches add 10,000 µ$ each.
 */
export function estimateCostMicroUsd(model: string, usage: AiTokenUsage): number | null {
  const entry = AI_PRICES[model];
  if (!entry) return null;
  const price = entry.above && promptTokens(usage) > entry.above.promptTokens ? entry.above.price : entry.base;
  const tokens = Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.cacheReadTokens * price.cacheRead,
  );
  return tokens + (usage.webSearchRequests ?? 0) * WEB_SEARCH_MICRO_USD;
}
