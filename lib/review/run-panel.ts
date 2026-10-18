import type { ReviewPermission } from "@/lib/enum-values";

/**
 * What the Reviews tab offers the viewer (spec 2026-10-17 R12; plan
 * decisions 2 and 6). Pure and client-safe: the loader decides the state,
 * and the client panel formats the cap's day in the device's own zone.
 *
 * `nextReviewLabel` is re-exported from lib/review-permission.ts (P.4)
 * rather than redefined here: P already built and tested it ("Next Review
 * available today at 15:40" / "tomorrow" / "Thursday" / "next Sunday"), so
 * a second implementation under the same name — with different wording for
 * the same-day case ("later today" vs "today at HH:MM") — would just be a
 * second, disagreeing source of truth for the same button text.
 */
export { nextReviewLabel } from "@/lib/review-permission";

export type RunPanelState =
  | { kind: "hidden" }
  | { kind: "not-configured" }
  | { kind: "busy" }
  | { kind: "capped"; nextAvailableAt: string }
  | { kind: "ready" };

export function runPanelState(input: {
  permission: ReviewPermission;
  aiConfigured: boolean;
  running: boolean;
  allowance: { canRun: boolean; nextAvailableAt: Date | null };
}): RunPanelState {
  // Off: no option anywhere (R12). Reading stays open; that is the page's job.
  if (input.permission === "OFF") return { kind: "hidden" };
  if (!input.aiConfigured) return { kind: "not-configured" };
  if (input.running) return { kind: "busy" };
  if (!input.allowance.canRun) {
    return input.allowance.nextAvailableAt
      ? { kind: "capped", nextAvailableAt: input.allowance.nextAvailableAt.toISOString() }
      : { kind: "hidden" };
  }
  return { kind: "ready" };
}
