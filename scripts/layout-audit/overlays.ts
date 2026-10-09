/**
 * Overlay recipes: data describing how to open every dialog/sheet/menu the
 * layout audit screenshots, plus the two Playwright-driving helpers Task 7
 * uses to open one and (optionally) focus its first field.
 *
 * THE HARNESS ONLY EVER OPENS OVERLAYS. It never types into a field, never
 * ticks a checkbox, and never clicks a submit, confirm or destructive
 * button — see SUBMIT_LABELS below. Trigger text equals submit text for
 * several forms ("Add a stop" opens the same dialog whose own submit button
 * is also "Add a stop", etc.), so `openOverlay` has one hard rule: before every
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

/**
 * `click.optional` — skip this step instead of reporting a gap when the
 * trigger isn't on the page at all (rather than merely not-yet-visible).
 * Only "save-template" uses it so far: below 1024px the checklists grid
 * renders Segmented tabs (a "Packing" tab exists), at >=1024px it renders a
 * Card grid instead (no tab role anywhere) — see
 * app/(app)/trips/[tripId]/checklists/checklists-layout.tsx, which mounts
 * exactly one of the two shapes, never both. An optional step lets one
 * recipe cover both shapes without a width parameter threaded through
 * `openOverlay`: the tab click is skipped (not failed) when there's no tab,
 * and the final `expect` wait still catches a recipe that finds nothing at
 * all — the "trigger not found" errors just move to the step that actually
 * matters at each width.
 *
 * `clickInCard` — like `click`, but scoped to the Card whose heading
 * (`h3`, substring match, un-anchored — a heading can carry a trailing
 * count badge, same reasoning as the `/Packing/` regex trigger below) is
 * `heading`. Falls back to an unscoped click when no such Card exists at
 * all (the tabs shape, where content isn't organised into per-category
 * Cards) — so this one step is what makes "save-template" width-aware,
 * without needing two near-duplicate recipes. Built on CSS text
 * pseudo-classes (`:text()`/`:text-is()`) rather than `getByRole`, because
 * the ambient Playwright type shim (scripts/types/playwright-shim.d.ts)
 * only gives `Locator` a string-selector `.locator()`, not `.getByRole()` —
 * extending the shim for one recipe's scoping felt like more surface than
 * this needs. The getByRole-over-getByText rule in this file's docblock is
 * about skipping a hidden mobile/desktop duplicate; that risk doesn't apply
 * here since only one shape is ever mounted.
 */
export type Step =
  | { click: { role: Role; name: string; exact?: boolean; optional?: boolean } }
  | { clickInCard: { heading: string; role: Role; name: string; exact?: boolean } }
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
 * `.test()`, not by comparing raw strings, since e.g.
 * `/^Make .+ the real plan$/` would otherwise silently match "Make this the
 * real plan") — the harness's one hard safety rule, enforced structurally
 * rather than left to reviewer attention.
 */
