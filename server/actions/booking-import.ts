"use server";

import { aiModel, isAiConfigured } from "@/lib/ai";
import { NO_TOKENS } from "@/lib/ai-pricing";
import { recordAiUsage } from "@/lib/ai-usage";
import { buildProposals } from "@/lib/booking-import/build";
import { confirmProposalFor } from "@/lib/booking-import/confirm";
import { extractBooking } from "@/lib/booking-import/extract";
import { prepareBookingInput } from "@/lib/booking-import/input";
import { MAX_IMPORTS_PER_HOUR } from "@/lib/booking-import/limits";
import { loadImportContext } from "@/lib/booking-import/load-context";
import { BOOKING_IMPORT_MESSAGES as M } from "@/lib/booking-import/messages";
import type { BookingImportResult, ConfirmProposalResult, ConfirmRequest } from "@/lib/booking-import/types";
import { reportError } from "@/lib/error-sink";
import { requireTripAccess } from "@/lib/guards";
import { createRateLimiter } from "@/lib/rate-limit";

const ROUTE = "booking-import";

// Per process, like /api/mcp's: a best-effort brake on spend, not a global
// quota (follow-up BI-02).
const importLimiter = createRateLimiter({ limit: MAX_IMPORTS_PER_HOUR, windowMs: 60 * 60 * 1000 });

/**
 * Booking import (spec 2026-10-14): read one booking and return its Proposals
 * for the plan being viewed. Writes nothing to the Trip; logs one AiUsage row
 * for every call that reached (or was refused before) the API.
 */
export async function importBooking(formData: FormData): Promise<BookingImportResult> {
  const tripId = formData.get("tripId");
  if (typeof tripId !== "string" || !tripId) return { ok: false, reason: "error", message: M.generic };
  const { user } = await requireTripAccess(tripId);
  if (!isAiConfigured()) return { ok: false, reason: "disabled", message: M.disabled };

  const forkIdRaw = formData.get("forkId");
  const forkId = typeof forkIdRaw === "string" && forkIdRaw ? forkIdRaw : null;
  const file = formData.get("file");
  const text = formData.get("text");

  const prepared = await prepareBookingInput({ file: file instanceof File ? file : null, text: typeof text === "string" ? text : null });
  if (!prepared.ok) return { ok: false, reason: prepared.reason, message: prepared.message };

  const base = { tripId, userId: user.id };
  if (!importLimiter.allow(user.id)) {
    const minutes = Math.max(1, Math.ceil(importLimiter.retryAfterMs(user.id) / 60_000));
    await recordAiUsage({ ...base, model: aiModel(), usage: NO_TOKENS, proposalCount: 0, outcome: "rate_limited", durationMs: 0 });
    return { ok: false, reason: "rate_limited", message: M.rateLimited(minutes), retryInMinutes: minutes };
  }

  const started = Date.now();
  const outcome = await extractBooking(prepared.parts);
  const durationMs = Date.now() - started;
  const spent = { ...base, model: outcome.model, usage: outcome.usage, durationMs };

  if (outcome.kind === "busy") {
    await recordAiUsage({ ...spent, proposalCount: 0, outcome: "api_error" });
    return { ok: false, reason: "busy", message: M.busy };
  }
  if (outcome.kind === "api_error") {
    await recordAiUsage({ ...spent, proposalCount: 0, outcome: "api_error" });
    await reportError(new Error(`Booking import: Anthropic API error ${outcome.status ?? "unknown"}`), { route: ROUTE, source: "server", userId: user.id });
    return { ok: false, reason: "error", message: M.generic };
  }
  if (outcome.kind === "unreadable") {
    await recordAiUsage({ ...spent, proposalCount: 0, outcome: "unreadable" });
    await reportError(outcome.report, { route: ROUTE, source: "server", userId: user.id });
    return { ok: false, reason: "unreadable", message: M.unreadable };
  }
  if (!outcome.extraction.isBooking) {
    await recordAiUsage({ ...spent, proposalCount: 0, outcome: "not_booking" });
    return { ok: false, reason: "not_booking", message: M.notBooking(outcome.extraction.notBookingReason) };
  }

  const { match, context } = await loadImportContext(tripId, forkId, user.id);
  const { proposals, dropped } = buildProposals(outcome.extraction, match);
  await recordAiUsage({ ...spent, proposalCount: proposals.length, outcome: "ok" });
  if (proposals.length === 0) return { ok: false, reason: "nothing_usable", message: M.nothingUsable };
  return { ok: true, proposals, partial: dropped > 0, context };
}

/**
 * Confirm one Proposal into the plan being viewed (spec 2026-10-14
 * "Confirm"). Any Traveller on the Trip; never over MCP.
 */
export async function confirmProposal(tripId: string, request: ConfirmRequest, forkId?: string | null): Promise<ConfirmProposalResult> {
  const { user } = await requireTripAccess(tripId);
  return confirmProposalFor(tripId, user.id, request, forkId ?? null);
}
