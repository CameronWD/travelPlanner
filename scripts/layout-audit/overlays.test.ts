import { describe, expect, it, vi } from "vitest";
import { OVERLAYS, SUBMIT_LABELS, parseName, openOverlay, type Step } from "./overlays";

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

/** Both click-like step shapes carry a `{role, name}` to check — used by the
 * OVERLAYS-wide assertions below so `clickInCard` gets the same coverage as
 * plain `click` steps. */
function clickLike(s: Step): { role: string; name: string } | undefined {
  if ("click" in s) return s.click;
  if ("clickInCard" in s) return s.clickInCard;
  return undefined;
}

describe("OVERLAYS", () => {
  it("has unique ids", () => expect(new Set(OVERLAYS.map((o) => o.id)).size).toBe(OVERLAYS.length));
  // 33: the rail's More dropdown ("rail-more") went when More became a page.
  it("covers the 33 recipes from the plan", () => expect(OVERLAYS).toHaveLength(33));
  it("never clicks a submit/confirm/destructive label", () => {
    // Resolve through parseName first — a raw-name comparison misses a
    // RegExp trigger (e.g. /^Promote /) that happens to also match a
    // SUBMIT_LABELS string ("Promote to real plan") even though the two
    // strings are literally different.
    for (const o of OVERLAYS)
      for (const s of o.steps) {
        const click = clickLike(s);
        if (!click) continue;
        const parsed = parseName(click.name, { stop: "X" });
        if (parsed instanceof RegExp) {
          for (const label of SUBMIT_LABELS) {
            expect(parsed.test(label), `${o.id}'s "${click.name}" matches SUBMIT_LABELS "${label}"`).toBe(false);
          }
        } else {
          expect(SUBMIT_LABELS, `${o.id} clicks "${click.name}"`).not.toContain(parsed);
        }
      }
  });
  it("every name parses", () => {
    for (const o of OVERLAYS) {
      for (const s of o.steps) {
        const click = clickLike(s);
        if (click) expect(() => parseName(click.name, { stop: "X" })).not.toThrow();
      }
      if (o.expect.name) expect(() => parseName(o.expect.name!, { stop: "X" })).not.toThrow();
    }
  });
  it("recipes using {stop} derive it first", () => {
    for (const o of OVERLAYS) {
      const idx = o.steps.findIndex((s) => clickLike(s)?.name.includes("{stop}"));
      if (idx >= 0) expect(o.steps.slice(0, idx).some((s) => "deriveStop" in s), o.id).toBe(true);
    }
  });
  it("save-template is width-aware: an optional tab click, then a clickInCard scoped to \"Packing\"", () => {
    const recipe = OVERLAYS.find((o) => o.id === "save-template")!;
    expect(recipe.steps).toEqual([
      { click: { role: "tab", name: "/Packing/", optional: true } },
      { clickInCard: { heading: "Packing", role: "button", name: "Save as template", exact: true } },
    ]);
  });
});

