/**
 * Overlay recipes: data describing how to open every dialog/sheet/menu the
 * layout audit screenshots, plus the two Playwright-driving helpers Task 7
 * uses to open one and (optionally) focus its first field.
 *
 * THE HARNESS ONLY EVER OPENS OVERLAYS. It never types into a field, never
 * ticks a checkbox, and never clicks a submit, confirm or destructive
 * button — see SUBMIT_LABELS below. Trigger text equals submit text for
 * several forms ("Add Stop" opens the same dialog whose own submit button is
 * also "Add Stop", etc.), so `openOverlay` has one hard rule: before every
 * `click` step it checks that no `[role=dialog][data-state=open]` is
 * present (an open *menu* is fine — that's how menu -> menuitem recipes
 * work) and refuses with a gap rather than clicking again into an already-
 * open dialog.
 *
 * Recipes are data (source: a read of every overlay component, 2026-09-24),
 * so OVERLAYS is a plain literal array kept in table order — see
 * docs/specs/2026-09-24-layout-audit.md and the Task 6 brief for the table
 * this transcribes. Every step targets an element by accessible role via
 * `getByRole`, never `getByText`/`getByLabel`: several triggers exist twice
 * in the DOM with one copy `display:none` (a mobile/desktop pair, usually),
 * and `getByRole` skips the hidden copy while `getByText` would not.
 */

import type { Locator, Page } from "playwright";

import type { OverlayMeta } from "./config";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type Role = "button" | "menuitem" | "tab" | "link";

export type Step =
  | { click: { role: Role; name: string; exact?: boolean } }
  | { press: string }
  | { deriveStop: true };

export interface OverlayRecipe extends OverlayMeta {
  /** Sub-path on the deep trip when tripScoped (e.g. "/plan"), else a full
   * app path (e.g. "/trips", "/globe"). */
  route: string;
  tripScoped: boolean;
  steps: Step[];
  expect: { role: "dialog" | "menu"; name?: string; hasText?: string };
}

// --------------------------------------------------------------------------
// Submit/confirm/destructive labels this harness must never click
// --------------------------------------------------------------------------

/**
 * Labels a recipe must never click. `OVERLAYS`'s own test suite asserts
 * this for every recipe's `click` step — resolving each name through
 * `parseName` first (a RegExp trigger is checked against every label via
 * `.test()`, not by comparing raw strings, since e.g. `/^Promote /` would
 * otherwise silently match "Promote to real plan") — the harness's one hard
 * safety rule, enforced structurally rather than left to reviewer
 * attention.
 */
export const SUBMIT_LABELS = [
  "Delete forever",
  "Delete",
  "Discard variant",
  "Promote to real plan",
  "Promote anyway",
  "Make rough",
  "Firm up this leg",
  "Save",
  "Save changes",
  "Save dates",
  "Save template",
  "Create",
  "Apply trim",
  "Drop",
  "Confirm",
  "Send",
  "Invite",
  "Schedule",
  "Add note",
] as const;

// --------------------------------------------------------------------------
// parseName — turns a recipe's name text into what getByRole expects
// --------------------------------------------------------------------------

/** `^/(.*)/([a-z]*)$` — a name written as `/source/flags` is a RegExp
 * literal, not a literal string to match verbatim. */
const REGEX_LITERAL_RE = /^\/(.*)\/([a-z]*)$/;

const VAR_RE = /\{(\w+)\}/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Substitutes `{var}` placeholders (e.g. `{stop}`) from `vars`, then — if
 * `name` is written as `/source/flags` — builds a RegExp out of it instead
 * of returning the literal string.
 *
 * Substitution happens on the *source* of a RegExp-shaped name, with the
 * substituted value regex-escaped first: `/^Edit {stop}$/` with
 * `stop: "St. Anton (AT)"` must match the literal text "Edit St. Anton
 * (AT)", not treat the traveller's punctuation as regex syntax.
 */
export function parseName(name: string, vars: Record<string, string>): string | RegExp {
  const asPattern = REGEX_LITERAL_RE.exec(name);
  if (asPattern) {
    const [, source, flags] = asPattern;
    const substituted = source.replace(VAR_RE, (_match, key: string) => escapeRegExp(vars[key] ?? ""));
    return new RegExp(substituted, flags);
  }
  return name.replace(VAR_RE, (_match, key: string) => vars[key] ?? "");
}

// --------------------------------------------------------------------------
// The recipes
// --------------------------------------------------------------------------

