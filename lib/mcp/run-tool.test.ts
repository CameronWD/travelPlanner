import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
import { reportError } from "@/lib/error-sink";
import { NOT_FOUND_TEXT, runTool } from "./run-tool";

const digestErr = (digest: string) => Object.assign(new Error(digest), { digest });

describe("runTool", () => {
  it("returns JSON text for a value and drops success:true", async () => {
    const r = await runTool("t", async () => ({ success: true, tripId: "x" }));
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0].text)).toEqual({ tripId: "x" });
  });
  it("maps field errors", async () => {
    const r = await runTool("t", async () => ({ success: false, errors: { name: ["Name is required"], _: ["Trip is locked"] } }));
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: "Couldn't do that: name: Name is required; Trip is locked" }] });
  });
  it("maps a single error string", async () => {
    const r = await runTool("t", async () => ({ success: false, error: "Bad date" }));
    expect(r.content[0].text).toBe("Couldn't do that: Bad date");
  });
  it("maps notFound() to the same text for missing and forbidden", async () => {
    const r = await runTool("t", async () => { throw digestErr("NEXT_HTTP_ERROR_FALLBACK;404"); });
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: NOT_FOUND_TEXT }] });
  });
  it("maps a redirect to not signed in", async () => {
    const r = await runTool("t", async () => { throw digestErr("NEXT_REDIRECT;replace;/;307;"); });
    expect(r.content[0].text).toBe("Not signed in.");
  });
  it("maps a ZodError to its issues", async () => {
    const r = await runTool("t", async () => z.object({ n: z.number() }).parse({ n: "x" }));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/^Couldn't do that: n: /);
  });
  it("reports unknown errors and hides them", async () => {
    const r = await runTool("t", async () => { throw new Error("db exploded"); });
    expect(r.content[0].text).toBe("Couldn't do that. Try again.");
    expect(reportError).toHaveBeenCalled();
  });
});
