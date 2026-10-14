import "server-only";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { aiModel, anthropicClient, zodOutputFormatHelper } from "@/lib/ai";
import { NO_TOKENS, type AiTokenUsage } from "@/lib/ai-pricing";
import { BookingExtractionSchema, type BookingExtraction } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_INSTRUCTION } from "./prompt";
import type { BookingPart } from "./types";

/**
 * Booking import: one Claude call that reads a booking and reports it
 * (spec 2026-10-14). Callers check isAiConfigured() first. Never logs or
 * returns document content: reports are fresh Errors with fixed messages.
 */

export const EXTRACTION_MAX_TOKENS = 8192;

export type ExtractOutcome =
  | { kind: "ok"; model: string; usage: AiTokenUsage; extraction: BookingExtraction }
  | { kind: "unreadable"; model: string; usage: AiTokenUsage; report: Error }
  | { kind: "busy"; model: string; usage: AiTokenUsage }
  | { kind: "api_error"; model: string; usage: AiTokenUsage; status: number | null };

/** Files first (PDFs as document blocks, images as image blocks), then any text, then the instruction. */
export function buildContent(parts: readonly BookingPart[]): ContentBlockParam[] {
  const files: ContentBlockParam[] = [];
  const texts: ContentBlockParam[] = [];
  for (const part of parts) {
    if (part.type === "pdf") {
      files.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: part.base64 } });
    } else if (part.type === "image") {
      files.push({ type: "image", source: { type: "base64", media_type: part.mediaType, data: part.base64 } });
    } else {
      texts.push({ type: "text", text: `<booking_text>\n${part.text}\n</booking_text>` });
    }
  }
  return [...files, ...texts, { type: "text", text: EXTRACTION_USER_INSTRUCTION }];
}

interface RawUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function tokenUsage(u: RawUsage | null | undefined): AiTokenUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  };
}

export async function extractBooking(parts: readonly BookingPart[]): Promise<ExtractOutcome> {
  const model = aiModel();
  const [client, zodOutputFormat, sdk] = await Promise.all([
    anthropicClient(),
    zodOutputFormatHelper(),
    import("@anthropic-ai/sdk"),
  ]);

  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: EXTRACTION_MAX_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildContent(parts) }],
      output_config: { effort: "low" as const, format: zodOutputFormat(BookingExtractionSchema) },
    });
  } catch (err) {
    if (err instanceof sdk.APIConnectionError) return { kind: "busy", model, usage: NO_TOKENS };
    if (err instanceof sdk.APIError) {
      const status = typeof err.status === "number" ? err.status : null;
      if (status === 429 || (status !== null && status >= 500)) return { kind: "busy", model, usage: NO_TOKENS };
      return { kind: "api_error", model, usage: NO_TOKENS, status };
    }
    // Never forward the thrown message: a failed parse can quote the document.
    const name = err instanceof Error ? err.name : "unknown";
    return { kind: "unreadable", model, usage: NO_TOKENS, report: new Error(`Booking import: the reply could not be read (${name})`) };
  }

  const usage = tokenUsage(response.usage);
  if (response.stop_reason === "max_tokens" || response.stop_reason === "refusal") {
    return { kind: "unreadable", model, usage, report: new Error(`Booking import: stop_reason ${response.stop_reason}`) };
  }
  const checked = BookingExtractionSchema.safeParse(response.parsed_output);
  if (!checked.success) {
    return { kind: "unreadable", model, usage, report: new Error("Booking import: the reply failed validation") };
  }
  return { kind: "ok", model, usage, extraction: checked.data };
}
