import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
import { reportError } from "@/lib/error-sink";
import { NOT_FOUND_TEXT, runTool, runToolContent, runWrite, type ToolResult } from "./run-tool";

const digestErr = (digest: string) => Object.assign(new Error(digest), { digest });
/** runTool only ever builds text content; ToolResult also allows images (runToolContent). */
const firstText = (r: ToolResult) => (r.content[0] as { type: "text"; text: string }).text;

describe("runTool", () => {
  it("returns JSON text for a value and drops success:true", async () => {
    const r = await runTool("t", async () => ({ success: true, tripId: "x" }));
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(firstText(r))).toEqual({ tripId: "x" });
  });
  it("maps field errors", async () => {
    const r = await runTool("t", async () => ({ success: false, errors: { name: ["Name is required"], _: ["Trip is locked"] } }));
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: "Couldn't do that: name: Name is required; Trip is locked" }] });
  });
  it("falls back to an empty detail when a failure carries no errors dict (ADR 0074: the legacy `error` string is no longer read)", async () => {
    const r = await runTool("t", async () => ({ success: false }));
    expect(firstText(r)).toBe("Couldn't do that: ");
  });
  it("maps notFound() to the same text for missing and forbidden", async () => {
    const r = await runTool("t", async () => { throw digestErr("NEXT_HTTP_ERROR_FALLBACK;404"); });
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: NOT_FOUND_TEXT }] });
  });
  it("maps a redirect to not signed in", async () => {
    const r = await runTool("t", async () => { throw digestErr("NEXT_REDIRECT;replace;/;307;"); });
    expect(firstText(r)).toBe("Not signed in.");
  });
  it("maps a ZodError to its issues", async () => {
    const r = await runTool("t", async () => z.object({ n: z.number() }).parse({ n: "x" }));
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/^Couldn't do that: n: /);
  });
  it("reports unknown errors and hides them", async () => {
    const r = await runTool("t", async () => { throw new Error("db exploded"); });
    expect(firstText(r)).toBe("Couldn't do that. Try again.");
    expect(reportError).toHaveBeenCalled();
  });
});

describe("runToolContent", () => {
  it("returns the content as given", async () => {
    const content = [
      { type: "text" as const, text: "Castle tickets" },
      { type: "image" as const, data: "aGk=", mimeType: "image/png" },
    ];
    const r = await runToolContent("t", async () => content);
    expect(r).toEqual({ content });
  });
  it("maps notFound() to NOT_FOUND_TEXT exactly as runTool does", async () => {
    const fn = async () => { throw digestErr("NEXT_HTTP_ERROR_FALLBACK;404"); };
    const r = await runToolContent("t", fn);
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: NOT_FOUND_TEXT }] });
    expect(r).toEqual(await runTool("t", fn));
  });
  it("reports unknown errors and hides them", async () => {
    const r = await runToolContent("t", async () => { throw new Error("storage exploded"); });
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: "Couldn't do that. Try again." }] });
    expect(reportError).toHaveBeenCalled();
  });
});

describe("runWrite", () => {
  it("returns the row the reread built, not the action's ActionResult", async () => {
    const reread = vi.fn(async (done: { success: true; id: string }) => ({ stop: { id: done.id, name: "Porto" } }));
    const r = await runWrite("t", async () => ({ success: true as const, id: "s1" }), reread);
    expect(reread).toHaveBeenCalledWith({ success: true, id: "s1" });
    expect(JSON.parse(firstText(r))).toEqual({ stop: { id: "s1", name: "Porto" } });
  });

  it("an action failure maps as runTool maps it, and nothing is re-read", async () => {
    const reread = vi.fn();
    const r = await runWrite("t", async () => ({ success: false as const, errors: { name: ["Name is required"] } }), reread);
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: "Couldn't do that: name: Name is required" }] });
    expect(reread).not.toHaveBeenCalled();
  });

  it("a write that throws notFound() is NOT_FOUND_TEXT, and nothing is re-read", async () => {
    const reread = vi.fn();
    const r = await runWrite("t", async () => { throw digestErr("NEXT_HTTP_ERROR_FALLBACK;404"); }, reread);
    expect(firstText(r)).toBe(NOT_FOUND_TEXT);
    expect(reread).not.toHaveBeenCalled();
  });

  it("a write with no ActionResult (a custom success) is re-read too", async () => {
    const r = await runWrite("t", async () => ({ applied: 2 }), async () => ({ stops: [] }));
    expect(JSON.parse(firstText(r))).toEqual({ stops: [] });
  });
});
