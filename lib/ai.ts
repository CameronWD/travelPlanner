/**
 * AI assistant seam — all Claude/Anthropic calls live here.
 *
 * The module is env-gated:
 *   - When ANTHROPIC_API_KEY is absent every function returns { ok:false, reason:"disabled" }
 *     and the SDK is never imported.
 *   - When the key is present the SDK is lazy-imported inside each function so
 *     this module is safe to import unconditionally (no build-time SDK dependency
 *     when the package is absent / the key is not configured).
 */

import { z } from "zod";
import { CATEGORY_VALUES } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getModel(): string {
  return process.env.AI_MODEL ?? "claude-opus-4-8";
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
async function getClient() {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  return new Anthropic();
}

async function getZodOutputFormat() {
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
    const client = await getClient();
    const zodOutputFormat = await getZodOutputFormat();

    const location = input.country
      ? `${input.stopName}, ${input.country}`
      : input.stopName;

    const avoidClause =
      input.existingTitles && input.existingTitles.length > 0
        ? `\nAvoid suggesting: ${input.existingTitles.join(", ")}.`
        : "";

    const response = await client.messages.parse({
      model: getModel(),
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Suggest approximately 6 things to do, see, or eat in ${location} for a traveller.${avoidClause}
For each suggestion provide a short title, a category (one of: SIGHTSEEING, FOOD, ACTIVITY, NIGHTLIFE, SHOPPING, OTHER), and a concise one-sentence note.
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
    const client = await getClient();
    const zodOutputFormat = await getZodOutputFormat();

    const stopsList = input.stops
      .map((s) => (s.country ? `${s.name}, ${s.country}` : s.name))
      .join("; ");

    const datesLine =
      input.startDate && input.endDate
        ? `Dates: ${input.startDate} to ${input.endDate}.`
        : `Dates: not set yet.`;

    const response = await client.messages.parse({
      model: getModel(),
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

// ---------------------------------------------------------------------------
// parseBookingConfirmation
// ---------------------------------------------------------------------------

const ParseBookingOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("transport"),
    transport: z.object({
      mode: z.string(),
      from: z.string(),
      to: z.string(),
      dep: z.string(),
      arr: z.string(),
      reference: z.string(),
    }),
  }),
  z.object({
    kind: z.literal("accommodation"),
    accommodation: z.object({
      name: z.string(),
      address: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      confirmation: z.string(),
    }),
  }),
  z.object({
    kind: z.literal("unknown"),
  }),
]);

export type ParseBookingOutput = z.infer<typeof ParseBookingOutputSchema>;

export async function parseBookingConfirmation(input: {
  text: string;
}): Promise<AiResult<ParseBookingOutput>> {
  if (!isAiConfigured()) {
    return { ok: false, reason: "disabled" };
  }

  try {
    const client = await getClient();
    const zodOutputFormat = await getZodOutputFormat();

    const response = await client.messages.parse({
      model: getModel(),
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Parse the following booking confirmation text and extract the key details.
If it is a transport booking (flight, train, bus, ferry, etc.) extract: mode, from location, to location, departure datetime, arrival datetime, and reference/booking code.
If it is an accommodation booking (hotel, hostel, Airbnb, etc.) extract: property name, address, check-in date, check-out date, and confirmation number.
If you cannot determine the kind, output kind:"unknown".
Dates and times should be in ISO 8601 format where possible. Only output via the schema.

Confirmation text:
${input.text}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(ParseBookingOutputSchema),
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