export const OVERLAYS: OverlayRecipe[] = [
  {
    id: "traveller-menu",
    route: "/trips",
    tripScoped: false,
    form: false,
    steps: [{ click: { role: "button", name: "Open traveller menu" } }],
    expect: { role: "menu", name: "Open traveller menu" },
  },
  {
    id: "command-palette",
    route: "/trips",
    tripScoped: false,
    form: true,
    steps: [{ click: { role: "button", name: "Search (⌘K)" } }],
    expect: { role: "dialog", name: "Command palette" },
  },
  {
    id: "feedback",
    route: "/trips",
    tripScoped: false,
    form: true,
    steps: [{ click: { role: "button", name: "Leave feedback about Teepee" } }],
    expect: { role: "dialog", name: "Feedback" },
  },
  {
    id: "trip-actions",
    route: "/trips",
    tripScoped: false,
    form: false,
    steps: [{ click: { role: "button", name: "Trip actions" } }],
    expect: { role: "menu" },
  },
  {
    id: "fork-switcher",
    route: "/plan",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "/Open plan switcher/" } }],
    expect: { role: "menu" },
  },
  {
    id: "new-variant",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [
      { click: { role: "button", name: "/Open plan switcher/" } },
      { click: { role: "menuitem", name: "New variant" } },
    ],
    // Table said hasText "Variant name" — but that text is only the name
    // field's placeholder/aria-label, never rendered as visible text
    // (confirmed live: the open dialog's innerText is "New variant\nCancel\n
    // Create\nClose"), so Locator.filter({hasText}) — which matches
    // textContent, not placeholder attributes — never finds it. The
    // dialog's real accessible name (from its DialogTitle) is "New variant".
    expect: { role: "dialog", name: "New variant" },
  },
  {
    id: "notifications",
    route: "/plan",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "/^Notifications/" } }],
    expect: { role: "menu", hasText: "Notifications" },
  },
  {
    id: "mobile-more",
    route: "/plan",
    tripScoped: true,
    only: "phone",
    form: false,
    steps: [{ click: { role: "button", name: "More", exact: true } }],
    expect: { role: "dialog", name: "More navigation" },
  },
  {
    id: "rail-more",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: false,
    steps: [{ click: { role: "button", name: "More trip sections", exact: true } }],
    expect: { role: "menu" },
  },
  {
    id: "stop-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add Stop", exact: true } }],
    expect: { role: "dialog", name: "Add Stop" },
  },
  {
    id: "stop-edit",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ deriveStop: true }, { click: { role: "button", name: "Edit {stop}", exact: true } }],
    expect: { role: "dialog", name: "Edit {stop}" },
  },
  {
    id: "stop-menu",
    route: "/plan",
    tripScoped: true,
    only: "phone",
    form: false,
    steps: [{ deriveStop: true }, { click: { role: "button", name: "More actions for {stop}", exact: true } }],
    expect: { role: "menu" },
  },
  {
    id: "adjust-dates",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: true,
    steps: [
      { click: { role: "button", name: "/^More actions for /" } },
      { click: { role: "menuitem", name: "Adjust dates" } },
    ],
    expect: { role: "dialog", name: "/^Adjust dates/" },
  },
  {
    id: "delete-stop",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: false,
    steps: [{ deriveStop: true }, { click: { role: "button", name: "Delete {stop}", exact: true } }],
    expect: { role: "dialog", name: '/^Delete "/' },
  },
  {
    id: "accommodation-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add Accommodation", exact: true } }],
    expect: { role: "dialog", name: "/Add Accommodation|has no dates yet/" },
  },
  {
    id: "transport-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add transport", exact: true } }],
    expect: { role: "dialog", name: "Add Transport" },
  },
  {
    id: "transport-edit",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Edit Transport", exact: true } }],
    expect: { role: "dialog", name: "Edit Transport" },
  },
  {
    id: "cost-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add Cost", exact: true } }],
    expect: { role: "dialog", name: "Add Cost" },
  },
  {
    id: "item-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add Thing to Do", exact: true } }],
    expect: { role: "dialog", name: "Add Item" },
  },
  {
    id: "chapters-menu",
    route: "/plan",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "Chapters", exact: true } }],
    expect: { role: "menu" },
  },
  {
    id: "chapter-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [
      { click: { role: "button", name: "Chapters", exact: true } },
      { click: { role: "menuitem", name: "New Chapter" } },
    ],
    expect: { role: "dialog", name: "Add Chapter" },
  },
  {
    id: "make-it-fit",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Make it fit" } }],
    expect: { role: "dialog", name: "Make it fit" },
  },
  {
    id: "notes-popover",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: true,
    steps: [{ click: { role: "button", name: "/^Notes/" } }],
    // Table said hasText "Add a note" — but that's only the note-body
    // textarea's placeholder ("Add a note…"), never rendered as visible
    // text; the submit button's visible text is "Add note" (no "a"), which
    // collides with SUBMIT_LABELS if used as a click target but is fine
    // here since hasText only checks presence, never clicks. Use the
    // popover's static "Notes" heading instead — present regardless of
    // whether the stop has existing notes.
    expect: { role: "dialog", hasText: "Notes" },
  },
  {
    id: "wishlist-add",
    route: "/wishlist",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add an idea", exact: true } }],
    expect: { role: "dialog", name: "Add Item" },
  },
  {
    id: "schedule-item",
    route: "/wishlist",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "/^Schedule /" } }],
    expect: { role: "dialog", name: "Schedule Item" },
  },
  {
    id: "add-from-globe",
    route: "/wishlist",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add from Globe", exact: true } }],
    expect: { role: "dialog", name: "Add from Globe" },
  },
  {
    id: "promote-fork",
    route: "/compare",
    tripScoped: true,
    form: false,
    // The real trigger's accessible name is "Promote <fork name>" (see
    // components/trip/compare-table.tsx's aria-label={`Promote ${plan.name}`}
    // on the CompareTable row button). A plain /^Promote /, though, also
    // matches PromoteForkDialog's own confirm button — "Promote to real
    // plan" or "Promote anyway" (both SUBMIT_LABELS) — since both also start
    // with "Promote ". The negative lookahead excludes exactly those two
    // known confirm labels (matched to end-of-string) while still matching
    // any fork name.
    steps: [{ click: { role: "button", name: "/^Promote (?!to real plan$|anyway$)/" } }],
    expect: { role: "dialog", name: "/^Promote /" },
  },
  {
    id: "duplicate-trip",
    route: "/settings",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Duplicate trip", exact: true } }],
    expect: { role: "dialog", name: "Duplicate this trip?" },
  },
  {
    id: "delete-trip",
    route: "/settings",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Delete trip", exact: true } }],
    expect: { role: "dialog", name: "Delete this trip?" },
  },
  {
    id: "checklist-edit",
    route: "/checklists",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Edit Item", exact: true } }],
    expect: { role: "dialog", name: "Edit Item" },
  },
  {
    id: "save-template",
    route: "/checklists",
    tripScoped: true,
    form: true,
    steps: [
      { click: { role: "tab", name: "/Packing/" } },
      { click: { role: "button", name: "Save as template", exact: true } },
    ],
    expect: { role: "dialog", name: "Save as template" },
  },
  {
    id: "other-cost-add",
    route: "/budget",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add Cost", exact: true } }],
    expect: { role: "dialog", name: "Add Other Cost" },
  },
  {
    id: "marker-add",
    route: "/globe",
    tripScoped: false,
    form: true,
    steps: [{ click: { role: "button", name: "Add marker", exact: true } }],
    expect: { role: "dialog", name: "Add Marker" },
  },
  {
    id: "globe-share",
    route: "/globe",
    tripScoped: false,
    form: true,
    steps: [{ click: { role: "button", name: "Share", exact: true } }],
    expect: { role: "dialog", name: "Share your Globe" },
  },
];

