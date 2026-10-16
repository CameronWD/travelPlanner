/**
 * Recognises Next's own control-flow throws — notFound()/forbidden()/
 * unauthorized() (digest `NEXT_HTTP_ERROR_FALLBACK;...`) and redirect()/
 * permanentRedirect() (digest `NEXT_REDIRECT;...`) — so a catch{} that must
 * swallow application errors can still tell them apart from Next's own
 * navigation signals without rethrowing.
 *
 * Next 16 exports `unstable_rethrow` from `next/navigation` for the inverse
 * case (propagate the framework's throw, handle everything else yourself),
 * but it rethrows rather than returning a boolean, and the callers here
 * (recordActivity's best-effort catch, lib/mcp/run-tool.ts's error mapping)
 * need to keep swallowing in both branches — just deciding whether to also
 * report. `isNotFoundError`/`isRedirectError`/`isHTTPAccessFallbackError`
 * exist inside next/dist/client/components but are not re-exported from the
 * public `next/navigation` entry point in this version, so this checks the
 * `digest` prefix directly — the same check lib/mcp/run-tool.ts already used
 * before this helper existed.
 */
export function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown })?.digest;
  if (typeof digest !== "string") return false;
  return digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;") || digest.startsWith("NEXT_REDIRECT");
}