export const SUBMIT_LABELS = [
  "Delete forever",
  "Delete",
  "Discard variant",
  "Make this the real plan",
  "Make this the real plan anyway",
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
    // The phone header's icon button is "Search" (<640px), its pill is
    // "Search or jump…" (640–767px), the Dock's is "Search" (768–1279px).
    // At >=1280px the sidebar's inline search field (a combobox, not a
    // button) replaces all of them and ⌘K focuses it, so there is no
    // trigger for the dialog there and this reports a gap by design.
    steps: [{ click: { role: "button", name: "/^Search( or jump…)?$/" } }],
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
      { click: { role: "menuitem", name: "New what-if plan" } },
    ],
    // Table said hasText "Variant name" — but that text is only the name
    // field's placeholder/aria-label, never rendered as visible text
    // (confirmed live: the open dialog's innerText is "New what-if plan\n
    // Cancel\nCreate\nClose"), so Locator.filter({hasText}) — which matches
    // textContent, not placeholder attributes — never finds it. The
    // dialog's real accessible name (from its DialogTitle) is "New what-if
    // plan" (fork-switcher.tsx's "New variant" menuitem/title were renamed
    // to "New what-if plan" per the Fork → "What-if plan" relabel).
    expect: { role: "dialog", name: "New what-if plan" },
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
    id: "stop-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    // PlanAddStopButton (components/plan/plan-header-actions.tsx) and its
    // dialog (components/plan/mobile/add-stop-sheet.tsx's DialogTitle) are
    // both "Add a stop" live, not "Add Stop" (casing pass 028cb095).
    steps: [{ click: { role: "button", name: "Add a stop", exact: true } }],
    expect: { role: "dialog", name: "Add a stop" },
  },
  {
    id: "stop-edit",
    route: "/plan",
    tripScoped: true,
    form: true,
    // There is no standalone "Edit {stop}" button live: a stop's edit dialog
    // opens from its "More actions for {stop}" menu's "Edit name & place"
    // item (components/trip/itinerary-manager.tsx) — confirmed live, the
    // dialog's own DialogTitle is still "Edit {stop}".
    steps: [
      { deriveStop: true },
      { click: { role: "button", name: "More actions for {stop}", exact: true } },
      { click: { role: "menuitem", name: "Edit name & place" } },
    ],
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
    // Live, the menuitem's full text is "Delete {stop}owner only" (a
    // trailing "owner only" permission hint with no separating space, from
    // the same component) — exact:true on "Delete {stop}" alone never
    // matches; dropping exact (a substring match, same as "Adjust dates"
    // below) does.
    steps: [
      { deriveStop: true },
      { click: { role: "button", name: "More actions for {stop}", exact: true } },
      { click: { role: "menuitem", name: "Delete {stop}" } },
    ],
    expect: { role: "dialog", name: '/^Delete "/' },
  },
  {
    id: "accommodation-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    // No "Add accommodation" button exists live. The real trigger is
    // StayPanel's CoverageLine (components/plan/stay-panel.tsx): "+ Add a
    // stay" when the stop has no accommodation yet, "+ Add another place"
    // once it has one — confirmed live (EU Christmas 2026's first stop
    // already has a stay, so it shows "+ Add another place").
    steps: [{ click: { role: "button", name: "/^\\+ Add (a stay|another place)$/" } }],
    expect: { role: "dialog", name: "/Add Accommodation|has no dates yet/" },
  },
  {
    id: "transport-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    // AddTransportButton/EditTransportButton (components/trip/
    // transport-form-dialog.tsx, literal "Add Transport"/"Edit Transport")
    // are dead code — unused outside their own file. The real add trigger is
    // the missing-leg LegPill (components/trip/itinerary-manager.tsx's
    // legNodes, lib/plan/leg-label.ts's missingLegLabel): accessibleName
    // "Add transport from {from} to {to}", rendered only when a leg between
    // two dated stops (or a Home base bookend) is missing — EU Christmas
    // 2026 has every leg filled, so this is a genuine "no missing leg on
    // this trip" gap, not a naming one (same class as make-it-fit).
    steps: [{ click: { role: "button", name: "/^Add transport from /" } }],
    expect: { role: "dialog", name: "How are you getting there?" },
  },
  {
    id: "transport-edit",
    route: "/plan",
    tripScoped: true,
    form: true,
    // Same dead-code button as transport-add. Live, a leg is edited by
    // clicking its own LegPill — accessibleName ends ". Edit." (lib/plan/
    // leg-label.ts's legLabel; unique suffix, confirmed against no other
    // live accessible name). The dialog's title is dynamic too: "{Mode} to
    // {toName}" (e.g. "Flight to Rovaniemi (Lapland)"), never the literal
    // "Edit Transport" (components/trip/transport-form-dialog.tsx).
    steps: [{ click: { role: "button", name: "/\\. Edit\\.$/" } }],
    expect: { role: "dialog", name: "/^(Flight|Train|Bus|Car|Ferry|Other) to /" },
  },
  {
    id: "cost-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    // Name confirmed still live and correct (components/trip/
    // cost-editor.tsx's "Add Cost" button and its dialog's title): not a
    // stale-name recipe. Left unchanged. On EU Christmas 2026, though,
    // CostEditor is never mounted on /plan: the Item edit dialog uses a
    // plain cost field instead (no CostEditor), every stop's StayDialog
    // accommodation already has <=1 cost (CostEditor only mounts there past
    // 1 — components/plan/stay-dialog.tsx), and no stop has an unplaced
    // wishlist idea to open (components/plan/idea-sheet.tsx, the one other
    // place CostEditor mounts) — a genuine "not reachable on this trip" gap
    // (same class as make-it-fit), not a naming one.
    steps: [{ click: { role: "button", name: "Add Cost", exact: true } }],
    expect: { role: "dialog", name: "Add Cost" },
  },
  {
    id: "item-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    // "Add Thing to Do" renders nowhere live. Each day's own "+ Add" button
    // (components/trip/itinerary-manager.tsx) opens the Item dialog
    // directly — confirmed live, its DialogTitle is "Add Item" already.
    steps: [{ click: { role: "button", name: "+ Add", exact: true } }],
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
    // The trigger isn't a static "Notes" button: the per-stop extras row
    // (components/plan/stop-open-body.tsx) only renders a Notes link once
    // the stop has at least one note, labelled by count — "1 note", "2
    // notes" (its own `plural` helper) — and it now opens a Stop extras
    // dialog (components/plan/stop-extras-dialog.tsx), not a popover.
    // Confirmed live against EU Christmas 2026's first stop (1 existing
    // note). A stop with zero notes has no trigger at all (same "feature
    // not present for this data" shape as make-it-fit).
    steps: [{ click: { role: "button", name: "/^\\d+ notes?$/" } }],
    // Table said hasText "Add a note" — but that's only the note-body
    // textarea's placeholder ("Add a note…"), never rendered as visible
    // text; the submit button's visible text is "Add note" (no "a"), which
    // collides with SUBMIT_LABELS if used as a click target but is fine
    // here since hasText only checks presence, never clicks. Use the
    // dialog's own "Notes" title segment instead (stop-extras-dialog.tsx's
    // title is "Notes · {stop}") — present regardless of whether the stop
    // has existing notes.
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
    // The real trigger's accessible name is "Make <fork name> the real plan"
    // (see components/trip/compare-table.tsx's
    // aria-label={`Make ${plan.name} the real plan`} on the CompareTable row
    // button), renamed from "Promote <fork name>" per the Promote → "Make
    // this the real plan" relabel. A plain /^Make .+ the real plan$/, though,
    // also matches PromoteForkDialog's own confirm button — "Make this the
    // real plan" (SUBMIT_LABELS) — since a fork can't be named "this" but
    // the regex doesn't know that. The old lookahead excluded the two
    // literal confirm strings by their old wording ("to real plan"/
    // "anyway"); this one excludes the shared "this" the confirm button
    // always uses in the fork-name position instead, so it still matches
    // "anyway" variant too (that one fails the trailing $ regardless).
    steps: [{ click: { role: "button", name: "/^Make (?!this\\b).+ the real plan$/" } }],
    expect: { role: "dialog", name: "/^Make /" },
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
    // Below 1024px: a "Packing" tab exists — click it, then the button is
    // unscoped-unique on the page (the tabs shape has one panel visible at a
    // time). At >=1024px: no tab exists (the checklist categories are a Card
    // grid instead), so the tab click is a no-op (`optional`) and
    // `clickInCard` finds the button scoped to the Card headed "Packing" —
    // see the Step type's doc comment above.
    steps: [
      { click: { role: "tab", name: "/Packing/", optional: true } },
      { clickInCard: { heading: "Packing", role: "button", name: "Save as template", exact: true } },
    ],
    expect: { role: "dialog", name: "Save as template" },
  },
  {
    id: "other-cost-add",
    route: "/budget",
    tripScoped: true,
    form: true,
    // Live trigger and dialog title are both "Add a cost" (components/
    // money/add-cost-button.tsx, components/trip/other-cost-editor.tsx),
    // not "Add Cost" / "Add Other Cost" (casing pass 028cb095).
    steps: [{ click: { role: "button", name: "Add a cost", exact: true } }],
    expect: { role: "dialog", name: "Add a cost" },
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

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const INTERCEPTOR_MAX = 200;

/** A one-line gap reason from a thrown error (or String(err) for a non-Error
 * throw). Playwright's timeout/strict-mode errors carry a multi-line
 * "Call log:" trace after the summary line, mostly noise — except the line
 * naming the element that took the click (`<h3 …>Danger zone</h3> from
 * <div …> subtree intercepts pointer events`), which is exactly what a
 * reviewer needs to act on the gap. So: the summary line, plus the first
 * such line when there is one (ANSI dim codes stripped, its "- " bullet and
 * whitespace trimmed, capped at 200 characters). */
function gapReason(err: unknown): string {
  const lines = (err instanceof Error ? err.message : String(err)).replace(ANSI, "").split("\n");
  const summary = lines[0].trim();
  const interceptor = lines.find((l) => l.includes("intercepts pointer events"));
  if (!interceptor) return summary;
  const line = interceptor.trim().replace(/^-\s+/, "");
  return `${summary} — ${line.length > INTERCEPTOR_MAX ? `${line.slice(0, INTERCEPTOR_MAX - 1)}…` : line}`;
}

/** Short, stable description of a step for a gap's reason prefix — e.g.
 * `click button "Make it fit"`, `press "Escape"`, `deriveStop`. */
function describeStep(step: Step): string {
  if ("deriveStop" in step) return "deriveStop";
  if ("press" in step) return `press "${step.press}"`;
  if ("clickInCard" in step) {
    return `click ${step.clickInCard.role} "${step.clickInCard.name}" in card "${step.clickInCard.heading}"`;
  }
  return `click ${step.click.role} "${step.click.name}"`;
}

// --------------------------------------------------------------------------
// clickInCard — CSS-selector scoping (see the Step type's doc comment)
// --------------------------------------------------------------------------

/** Tag/attribute selector for a `Role`, for building a plain CSS selector
 * (the shim gives `Locator` no `.getByRole()` — see the Step doc comment). */
function roleTagSelector(role: Role): string {
  switch (role) {
    case "button":
      return "button";
    case "link":
      return "a";
    case "tab":
      return '[role="tab"]';
    case "menuitem":
      return '[role="menuitem"]';
  }
}

/** Playwright text-selector, `exact` choosing `:text-is()` (whole,
 * normalised text) over `:text()` (substring, case-insensitive). `name` is
 * JSON-stringified into the selector so quotes/backslashes in it can never
 * break out of the pseudo-class's argument. */
function textSelector(tag: string, name: string, exact: boolean | undefined): string {
  const fn = exact ? "text-is" : "text";
  return `${tag}:${fn}(${JSON.stringify(name)})`;
}

/** Selects the Card whose heading (an `h3`, two levels down per
 * `components/ui/card.tsx`'s `Card > CardHeader > CardTitle`) contains
 * `heading` as a substring — un-anchored so a trailing count badge (e.g.
 * "Packing" + a "3" span, no space between them in the JSX) doesn't break
 * the match. */
function cardHeadingSelector(heading: string): string {
  return `div:has(> div > ${textSelector("h3", heading, false)})`;
}

/**
 * Resolves a `clickInCard` step's target: scoped to the named Card when one
 * exists on the page, otherwise an unscoped `getByRole` (the tabs shape,
 * where there's no Card at all). `scoped` is only for the gap message.
 */
async function resolveClickInCardTarget(
  page: Page,
  step: Extract<Step, { clickInCard: unknown }>["clickInCard"],
  vars: Record<string, string>,
): Promise<{ target: Locator; scoped: boolean }> {
  const name = parseName(step.name, vars);
  const heading = parseName(step.heading, vars);
  if (typeof name === "string" && typeof heading === "string") {
    const card = page.locator(cardHeadingSelector(heading));
    if ((await card.count()) > 0) {
      return { target: card.first().locator(textSelector(roleTagSelector(step.role), name, step.exact)), scoped: true };
    }
  }
  return { target: page.getByRole(step.role, { name, exact: step.exact }), scoped: false };
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

      // click/clickInCard step — refuse if a dialog is already open (an open
      // menu is fine: that's how menu -> menuitem recipes like new-variant
      // work).
      if ((await page.locator(OPEN_DIALOG_SELECTOR).count()) > 0) {
        return { ok: false, reason: "a dialog is already open" };
      }

      if ("clickInCard" in step) {
        const { target, scoped } = await resolveClickInCardTarget(page, step.clickInCard, vars);
        if ((await target.count()) === 0) {
          const where = scoped ? ` in card "${step.clickInCard.heading}"` : "";
          return { ok: false, reason: `trigger not found: ${step.clickInCard.role} "${step.clickInCard.name}"${where}` };
        }
        await target.first().click({ timeout: 5000 });
        continue;
      }

      const name = parseName(step.click.name, vars);
      const target = page.getByRole(step.click.role, { name, exact: step.click.exact });
      if ((await target.count()) === 0) {
        if (step.click.optional) continue;
        return { ok: false, reason: `trigger not found: ${step.click.role} "${name}"` };
      }
      await target.first().click({ timeout: 5000 });
    } catch (err) {
      // A real Playwright call (count/click/getAttribute/evaluate/keyboard)
      // can throw — most commonly a click() actionability timeout when real
      // page chrome (a fixed nav, an overlapping header) intercepts the
      // click. That's a genuine finding, not a harness crash: report it as
      // a gap naming the step, exactly like every other failure mode above.
      return { ok: false, reason: `${describeStep(step)}: ${gapReason(err)}` };
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
