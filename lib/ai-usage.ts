import "server-only";
import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { estimateCostMicroUsd, type AiTokenUsage } from "@/lib/ai-pricing";

/**
 * AiUsage.outcome (spec 2026-10-14 "Spend"). `error`: the API call was made
 * (and billed), then the import failed on our side before Proposals were
 * built (BI-13).
 */
type AiUsageOutcome = "ok" | "not_booking" | "unreadable" | "api_error" | "rate_limited" | "error";

export interface AiUsageRecord {
  tripId: string;
  userId: string;
  model: string;
  usage: AiTokenUsage;
  proposalCount: number;
  outcome: AiUsageOutcome;
  durationMs: number;
}

const ROUTE = "booking-import#usage";

/**
 * One AiUsage row. Never throws: losing a spend row must not fail the
 * import. Takes no document content, extracted values or filenames by
 * construction — only tokens, cost, outcome and timing.
 *
 * Errors handed to `reportError` are always fresh, fixed-message `Error`s,
 * never the original thrown value: a DB-layer error's message can carry
 * driver/connection detail that doesn't belong in the error sink (privacy
 * constraint, global-constraints.md).
 */
export async function recordAiUsage(record: AiUsageRecord): Promise<void> {
  try {
    const cost = estimateCostMicroUsd(record.model, record.usage);
    if (cost === null) {
      await reportError(new Error(`No AI price for model ${record.model}`), { route: ROUTE, source: "server", userId: record.userId });
    }
    await db.aiUsage.create({
      data: {
        tripId: record.tripId,
        userId: record.userId,
        model: record.model,
        inputTokens: record.usage.inputTokens,
        outputTokens: record.usage.outputTokens,
        cacheReadTokens: record.usage.cacheReadTokens,
        cacheWriteTokens: record.usage.cacheWriteTokens,
        estimatedCostMicroUsd: cost,
        proposalCount: record.proposalCount,
        outcome: record.outcome,
        durationMs: record.durationMs,
      },
    });
  } catch {
    // Never forward the caught error itself (e.g. a DB driver error) — a
    // fresh, fixed-message Error keeps the sink free of whatever detail the
    // original carried.
    await reportError(new Error("AI usage row not written"), { route: ROUTE, source: "server", userId: record.userId });
  }
}
