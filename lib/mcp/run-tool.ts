/**
 * One error contract for every MCP tool (spec 2026-10-09). Tools call the
 * existing server actions; this maps their results and Next's control-flow
 * throws into MCP tool results. notFound() covers both "missing" and "not
 * yours", so a tool never reveals whether a Trip exists.
 */
import { ZodError } from "zod";
import { reportError } from "@/lib/error-sink";
import { getActingTraveller } from "./acting-traveller";

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
export const NOT_FOUND_TEXT = "Not found, or you don't have access to it.";

const text = (t: string, isError?: boolean): ToolResult =>
  isError ? { isError: true, content: [{ type: "text", text: t }] } : { content: [{ type: "text", text: t }] };

function fieldErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .flatMap(([k, msgs]) => msgs.map((m) => (k === "_" ? m : `${k}: ${m}`)))
    .join("; ");
}

export async function runTool(name: string, fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const value = await fn();
    if (value && typeof value === "object" && "success" in value) {
      const v = value as { success: boolean; errors?: Record<string, string[]>; error?: string };
      if (v.success === false) {
        return text(`Couldn't do that: ${v.errors ? fieldErrors(v.errors) : (v.error ?? "unknown error")}`, true);
      }
      const rest: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      delete rest.success;
      return text(JSON.stringify(rest, null, 2));
    }
    return text(JSON.stringify(value ?? null, null, 2));
  } catch (err) {
    const digest = (err as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return text(NOT_FOUND_TEXT, true);
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return text("Not signed in.", true);
    if (err instanceof ZodError) {
      return text(`Couldn't do that: ${err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true);
    }
    await reportError(err, { route: `/api/mcp#${name}`, source: "server", userId: getActingTraveller()?.id });
    return text("Couldn't do that. Try again.", true);
  }
}
