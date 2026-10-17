/**
 * One error contract for every MCP tool (spec 2026-10-09). Tools call the
 * existing server actions; this maps their results and Next's control-flow
 * throws into MCP tool results. notFound() covers both "missing" and "not
 * yours", so a tool never reveals whether a Trip exists. Writes go through
 * `runWrite`, which returns the row as it now stands (F6).
 */
import { ZodError } from "zod";
import { reportError } from "@/lib/error-sink";
import { isNextControlFlow } from "@/lib/next-control-flow";
import { getActingTraveller } from "./acting-traveller";

export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export type ToolResult = { content: ToolContent[]; isError?: boolean };
export const NOT_FOUND_TEXT = "Not found, or you don't have access to it.";

const text = (t: string, isError?: boolean): ToolResult =>
  isError ? { isError: true, content: [{ type: "text", text: t }] } : { content: [{ type: "text", text: t }] };

/** Flattens a field-error dict to one readable line. Shared by tools that need to report an action's failure themselves, beyond the generic text runTool builds. */
export function fieldErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .flatMap(([k, msgs]) => msgs.map((m) => (k === "_" ? m : `${k}: ${m}`)))
    .join("; ");
}

export async function runTool(name: string, fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const value = await fn();
    if (value && typeof value === "object" && "success" in value) {
      const v = value as { success: boolean; errors?: Record<string, string[]> };
      if (v.success === false) return text(`Couldn't do that: ${fieldErrors(v.errors ?? {})}`, true);
      const rest: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      delete rest.success;
      return text(JSON.stringify(rest, null, 2));
    }
    return text(JSON.stringify(value ?? null, null, 2));
  } catch (err) {
    return errorResult(name, err);
  }
}

/** The success branch of a write's result: what `runWrite`'s reread receives. */
export type Succeeded<R> = R extends { success: false } ? never : R;

const isFailed = (v: unknown): v is { success: false } =>
  typeof v === "object" && v !== null && (v as { success?: unknown }).success === false;

/**
 * Every MCP write tool (spec 2026-10-16 F6): run the app's own action, and on
 * success return the row as it now stands, re-read through the narrow reads
 * (lib/mcp/reads/entities.ts and friends), instead of the action's
 * `ActionResult` (ADR 0074 keeps that contract for the app). Deletes reread
 * to `{ deleted: id }`. A failure, notFound() or throw maps exactly as
 * `runTool` maps it, and nothing is re-read.
 */
export function runWrite<R>(
  name: string,
  write: () => Promise<R>,
  reread: (done: Succeeded<R>) => Promise<object>,
): Promise<ToolResult> {
  return runTool(name, async () => {
    const result = await write();
    if (isFailed(result)) return result;
    return reread(result as Succeeded<R>);
  });
}

/** Like runTool, but fn builds the content itself (images). Same error mapping. */
export async function runToolContent(name: string, fn: () => Promise<ToolContent[]>): Promise<ToolResult> {
  try {
    return { content: await fn() };
  } catch (err) {
    return errorResult(name, err);
  }
}

/** The one throw → tool-result mapping shared by runTool and runToolContent. */
async function errorResult(name: string, err: unknown): Promise<ToolResult> {
  const digest = (err as { digest?: unknown })?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return text(NOT_FOUND_TEXT, true);
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return text("Not signed in.", true);
  if (err instanceof ZodError) {
    return text(`Couldn't do that: ${err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true);
  }
  // 404 and redirect are mapped above and never reach here; this also covers
  // forbidden()/unauthorized() digests (unused today, but same family) so a
  // future caller of them doesn't get reported as an application error.
  if (!isNextControlFlow(err)) await reportError(err, { route: `/api/mcp#${name}`, source: "server", userId: getActingTraveller()?.id });
  return text("Couldn't do that. Try again.", true);
}