// --------------------------------------------------------------------------
// openOverlay / focusFirstInput — live-only (see the Task 6 report for the
// live smoke run; these are exercised directly by openOverlay's own unit
// test, which stubs `page`)
// --------------------------------------------------------------------------

const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"]';
const DRAG_HANDLE_SELECTOR = '[data-testid="drag-handle-stop"]';

/**
 * Derives `{stop}` from the first stop's drag handle, whose accessible name
 * is `Reorder <name>` (see components/trip/itinerary-manager.tsx's
 * SortableStop). ADR 0021 gives every stop a drag handle now (rough and
 * dated alike), so this is the one source of the stop name.
 *
 * The brief's fallback note ("if drag-handle-stop only renders on rough
 * stops, fall back to the first h3 inside the itinerary list") was
 * deliberately NOT implemented: `components/trip/itinerary-manager.tsx`
 * has no stable selector scoping "the itinerary list" (no test id, no
 * `aria-label`, no landmark role around its root `<div>` or the `<h3>`
 * StopCard renders per stop — checked directly, not guessed), and adding
 * one would mean editing app code, which is out of scope here. An
 * unscoped `document.querySelector("h3")` risks matching an unrelated
 * heading elsewhere on the page and deriving a wrong stop name silently —
 * worse than a loud gap. So: no drag handle means no stop, full stop.
 */
