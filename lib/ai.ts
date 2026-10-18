/**
 * AI assistant seam: the shared Anthropic client and model config, plus the
 * Wishlist and Checklist calls. The Booking import's call lives in
 * lib/booking-import/extract.ts.
 *
 * Two features live in this file: suggesting activities (suggestActivities)
 * and drafting a packing list (draftPackingList). The Booking import is a
 * separate seam in lib/booking-import/ (extractBooking) — it shares this
 * module's aiModel(), isAiConfigured(), anthropicClient() and
 * zodOutputFormatHelper(), but its own prompt and schema live there.
 *
 * The module is env-gated:
 *   - When ANTHROPIC_API_KEY is absent every function returns { ok:false, reason:"disabled" }
 *     and the SDK is never imported.
 *   - When the key is present the SDK is lazy-imported inside each function so
 *     this module is safe to import unconditionally (no build-time SDK dependency
 *     when the package is absent / the key is not configured).
 */

import "server-only";
import { z } from "zod";
import { CATEGORY_VALUES } from "@/lib/categories";
import type { ReviewKind } from "@/lib/review/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Default model for every AI call (spec 2026-10-14 Booking import). */
export const DEFAULT_AI_MODEL = "claude-haiku-5-5";

/**
 * The one place the model is chosen. Set AI_MODEL in Vercel to override it
 * (e.g. "claude-sonnet-5-5"); it takes effect on the next deploy. Every request
 * here is valid unchanged on Haiku 5.5, Sonnet 5.5 and Opus 5.5: effort only,
 * no sampling parameters, no explicit thinking. Prices: lib/ai-pricing.ts.
 */
export function aiModel(): string {
  return process.env.AI_MODEL || DEFAULT_AI_MODEL;
}

/** Spec 2026-10-17 R11: a Standard Review runs Claude Sonnet 5, a Deep Review Claude Opus 5. */
const DEFAULT_REVIEW_MODELS: Readonly<Record<ReviewKind, string>> = {
  STANDARD: "claude-sonnet-5",
  DEEP: "claude-opus-5",
};

/**
 * The model a Review of this kind runs on (R11: "models are settings").
 * REVIEW_MODEL_STANDARD and REVIEW_MODEL_DEEP override the defaults; an
 * empty value counts as unset, like AI_MODEL. Read once, when the Review
 * starts, and stored on its row, so a run and its AiUsage name the same model.
 * Independent of AI_MODEL, which stays the Booking import's choice.
 */
export function reviewModel(kind: ReviewKind): string {
  const override = kind === "DEEP" ? process.env.REVIEW_MODEL_DEEP : process.env.REVIEW_MODEL_STANDARD;
  return override || DEFAULT_REVIEW_MODELS[kind];
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "disabled" | "error"; message?: string };

// ---------------------------------------------------------------------------
// Shared SDK helper
// ---------------------------------------------------------------------------

/**
 * Lazy-imports the SDK and returns a configured client. Never called when
 * ANTHROPIC_API_KEY is absent.
 */
export async function anthropicClient() {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  return new Anthropic();
}

export async function zodOutputFormatHelper() {
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  return zodOutputFormat;
}

// ---------------------------------------------------------------------------
// suggestActivities
// ---------------------------------------------------------------------------

const SuggestActivitiesOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      category: z.enum(CATEGORY_VALUES),
      note: z.string(),
    }),
  ),
});

export type SuggestActivitiesOutput = z.infer<
  typeof SuggestActivitiesOutputSchema
>;

export async function suggestActivities(input: {
  stopName: string;
  country?: string;
  existingTitles?: string[];
}): Promise<AiResult<SuggestActivitiesOutput>> {
  if (!isAiConfigured()) {
    return { ok: false, reason: "disabled" };
  }

  try {
    const client = await anthropicClient();
    const zodOutputFormat = await zodOutputFormatHelper();

    const location = input.country
      ? `${input.stopName}, ${input.country}`
      : input.stopName;

    const avoidClause =
      input.existingTitles && input.existingTitles.length > 0
        ? `\nAvoid suggesting: ${input.existingTitles.join(", ")}.`
        : "";

    const response = await client.messages.parse({
      model: aiModel(),
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Suggest approximately 6 things to do, see, or eat in ${location} for a traveller.${avoidClause}
For each suggestion provide a short title, a category (one of: SIGHTSEEING, FOOD, ACTIVITY, NIGHTLIFE, SHOPPING, GETTING_AROUND, OTHER), and a concise one-sentence note.
Be specific and practical. Only output via the schema.`,
        },
      ],
      output_config: {
        format: zodOutputFormat(SuggestActivitiesOutputSchema),
      },
    });

    if (!response.parsed_output) {
      return { ok: false, reason: "error", message: "AI returned no output" };
    }

    return { ok: true, data: response.parsed_output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "error", message };
  }
}

// ---------------------------------------------------------------------------
// draftPackingList
// ---------------------------------------------------------------------------

const DraftPackingListOutputSchema = z.object({
  items: z.array(z.string()),
});

export type DraftPackingListOutput = z.infer<typeof DraftPackingListOutputSchema>;

export async function draftPackingList(input: {
  tripName: string;
  stops: { name: string; country?: string }[];
  startDate: string | null;
  endDate: string | null;
}): Promise<AiResult<DraftPackingListOutput>> {
  if (!isAiConfigured()) {
    return { ok: false, reason: "disabled" };
  }

  try {
    const client = await anthropicClient();
    const zodOutputFormat = await zodOutputFormatHelper();

    const stopsList = input.stops
      .map((s) => (s.country ? `${s.name}, ${s.country}` : s.name))
      .join("; ");

    const datesLine =
      input.startDate && input.endDate
        ? `Dates: ${input.startDate} to ${input.endDate}.`
        : `Dates: not set yet.`;

    const response = await client.messages.parse({
      model: aiModel(),
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Draft a practical packing list for a trip named "${input.tripName}".
${datesLine}
Stops: ${stopsList || "unspecified"}.
List each item as a short phrase (e.g. "Sunscreen SPF 50"). Include essentials, clothing, electronics, and anything specific to the destinations and season. Be concise and skip redundant items. Only output via the schema.`,
        },
      ],
      output_config: {
        format: zodOutputFormat(DraftPackingListOutputSchema),
      },
    });

    if (!response.parsed_output) {
      return { ok: false, reason: "error", message: "AI returned no output" };
    }

    return { ok: true, data: response.parsed_output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "error", message };
  }
}
