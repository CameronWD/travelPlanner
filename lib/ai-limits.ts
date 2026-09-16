/**
 * Hard limits on AI inputs.
 *
 * Deliberately dependency-free so both server actions and client components
 * can import it — `lib/ai.ts` pulls in zod and (lazily) the Anthropic SDK,
 * which must never reach the browser bundle.
 */

/**
 * Longest pasted booking-confirmation text we will send to the model.
 *
 * A generous confirmation email is a few thousand characters; 20k leaves
 * plenty of headroom while bounding the cost of a single call. Without a cap
 * the 12 MB server-action body limit (next.config.ts) is the only ceiling,
 * which at the model's context window is dollars-per-click of input tokens.
 */
export const MAX_BOOKING_TEXT_CHARS = 20_000;
