import "server-only";
import type { Message, MessageParam, Tool, ToolUnion, Usage } from "@anthropic-ai/sdk/resources/messages";
import { anthropicClient, zodOutputFormatHelper } from "@/lib/ai";
import { NO_TOKENS, type AiTokenUsage } from "@/lib/ai-pricing";
import type { ReviewInput } from "./input-shape";
import { parseReviewOutput, reviewOutputSchema, type ReviewOutput } from "./model-output";
import { REVIEW_SYSTEM_PROMPT, SUBMIT_NUDGE, SUBMIT_REVIEW_TOOL, buildReviewUserMessage } from "./prompt";
import type { ReviewKind } from "./types";

/**
 * A Review's one Claude conversation (spec 2026-10-17 R11). Callers check
 * isAiConfigured() first. Never throws, and never logs or returns the plan
 * or the reply: reports are fresh Errors with fixed messages (as
 * lib/booking-import/extract.ts).
 *
 * Structured output is a strict client tool, submit_review, not
 * output_config.format: JSON outputs are documented as incompatible with
 * citations, which web search results carry, and the SDK's parse helper
 * parses every text block, including the narration before a search
 * (claude-api shared/tool-use-concepts.md, Structured Outputs; Tool Choice:
 * tool_choice auto plus `strict: true` keeps the schema guarantee). The
 * tool input is then validated with zod, Finding by Finding
 * (parseReviewOutput), like extract.ts validates its parsed_output. Should
 * the API refuse `strict` beside search citations (a 400 naming either), the
 * request is re-sent once without it (STRICT_REFUSAL); the zod check is the
 * same either way.
 */

/** Inside /api/mcp's and the Reviews page's maxDuration (300 s), with room to record the outcome. */
export const REVIEW_RUN_BUDGET_MS = 270_000;
/** R11: "≤ ~15 searches" per request. */
export const REVIEW_MAX_SEARCHES = 15;
/** pause_turn resumes (tool-use-concepts.md: cap continuations). */
export const REVIEW_MAX_CONTINUATIONS = 3;

const MAX_TOKENS: Record<ReviewKind, number> = { STANDARD: 32_000, DEEP: 64_000 };
const EFFORT: Record<ReviewKind, "medium" | "high"> = { STANDARD: "medium", DEEP: "high" };

export type ReviewCallOutcome = (
  | { kind: "ok"; usage: AiTokenUsage; output: ReviewOutput }
  | { kind: "unreadable"; usage: AiTokenUsage; report: Error }
  | { kind: "busy"; usage: AiTokenUsage }
  /**
   * apiMessage: the API's own error message (a request-shape complaint such
   * as an unsupported parameter, never plan text), for
   * scripts/review-smoke.ts to print. The job neither logs nor stores it.
   */
  | { kind: "api_error"; usage: AiTokenUsage; status: number | null; apiMessage: string | null }
  | { kind: "timeout"; usage: AiTokenUsage }
) & {
  /**
   * Present when the API refused the strict submit_review tool alongside
   * web search citations (a 400 naming citations or strict mode) and the
   * request was re-sent once without `strict` (STRICT_REFUSAL). The reply is
   * still checked by parseReviewOutput. scripts/review-smoke.ts prints it.
   */
  strictDropped?: true;
};

export interface ReviewCallRequest {
  kind: ReviewKind;
  /** The model stored on the Review row (lib/ai.ts reviewModel). */
  model: string;
  input: ReviewInput;
  /** Epoch ms: no request starts after it, and the one in flight is aborted at it. */
  deadline: number;
}

