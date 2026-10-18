/**
 * scripts/review-smoke.ts: one real Review call with the real API.
 *
 * This sandbox has no Anthropic key, so the live call is packaged for Cam:
 *
 *   ANTHROPIC_API_KEY=… npx tsx --conditions=react-server scripts/review-smoke.ts [standard|deep] [plan.json]
 *
 * With no plan file it reviews the built-in sample
 * (test/fixtures/review/sample-plan.ts): four nights in Kyoto with a museum
 * on a Monday, Culture Day, a note still waiting on a reply, a train still
 * To book and a Surprise. A plan file is a get_trip_plan result saved from
 * a Claude connection, reviewed as given and with no current Flags.
 * REVIEW_MODEL_STANDARD / REVIEW_MODEL_DEEP choose the model, as in the app.
 *
 * It sends exactly what the app sends (the same input shaping, prompt,
 * tools and checks), then prints the model, time, tokens, searches, cost,
 * outcome and each Finding as the app would store it. It says which request
 * path ran: strict submit_review, or the fallback without strict after a 400
 * about citations (lib/review/call.ts STRICT_REFUSAL). On an API error it
 * prints the API's own message (docs/DEPLOY.md "Enabling Reviews"). It never touches a database and writes
 * nothing. Exits 1 unless the outcome is ok, so a failed run can't be
 * mistaken for a pass.
 */
import { readFileSync } from "node:fs";
import { isAiConfigured, reviewModel } from "../lib/ai";
import { estimateCostMicroUsd } from "../lib/ai-pricing";
import type { McpTripPlan } from "../lib/mcp/reads/trip-plan";
import { callReviewModel, REVIEW_RUN_BUDGET_MS } from "../lib/review/call";
import { reviewInputFromPlan } from "../lib/review/input-shape";
import { reviewSummary, toFindingDrafts } from "../lib/review/model-output";
import { todayISOInZone } from "../lib/tz";
import { SAMPLE_PLAN, SAMPLE_TODAY } from "../test/fixtures/review/sample-plan";

async function main(): Promise<void> {
  const [depth = "standard", planPath] = process.argv.slice(2);
  if (depth !== "standard" && depth !== "deep") throw new Error("Usage: review-smoke.ts [standard|deep] [plan.json]");
  if (!isAiConfigured()) throw new Error("Set ANTHROPIC_API_KEY first.");

  const kind = depth === "deep" ? "DEEP" : "STANDARD";
  const plan = planPath ? (JSON.parse(readFileSync(planPath, "utf8")) as McpTripPlan) : SAMPLE_PLAN;
  const today = planPath ? todayISOInZone(plan.trip.homeTimezone ?? "UTC") : SAMPLE_TODAY;
  const input = reviewInputFromPlan(plan, [], today);
  const model = reviewModel(kind);

  const started = Date.now();
  const outcome = await callReviewModel({ kind, model, input, deadline: started + REVIEW_RUN_BUDGET_MS });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const u = outcome.usage;
  const cost = estimateCostMicroUsd(model, u);
  console.log(
    `Model ${model} (${kind}), ${seconds}s, tokens in/out ${u.inputTokens}/${u.outputTokens}, cache read/write ${u.cacheReadTokens}/${u.cacheWriteTokens}, ` +
      `searches ${u.webSearchRequests ?? 0}, cost ${cost === null ? "unknown (no price)" : `$${(cost / 1e6).toFixed(4)}`}`,
  );
  console.log(
    outcome.strictDropped
      ? "Request path: FALLBACK. The API refused strict submit_review beside web search citations (HTTP 400), so it was re-sent once without strict."
      : "Request path: strict submit_review, as sent first.",
  );
  if (outcome.kind !== "ok") {
    const why =
      outcome.kind === "unreadable"
        ? ` (${outcome.report.message})`
        : outcome.kind === "api_error"
          ? ` (HTTP ${outcome.status ?? "unknown"}${outcome.apiMessage ? `: ${outcome.apiMessage}` : ""})`
          : "";
    console.log(`Outcome: ${outcome.kind}${why}`);
    console.log("FAIL: not a pass. See docs/DEPLOY.md, Enabling Reviews.");
    process.exitCode = 1;
    return;
  }

  const drafts = toFindingDrafts(outcome.output, input.targets);
  console.log(`Summary: ${reviewSummary(outcome.output, drafts.length)}`);
  console.log(`${drafts.length} Findings kept of ${outcome.output.findings.length} returned:`);
  for (const d of drafts) {
    const target = `${d.targetType}${d.targetId ? ` ${d.targetId}` : ""}${d.date ? ` ${d.date}` : ""}`;
    const extras = [d.source ? `source ${d.source}` : null, d.suggestedFix ? `fix ${d.suggestedFix.kind}` : null].filter(Boolean).join("; ");
    console.log(`  ${d.severity} · ${d.category} · ${target} · ${d.title}${extras ? ` · ${extras}` : ""}`);
  }
  console.log(`PASS: ${kind} finished in ${seconds}s (the job stops itself at ${REVIEW_RUN_BUDGET_MS / 1000}s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
