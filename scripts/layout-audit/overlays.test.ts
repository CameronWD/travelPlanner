import { describe, expect, it, vi } from "vitest";
import { OVERLAYS, SUBMIT_LABELS, parseName, openOverlay } from "./overlays";

describe("parseName", () => {
  it("returns literals untouched", () => expect(parseName("Add Stop", {})).toBe("Add Stop"));
  it("turns /…/ into a RegExp", () => {
    const r = parseName("/^Edit /", {});
    expect(r).toBeInstanceOf(RegExp);
    expect((r as RegExp).test("Edit Paris")).toBe(true);
  });
  it("substitutes {stop}", () => expect(parseName("Edit {stop}", { stop: "Vienna" })).toBe("Edit Vienna"));
  it("escapes substituted text inside a RegExp", () =>
    expect((parseName("/^Edit {stop}$/", { stop: "St. Anton (AT)" }) as RegExp).test("Edit St. Anton (AT)")).toBe(true));
});

describe("OVERLAYS", () => {
  it("has unique ids", () => expect(new Set(OVERLAYS.map((o) => o.id)).size).toBe(OVERLAYS.length));
  it("covers the 34 recipes from the plan", () => expect(OVERLAYS).toHaveLength(34));
  it("never clicks a submit/confirm/destructive label", () => {
    for (const o of OVERLAYS)
      for (const s of o.steps)
        if ("click" in s) expect(SUBMIT_LABELS, `${o.id} clicks "${s.click.name}"`).not.toContain(s.click.name);
  });
  it("every name parses", () => {
    for (const o of OVERLAYS) {
      for (const s of o.steps) if ("click" in s) expect(() => parseName(s.click.name, { stop: "X" })).not.toThrow();
      if (o.expect.name) expect(() => parseName(o.expect.name!, { stop: "X" })).not.toThrow();
    }
  });
  it("recipes using {stop} derive it first", () => {
    for (const o of OVERLAYS) {
      const idx = o.steps.findIndex((s) => "click" in s && s.click.name.includes("{stop}"));
      if (idx >= 0) expect(o.steps.slice(0, idx).some((s) => "deriveStop" in s), o.id).toBe(true);
    }
  });
});

describe("openOverlay", () => {
  it("reports a missing trigger as a gap instead of throwing", async () => {
    const empty = { count: vi.fn(async () => 0), first: vi.fn() };
    const page = { getByRole: vi.fn(() => empty), locator: vi.fn(() => ({ count: async () => 0 })) };
    const recipe = OVERLAYS.find((o) => o.id === "make-it-fit")!;
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({ ok: false, reason: 'trigger not found: button "Make it fit"' });
  });
});