describe("openOverlay", () => {
  it("reports a missing trigger as a gap instead of throwing", async () => {
    const empty = { count: vi.fn(async () => 0), first: vi.fn() };
    const page = { getByRole: vi.fn(() => empty), locator: vi.fn(() => ({ count: async () => 0 })) };
    const recipe = OVERLAYS.find((o) => o.id === "make-it-fit")!;
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({ ok: false, reason: 'trigger not found: button "Make it fit"' });
  });

  it("turns a thrown click() error into a gap naming the step, instead of throwing", async () => {
    // A real Playwright actionability timeout's message carries a long
    // multi-line "Call log:" trace after the summary line — only the first
    // line should end up in the reason.
    interface FakeLocator {
      count: () => Promise<number>;
      first: () => FakeLocator;
      click: () => Promise<void>;
    }
    const target: FakeLocator = {
      count: vi.fn(async () => 1),
      first: vi.fn((): FakeLocator => target),
      click: vi.fn(async () => {
        throw new Error("locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator");
      }),
    };
    const page = {
      getByRole: vi.fn(() => target),
      locator: vi.fn(() => ({ count: vi.fn(async () => 0) })),
    };
    const recipe = OVERLAYS.find((o) => o.id === "make-it-fit")!;
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({
      ok: false,
      reason: 'click button "Make it fit": locator.click: Timeout 5000ms exceeded.',
    });
  });

  // Final review: the call log's "… intercepts pointer events" line names the element that
  // actually got the click — the whole point of the gap — so it survives, ANSI-stripped.
  const throwingPage = (message: string) => {
    interface FakeLocator {
      count: () => Promise<number>;
      first: () => FakeLocator;
      click: () => Promise<void>;
    }
    const target: FakeLocator = {
      count: vi.fn(async () => 1),
      first: vi.fn((): FakeLocator => target),
      click: vi.fn(async () => {
        throw new Error(message);
      }),
    };
    return { getByRole: vi.fn(() => target), locator: vi.fn(() => ({ count: vi.fn(async () => 0) })) };
  };
  const dim = (line: string) => `\u001b[2m${line}\u001b[22m`;

  it("keeps the call-log line naming the element that intercepts the click", async () => {
    const message = [
      "locator.click: Timeout 5000ms exceeded.",
      "Call log:",
      dim(`  - waiting for getByRole('button', { name: 'Delete trip' }).first()`),
      dim(`    - locator resolved to <button type="button" class="inline-flex items-center gap-2">Delete trip</button>`),
      dim("  - attempting click action"),
      dim("    2 × waiting for element to be visible, enabled and stable"),
      dim("      - element is visible, enabled and stable"),
      dim("      - scrolling into view if needed"),
      dim("      - done scrolling"),
      dim(`      - <h3 class="text-base font-semibold">Danger zone</h3> from <div class="rounded-2xl border p-4">…</div> subtree intercepts pointer events`),
      dim("    - retrying click action"),
      dim("      - waiting 20ms"),
      dim(`      - <h3 class="text-base font-semibold">Danger zone</h3> from <div class="rounded-2xl border p-4">…</div> subtree intercepts pointer events`),
      "",
    ].join("\n");
    const recipe = OVERLAYS.find((o) => o.id === "make-it-fit")!;
    const result = await openOverlay(throwingPage(message) as never, recipe);
    expect(result).toEqual({
      ok: false,
      reason:
        'click button "Make it fit": locator.click: Timeout 5000ms exceeded. — ' +
        '<h3 class="text-base font-semibold">Danger zone</h3> from <div class="rounded-2xl border p-4">…</div> subtree intercepts pointer events',
    });
    expect((result as { reason: string }).reason).not.toMatch(/\u001b/);
  });

  it("caps the interceptor line at 200 characters", async () => {
    const longClass = "x".repeat(300);
    const message = `locator.click: Timeout 5000ms exceeded.\nCall log:\n${dim(`      - <div class="${longClass}">…</div> intercepts pointer events`)}`;
    const recipe = OVERLAYS.find((o) => o.id === "make-it-fit")!;
    const result = (await openOverlay(throwingPage(message) as never, recipe)) as { ok: false; reason: string };
    const [, interceptor] = result.reason.split(" — ");
    expect(interceptor.startsWith('<div class="xxx')).toBe(true);
    expect(interceptor.length).toBeLessThanOrEqual(200);
    expect(interceptor).not.toMatch(/\u001b|\[2m|\[22m/);
  });
});

// --------------------------------------------------------------------------
// click.optional / clickInCard — LA-018 harness fix, save-template recipe
// --------------------------------------------------------------------------

describe("openOverlay: click.optional and clickInCard", () => {
  interface FakeLocator {
    count: () => Promise<number>;
    first: () => FakeLocator;
    click: () => Promise<void>;
    locator: (selector: string) => FakeLocator;
    waitFor: () => Promise<void>;
  }

  /** A locator with `count`, whose `.locator(selector)` (used to scope into
   * a Card) is answered by `onLocator` — defaulting to "nothing there". */
  function fakeLocator(count: number, onLocator?: (selector: string) => FakeLocator): FakeLocator {
    const self: FakeLocator = {
      count: vi.fn(async () => count),
      first: vi.fn(() => self),
      click: vi.fn(async () => {}),
      locator: vi.fn((selector: string) => (onLocator ? onLocator(selector) : fakeLocator(0))),
      waitFor: vi.fn(async () => {}),
    };
    return self;
  }

  const CARD_SELECTOR_PREFIX = "div:has(";

  /**
   * `tab`: count for `getByRole("tab", …)`. `card`: count for the
   * `div:has(…)` Card-heading selector; when it's >0, `cardButton` is the
   * count `.locator(...)` inside that Card returns. `fallbackButton`: count
   * for the unscoped `getByRole("button", …)` clickInCard falls back to.
   * `dialog`: count for the `[role=dialog]` "already open" guard (0 unless
   * a test says otherwise).
   */
  function fakePage(opts: { tab: number; card: number; cardButton?: number; fallbackButton?: number; dialog?: number }) {
    const dialogLocator = fakeLocator(opts.dialog ?? 0);
    const cardLocator = fakeLocator(opts.card, () => fakeLocator(opts.cardButton ?? 0));
    return {
      locator: vi.fn((selector: string) => (selector.startsWith(CARD_SELECTOR_PREFIX) ? cardLocator : dialogLocator)),
      getByRole: vi.fn((role: string) => (role === "tab" ? fakeLocator(opts.tab) : fakeLocator(opts.fallbackButton ?? 0))),
    };
  }

  const recipe = OVERLAYS.find((o) => o.id === "save-template")!;

  it("desktop shape: no tab (skipped, not a gap) — clickInCard finds the button scoped to the Packing card", async () => {
    const page = fakePage({ tab: 0, card: 1, cardButton: 1 });
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({ ok: true });
    // The unscoped fallback getByRole("button", …) must never have been used.
    expect(page.getByRole).not.toHaveBeenCalledWith("button", expect.anything());
  });

  it("phone shape: the tab is clicked, then clickInCard falls back to an unscoped click (no Card exists)", async () => {
    const page = fakePage({ tab: 1, card: 0, fallbackButton: 1 });
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({ ok: true });
    expect(page.getByRole).toHaveBeenCalledWith("tab", expect.objectContaining({ name: /Packing/ }));
  });

  it("reports the card-scoped trigger as a gap, naming the card, when the Card exists but the button doesn't", async () => {
    const page = fakePage({ tab: 0, card: 1, cardButton: 0 });
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({
      ok: false,
      reason: 'trigger not found: button "Save as template" in card "Packing"',
    });
  });

  it("reports a plain gap (no \"in card\") when neither the tab nor the fallback button exist", async () => {
    const page = fakePage({ tab: 0, card: 0, fallbackButton: 0 });
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({
      ok: false,
      reason: 'trigger not found: button "Save as template"',
    });
  });

  it("an optional click step never reports its own gap — a recipe whose only step is skipped still falls through to the final \"overlay did not open\" check", async () => {
    const optionalOnly: typeof recipe = {
      ...recipe,
      steps: [{ click: { role: "tab", name: "Packing", optional: true } }],
      expect: { role: "dialog", name: "Never opens" },
    };
    // The tab is absent (skipped, not a gap) and nothing ever opens the
    // dialog — the final `expect` wait times out, which is the gap that
    // must surface, not a false "trigger not found" from the optional step.
    const neverVisible = fakeLocator(0);
    neverVisible.waitFor = vi.fn(async () => {
      throw new Error("Timeout 5000ms exceeded.");
    });
    const page = {
      locator: vi.fn(() => fakeLocator(0)),
      getByRole: vi.fn((role: string) => (role === "tab" ? fakeLocator(0) : neverVisible)),
    };
    await expect(openOverlay(page as never, optionalOnly)).resolves.toEqual({
      ok: false,
      reason: 'overlay did not open: dialog "Never opens"',
    });
  });

  it("the dialog-already-open guard still applies before a clickInCard step", async () => {
    const clickInCardOnly: typeof recipe = { ...recipe, steps: [recipe.steps[1]] };
    const page = fakePage({ tab: 0, card: 1, cardButton: 1, dialog: 1 });
    await expect(openOverlay(page as never, clickInCardOnly)).resolves.toEqual({ ok: false, reason: "a dialog is already open" });
  });
});
