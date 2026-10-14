/**
 * scripts/booking-import-smoke.ts — read one real booking with the real API.
 *
 * This sandbox has no Anthropic key, so the live call is packaged for Cam:
 *
 *   ANTHROPIC_API_KEY=… [AI_MODEL=claude-haiku-5-5] \
 *     npx tsx --conditions=react-server scripts/booking-import-smoke.ts ~/Downloads/booking.pdf
 *
 * It runs the same input checks, request and matching the app does (against
 * an empty Trip: no Home base, no Stops), then prints a summary of the
 * Proposals and what the call cost. It never prints the document or its text,
 * and never touches a database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isAiConfigured } from "../lib/ai";
import { estimateCostMicroUsd } from "../lib/ai-pricing";
import { buildProposals } from "../lib/booking-import/build";
import { NO_EXISTING } from "../lib/booking-import/duplicates";
import { extractBooking } from "../lib/booking-import/extract";
import { prepareBookingInput } from "../lib/booking-import/input";

const TYPES: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".eml": "message/rfc822", ".txt": "text/plain" };

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) throw new Error("Usage: booking-import-smoke.ts <booking file>");
  if (!isAiConfigured()) throw new Error("Set ANTHROPIC_API_KEY first.");

  const ext = path.extname(target).toLowerCase();
  const bytes = readFileSync(target);
  const prepared =
    ext === ".txt"
      ? await prepareBookingInput({ file: null, text: bytes.toString("utf8") })
      : await prepareBookingInput({ file: new File([bytes], `booking${ext}`, { type: TYPES[ext] ?? "" }), text: null });
  if (!prepared.ok) {
    console.log(`Refused before the API call (${prepared.reason}): ${prepared.message}`);
    return;
  }

  const started = Date.now();
  const outcome = await extractBooking(prepared.parts);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const cost = estimateCostMicroUsd(outcome.model, outcome.usage);
  console.log(`Model ${outcome.model}, ${seconds}s, tokens in/out ${outcome.usage.inputTokens}/${outcome.usage.outputTokens}, cost ${cost === null ? "unknown (no price)" : `$${(cost / 1e6).toFixed(5)}`}`);
  if (outcome.kind !== "ok") {
    console.log(`Outcome: ${outcome.kind}${outcome.kind === "unreadable" ? ` (${outcome.report.message})` : ""}${outcome.kind === "api_error" ? ` (HTTP ${outcome.status})` : ""}`);
    return;
  }
  if (!outcome.extraction.isBooking) {
    console.log("Not a booking.");
    return;
  }

  const { proposals, dropped } = buildProposals(outcome.extraction, {
    home: { name: null, countryCode: null, timezone: null },
    stops: [],
    blockedStopIds: new Set(),
    existing: NO_EXISTING,
    today: new Date().toISOString().slice(0, 10),
  });
  console.log(`${proposals.length} Proposals${dropped ? `, ${dropped} dropped (partial)` : ""}:`);
  for (const p of proposals) {
    const i = p.input as unknown as Record<string, unknown>;
    const when = [i.arriveDate, i.depAt, i.checkIn, i.date].find(Boolean) ?? "no date";
    const flags = [p.missing.length ? `missing: ${p.missing.join(", ")}` : null, p.doubleCheck.length ? `${p.doubleCheck.length} double-check notes` : null, i.costMinor !== undefined ? "has a Cost" : null].filter(Boolean).join("; ");
    console.log(`  ${p.clientId} ${p.kind}${p.kind === "transport" ? ` ${i.mode}` : ""} · ${p.confidence} · ${String(when)}${flags ? ` · ${flags}` : ""}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