function addUsage(total: AiTokenUsage, u: Usage | null | undefined): AiTokenUsage {
  return {
    inputTokens: total.inputTokens + (u?.input_tokens ?? 0),
    outputTokens: total.outputTokens + (u?.output_tokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (u?.cache_read_input_tokens ?? 0),
    cacheWriteTokens: total.cacheWriteTokens + (u?.cache_creation_input_tokens ?? 0),
    webSearchRequests: (total.webSearchRequests ?? 0) + (u?.server_tool_use?.web_search_requests ?? 0),
  };
}

async function submitTool(): Promise<Tool> {
  const zodOutputFormat = await zodOutputFormatHelper();
  return {
    name: SUBMIT_REVIEW_TOOL,
    description:
      "Submit the finished Review: every Finding and a one-line summary. Call it exactly once, at the end, after any web searches. Call it with an empty findings list when there is nothing to report.",
    strict: true,
    // The same transform the booking import's output format uses: every object closed, unsupported constraints moved out.
    input_schema: zodOutputFormat(reviewOutputSchema).schema as Tool.InputSchema,
  };
}

/**
 * A 400 saying the strict tool can't be used here, with web search's
 * citations (the pairing docs/DEPLOY.md's smoke gate checks): re-sent once
 * without `strict`, rather than every Review failing after the refusal.
 */
const STRICT_REFUSAL = /citation|strict/i;

/** The same tool, with no `strict` key (STRICT_REFUSAL's one retry). */
function withoutStrict(tool: Tool): Tool {
  const rest = { ...tool };
  delete rest.strict;
  return rest;
}

/** The `error.message` of an Anthropic error body ({ type: "error", error: { type, message } }), capped. */
function apiErrorMessage(err: { error?: unknown }): string | null {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  return typeof message === "string" ? message.slice(0, 500) : null;
}

export async function callReviewModel(req: ReviewCallRequest): Promise<ReviewCallOutcome> {
  let setup;
  try {
    setup = await Promise.all([anthropicClient(), import("@anthropic-ai/sdk"), submitTool()]);
  } catch (err) {
    // E.g. no API key (callers check isAiConfigured() first); never forward the message.
    const name = err instanceof Error ? err.name : "unknown";
    return { kind: "unreadable", usage: NO_TOKENS, report: new Error(`Review: the client could not start (${name})`) };
  }
  const [client, sdk, tool] = setup;
  const webSearch: ToolUnion = { type: "web_search_20260209", name: "web_search", max_uses: REVIEW_MAX_SEARCHES };
  let tools: ToolUnion[] = [webSearch, tool];
  const messages: MessageParam[] = [{ role: "user", content: buildReviewUserMessage(req.input) }];
  let usage: AiTokenUsage = NO_TOKENS;
  let continuations = 0;
  let nudged = false;
  let strictDropped = false;
  const done = (outcome: ReviewCallOutcome): ReviewCallOutcome => (strictDropped ? { ...outcome, strictDropped: true } : outcome);

  for (;;) {
    const remaining = req.deadline - Date.now();
    if (remaining <= 0) return done({ kind: "timeout", usage });

    let stream: ReturnType<typeof client.messages.stream> | undefined;
    let message: Message;
    try {
      stream = client.messages.stream(
        {
          model: req.model,
          max_tokens: MAX_TOKENS[req.kind],
          system: REVIEW_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
          tools,
          messages: [...messages],
          output_config: { effort: EFFORT[req.kind] },
          ...(req.kind === "DEEP" ? { thinking: { type: "adaptive" as const } } : {}),
        },
        { signal: AbortSignal.timeout(remaining) },
      );
      message = await stream.finalMessage();
    } catch (err) {
      // An aborted or broken turn was still billed for what it streamed: the
      // stream's snapshot (MessageStream.currentMessage, SDK 0.105) holds the
      // usage message_start and the last message_delta reported, web
      // searches (usage.server_tool_use) included.
      const streamed = stream?.currentMessage?.usage;
      if (streamed) usage = addUsage(usage, streamed);
      if (err instanceof sdk.APIUserAbortError) return done({ kind: "timeout", usage });
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) return done({ kind: "timeout", usage });
      if (err instanceof sdk.APIConnectionError) return done({ kind: "busy", usage });
      if (err instanceof sdk.APIError) {
        const status = typeof err.status === "number" ? err.status : null;
        if (status === 429 || (status !== null && status >= 500)) return done({ kind: "busy", usage });
        const apiMessage = apiErrorMessage(err);
        if (status === 400 && !strictDropped && STRICT_REFUSAL.test(apiMessage ?? err.message)) {
          strictDropped = true;
          tools = [webSearch, withoutStrict(tool)];
          continue;
        }
        return done({ kind: "api_error", usage, status, apiMessage });
      }
      const name = err instanceof Error ? err.name : "unknown";
      return done({ kind: "unreadable", usage, report: new Error(`Review: the reply could not be read (${name})`) });
    }

    usage = addUsage(usage, message.usage);
    // A refusal or a cut-off can truncate a tool call mid-input: never trust that turn.
    if (message.stop_reason === "max_tokens" || message.stop_reason === "refusal") {
      return done({ kind: "unreadable", usage, report: new Error(`Review: stop_reason ${message.stop_reason}`) });
    }

    const submitted = message.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_REVIEW_TOOL);
    if (submitted?.type === "tool_use") {
      // Finding by Finding: a bad one is dropped, a malformed fix becomes null (notes decision 8).
      const output = parseReviewOutput(submitted.input);
      if (!output) return done({ kind: "unreadable", usage, report: new Error("Review: the reply failed validation") });
      return done({ kind: "ok", usage, output });
    }

    // The server-side search loop paused: re-send its turn as it stands, and the server resumes.
    if (message.stop_reason === "pause_turn" && continuations < REVIEW_MAX_CONTINUATIONS) {
      continuations += 1;
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    // tool_choice stays auto (forced use and thinking don't mix): ask once.
    if (message.stop_reason === "end_turn" && !nudged) {
      nudged = true;
      messages.push({ role: "assistant", content: message.content }, { role: "user", content: SUBMIT_NUDGE });
      continue;
    }
    return done({ kind: "unreadable", usage, report: new Error(`Review: no result (stop_reason ${message.stop_reason})`) });
  }
}