async function deriveStopName(page: Page): Promise<string | null> {
  const handles = page.locator(DRAG_HANDLE_SELECTOR);
  if ((await handles.count()) === 0) return null;
  const label = await handles.first().getAttribute("aria-label");
  return label ? label.replace(/^Reorder /, "") : null;
}

function nameFor(recipe: OverlayRecipe, vars: Record<string, string>): string | RegExp | undefined {
  return recipe.expect.name ? parseName(recipe.expect.name, vars) : undefined;
}

/** First line of an Error's message (or of String(err) for a non-Error
 * throw) — Playwright's own timeout/strict-mode errors carry a multi-line
 * "Call log:" trace after the first line; that's noise for a one-line gap
 * reason, so only the summary line is kept. */
function firstLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0];
}

/** Short, stable description of a step for a gap's reason prefix — e.g.
 * `click button "Make it fit"`, `press "Escape"`, `deriveStop`. */
function describeStep(step: Step): string {
  if ("deriveStop" in step) return "deriveStop";
  if ("press" in step) return `press "${step.press}"`;
  return `click ${step.click.role} "${step.click.name}"`;
}

/**
 * Opens one overlay by walking its recipe's steps, then waits up to 5s for
 * `expect` to become visible. Never throws on a recipe that can't open —
 * every failure mode (missing trigger, a dialog already open, no stop to
 * derive, a step throwing (e.g. a real Playwright actionability timeout on
 * `.click()`), the overlay never appearing) comes back as
 * `{ ok: false, reason }` so Task 7 can record it as a coverage gap rather
 * than crash the run.
 */
export async function openOverlay(page: Page, recipe: OverlayRecipe): Promise<{ ok: true } | { ok: false; reason: string }> {
  const vars: Record<string, string> = {};

  for (const step of recipe.steps) {
    try {
      if ("deriveStop" in step) {
        const stop = await deriveStopName(page);
        if (stop === null) return { ok: false, reason: "no stop on the page" };
        vars.stop = stop;
        continue;
      }

      if ("press" in step) {
        await page.keyboard.press(step.press);
        continue;
      }

      // click step — refuse if a dialog is already open (an open menu is
      // fine: that's how menu -> menuitem recipes like new-variant work).
      if ((await page.locator(OPEN_DIALOG_SELECTOR).count()) > 0) {
        return { ok: false, reason: "a dialog is already open" };
      }

      const name = parseName(step.click.name, vars);
      const target = page.getByRole(step.click.role, { name, exact: step.click.exact });
      if ((await target.count()) === 0) {
        return { ok: false, reason: `trigger not found: ${step.click.role} "${name}"` };
      }
      await target.first().click({ timeout: 5000 });
    } catch (err) {
      // A real Playwright call (count/click/getAttribute/evaluate/keyboard)
      // can throw — most commonly a click() actionability timeout when real
      // page chrome (a fixed nav, an overlapping header) intercepts the
      // click. That's a genuine finding, not a harness crash: report it as
      // a gap naming the step, exactly like every other failure mode above.
      return { ok: false, reason: `${describeStep(step)}: ${firstLine(err)}` };
    }
  }

  const name = nameFor(recipe, vars);
  let expectLocator: Locator = page.getByRole(recipe.expect.role, name ? { name } : {});
  if (recipe.expect.hasText) expectLocator = expectLocator.filter({ hasText: recipe.expect.hasText });

  try {
    await expectLocator.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    return {
      ok: false,
      reason: `overlay did not open: ${recipe.expect.role}${name ? ` "${name}"` : ""}`,
    };
  }

  return { ok: true };
}

/**
 * Focuses the first visible input/textarea inside the overlay `openOverlay`
 * just opened — Task 7 uses this for the "keyboard" captures (simulated
 * on-screen keyboard: shrunk viewport height + a focused field). No-op if
 * the overlay has no visible field (e.g. a menu, or a confirmation dialog
 * with no form controls) — it never types into whatever it focuses.
 */
export async function focusFirstInput(page: Page, recipe: OverlayRecipe): Promise<void> {
  const overlay = page.getByRole(recipe.expect.role).first();
  const field = overlay.locator("input, textarea").first();
  if ((await field.count()) === 0) return;
  if (!(await field.isVisible())) return;
  await field.focus();
}
