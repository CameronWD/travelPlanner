import { describe, expect, it } from "vitest";
import { isNextControlFlow } from "@/lib/next-control-flow";

/**
 * Tests for isNextControlFlow — the shared predicate for Next's own
 * control-flow throws (notFound()/forbidden()/unauthorized()/redirect()),
 * identified by their `digest` prefix (see lib/mcp/run-tool.ts's precedent).
 */
describe("isNextControlFlow", () => {
  it("is true for a notFound()/forbidden()/unauthorized() digest (NEXT_HTTP_ERROR_FALLBACK;...)", () => {
    const err = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(isNextControlFlow(err)).toBe(true);
  });

  it("is true for a redirect() digest (NEXT_REDIRECT;...)", () => {
    const err = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    expect(isNextControlFlow(err)).toBe(true);
  });

  it("is false for a plain Error with no digest", () => {
    expect(isNextControlFlow(new Error("db down"))).toBe(false);
  });

  it("is false for a non-Error throw", () => {
    expect(isNextControlFlow("boom")).toBe(false);
    expect(isNextControlFlow(null)).toBe(false);
    expect(isNextControlFlow(undefined)).toBe(false);
  });
});
