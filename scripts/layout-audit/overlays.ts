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
 * Recipes are data (last walked against the app 2026-11-19), so OVERLAYS is
 * a plain literal array. Before adding a trigger, read the component: a
 * button that looks like it opens a form may be the action itself (Reviews'
 * "Standard Review" starts a Review). Every step targets an element by accessible role via
 * `getByRole`, never `getByText`/`getByLabel`: several triggers exist twice
 * in the DOM with one copy `display:none` (a mobile/desktop pair, usually),
 * and `getByRole` skips the hidden copy while `getByText` would not.
 */

import type { Locator, Page } from "playwright";

import type { OverlayMeta } from "./config";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type Role = "button" | "menuitem" | "tab" | "link";

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
 * without needing two near-duplicate recipes. Only the Card itself is found
 * by a CSS selector on its heading; the trigger inside the Card is found
 * with `Locator.getByRole`, because a CSS `:text-is()` selector matches the
 * smallest element carrying the text — the shared `Button`'s inner label
 * `<span>`, not the `<button>` — so `button:text-is("Save as template")`
 * finds nothing (TC-08).
 *
 * `click.within: "dialog"` — the one exception to "never click with a
 * dialog open": the trigger lives INSIDE the dialog an earlier step opened
 * (on phones a Stop opens as a full-height sheet, and its actions menu, its
 * "add a plan" and its "add a stay" are in that sheet). The click is scoped
 * to the open dialog, so it can only reach what the recipe names.
 *
 * `css` — a Playwright selector, for the few triggers with no stable
 * accessible name (a Day's plan rows are named by their own titles). The
 * element's text is checked against SUBMIT_LABELS at run time before the
 * click, since a selector can't be vetted by the test suite the way a name
 * can.
 */
export type Step =
  | { click: { role: Role; name: string; exact?: boolean; optional?: boolean; within?: "dialog" } }
  | { clickInCard: { heading: string; role: Role; name: string; exact?: boolean } }
  | { css: string }
  | { press: string }
  | { deriveStop: true };

export interface OverlayRecipe extends OverlayMeta {
  /** Sub-path on the deep trip when tripScoped (e.g. "/plan"), else a full
   * app path (e.g. "/trips", "/globe"). May carry `{date}` (the day the
   * `day` route uses) or a query string (`/day/{date}?map=1` opens the Day
   * map with no click at all). */
  route: string;
  tripScoped: boolean;
  steps: Step[];
  /** What must be visible afterwards. `textbox` is for forms that open in
   * place rather than as an overlay (the Reminders card's add form): it is
   * scrolled into view for the screenshot. */
  expect: { role: "dialog" | "menu" | "textbox"; name?: string; hasText?: string };
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
  "Standard Review",
  "Deep Review",
  "Start Deep Review",
  "Apply",
  "Dismiss",
  "Undo",
  "Unschedule",
  "This is fine",
  "Mark all read",
  "Save Reminder",
  "Read booking",
  "Doesn't need one",
  "Sign out",
  "Revoke",
] as const;

export const normaliseApostrophes = (s: string): string => s.replace(/[\u2018\u2019]/g, "'");

export const isSubmitLabel = (label: string): boolean => {
  const l = normaliseApostrophes(label);
  return SUBMIT_LABELS.some((s) => normaliseApostrophes(s) === l);
};

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
  // --- Shell (opened from trip Home: on phones the across-trips pages have
  // only the tab bar, so the header's menus are reachable inside a trip) ---
  {
    id: "traveller-menu",
    route: "",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "Open traveller menu" } }],
    expect: { role: "menu" },
  },
  {
    id: "command-palette",
    route: "",
    tripScoped: true,
    only: "phone",
    form: true,
    // The phone header's icon button. From 1280px the sidebar's inline
    // search field (a combobox, not a dialog) replaces it.
    steps: [{ click: { role: "button", name: "Search", exact: true } }],
    expect: { role: "dialog", name: "Search" },
  },
  {
    id: "trip-switcher",
    route: "",
    tripScoped: true,
    only: "desktop",
    form: false,
    steps: [{ click: { role: "button", name: "/^Switch trip/" } }],
    expect: { role: "menu" },
  },
  {
    id: "share-trip",
    route: "",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "Share", exact: true } }],
    expect: { role: "dialog", name: "Share" },
  },
  {
    id: "notifications",
    route: "",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "/^Notifications/" } }],
    expect: { role: "menu", hasText: "Notifications" },
  },
  {
    id: "mobile-more",
    route: "",
    tripScoped: true,
    only: "phone",
    form: false,
    steps: [{ click: { role: "button", name: "/^More( trip sections.*)?$/" } }],
    expect: { role: "dialog", name: "More" },
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
    // The Feedback panel over a long trip page, where its keyboard-up state
    // was reported as cramped.
    id: "feedback-reviews",
    route: "/reviews",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Leave feedback about Teepee" } }],
    expect: { role: "dialog", name: "Feedback" },
  },

  // --- Reminders (the card is on Home on phones, on Checklists on desktop) ---
  {
    id: "reminder-add",
    route: "",
    tripScoped: true,
    only: "phone",
    form: true,
    // Opens in place. Its submit is also "Add Reminder", but it replaces the
    // trigger, and this recipe clicks once.
    steps: [{ click: { role: "button", name: "Add Reminder", exact: true } }],
    expect: { role: "textbox", name: "Reminder title" },
  },
  {
    id: "reminder-edit",
    route: "",
    tripScoped: true,
    only: "phone",
    form: true,
    steps: [{ click: { role: "button", name: "/^Edit reminder: /" } }],
    expect: { role: "dialog", name: "Edit reminder" },
  },
  {
    id: "reminder-add-desktop",
    route: "/checklists",
    tripScoped: true,
    only: "desktop",
    form: true,
    steps: [{ click: { role: "button", name: "Add Reminder", exact: true } }],
    expect: { role: "textbox", name: "Reminder title" },
  },
  {
    id: "reminder-edit-desktop",
    route: "/checklists",
    tripScoped: true,
    only: "desktop",
    form: true,
    steps: [{ click: { role: "button", name: "/^Edit reminder: /" } }],
    expect: { role: "dialog", name: "Edit reminder" },
  },

  // --- Plan ---
  {
    id: "stop-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Add a stop", exact: true } }],
    expect: { role: "dialog", name: "Add a stop" },
  },
  {
    id: "import-booking",
    route: "/plan",
    tripScoped: true,
    form: true,
    steps: [{ click: { role: "button", name: "Import a booking", exact: true } }],
    expect: { role: "dialog", name: "Import a booking" },
  },
  {
    // Phones: a Stop row ("Open {stop}", components/plan/mobile/
    // mobile-stop-row.tsx) opens the Stop as a full-height sheet.
    id: "stop-sheet",
    route: "/plan",
    tripScoped: true,
    only: "phone",
    form: false,
    steps: [{ click: { role: "button", name: "/^Open (?!traveller menu)/" } }],
    expect: { role: "dialog" },
  },
  {
    id: "stop-menu-phone",
    route: "/plan",
    tripScoped: true,
    only: "phone",
    form: false,
    steps: [
      { click: { role: "button", name: "/^Open (?!traveller menu)/" } },
      { click: { role: "button", name: "/^Actions for /", within: "dialog" } },
    ],
    // A second sheet titled with the Stop's name, like the one under it;
    // told apart by an action only it lists.
    expect: { role: "dialog", hasText: "Edit name & place" },
  },
  {
    id: "item-add-phone",
    route: "/plan",
    tripScoped: true,
    only: "phone",
    form: true,
    steps: [
      { click: { role: "button", name: "/^Open (?!traveller menu)/" } },
      { click: { role: "button", name: "/^Add a plan to /", within: "dialog" } },
    ],
    expect: { role: "dialog", name: "Add Item" },
  },
  {
    id: "stop-menu",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: false,
    steps: [{ click: { role: "button", name: "/^More actions for /" } }],
    expect: { role: "menu" },
  },
  {
    id: "stop-edit",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: true,
    steps: [
      { click: { role: "button", name: "/^More actions for /" } },
      { click: { role: "menuitem", name: "Edit name & place" } },
    ],
    expect: { role: "dialog", name: "/^Edit /i" },
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
    expect: { role: "dialog", name: "/^Adjust dates/i" },
  },
  {
    id: "delete-stop",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: false,
    // The menuitem's text is "Delete {stop}owner only" (a trailing
    // permission hint), so this is a substring match. It opens a
    // confirmation; the confirm button is never clicked.
    steps: [
      { deriveStop: true },
      { click: { role: "button", name: "More actions for {stop}", exact: true } },
      { click: { role: "menuitem", name: "Delete {stop}" } },
    ],
    expect: { role: "dialog", name: '/^Delete [“"]/i' },
  },
  {
    id: "item-add",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: true,
    // An open Stop's day rows: "Add to Fri 4" opens a menu of kinds
    // (something to do, transport, reminder).
    steps: [
      { click: { role: "button", name: "/^Add to (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d+$/" } },
      { click: { role: "menuitem", name: "Something to do" } },
    ],
    expect: { role: "dialog", name: "Add Item" },
  },
  {
    id: "item-edit",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: true,
    steps: [{ click: { role: "button", name: "/^Edit (?!the day title|reminder|name)/" } }],
    expect: { role: "dialog" },
  },
  {
    id: "accommodation-add",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: true,
    // StayPanel's CoverageLine (components/plan/stay-panel.tsx): "Add a
    // stay" when the Stop has none, "Add another place" once it has one.
    steps: [{ click: { role: "button", name: "/^(\\+ )?Add (a stay|another place)$/" } }],
    expect: { role: "dialog" },
  },
  {
    id: "transport-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    // The missing-leg pill (lib/plan/leg-label.ts): only there when a leg
    // between two dated Stops is missing, so a trip with every leg filled
    // reports a gap here by design.
    steps: [{ click: { role: "button", name: "/^Add transport from /" } }],
    expect: { role: "dialog", name: "How are you getting there?" },
  },
  {
    id: "transport-edit",
    route: "/plan",
    tripScoped: true,
    form: true,
    // A leg's own pill; its accessible name ends ". Edit." and its dialog is
    // titled "{Mode} to {place}".
    steps: [{ click: { role: "button", name: "/\\. Edit\\.$/" } }],
    expect: { role: "dialog", name: "/^(Flight|Train|Bus|Car|Drive|Ferry|Other) to /i" },
  },
  {
    id: "cost-add",
    route: "/plan",
    tripScoped: true,
    form: true,
    // CostEditor only mounts where a thing has more than one cost, so most
    // trips report a gap here.
    steps: [{ click: { role: "button", name: "Add Cost", exact: true } }],
    expect: { role: "dialog", name: "Add Cost" },
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
    // Only offered when the plan overruns its dates.
    steps: [{ click: { role: "button", name: "Make it fit" } }],
    expect: { role: "dialog", name: "Make it fit" },
  },
  {
    id: "stop-extras",
    route: "/plan",
    tripScoped: true,
    only: "desktop",
    form: true,
    // An open Stop's extras row: "1 note" / "2 reminders", shown only when
    // the Stop has some (components/plan/stop-extras-dialog.tsx).
    steps: [{ click: { role: "button", name: "/^\\d+ (notes?|reminders?)$/" } }],
    expect: { role: "dialog" },
  },

  // --- Day ---
  {
    id: "day-map",
    route: "/day/{date}?map=1",
    tripScoped: true,
    form: false,
    steps: [],
    expect: { role: "dialog", name: "Day map" },
  },
  {
    id: "day-add-menu",
    route: "/day/{date}",
    tripScoped: true,
    only: "desktop",
    form: false,
    steps: [{ click: { role: "button", name: "Add to this day", exact: true } }],
    expect: { role: "menu" },
  },
  {
    id: "day-add-sheet-phone",
    route: "/day/{date}",
    tripScoped: true,
    only: "phone",
    form: false,
    steps: [{ click: { role: "button", name: "Add to this day", exact: true } }],
    expect: { role: "dialog", name: "Add to this day" },
  },
  {
    id: "day-item",
    route: "/day/{date}",
    tripScoped: true,
    form: true,
    // A plan row's title button (components/trip/timeline.tsx) is named by
    // the thing's own title; the row's other buttons carry an aria-label or
    // are "Unschedule".
    steps: [{ css: '[data-timeline-row] button:not([aria-label]):not(:has-text("Unschedule"))' }],
    expect: { role: "dialog" },
  },
  {
    id: "hop-mode",
    route: "/day/{date}",
    tripScoped: true,
    form: false,
    steps: [{ click: { role: "button", name: "/^How this hop is travelled/" } }],
    expect: { role: "menu" },
  },

  // --- Wishlist, Settings, Checklists, Money, Globe ---
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
  if ("css" in step) return `click ${step.css}`;
  if ("clickInCard" in step) {
    return `click ${step.clickInCard.role} "${step.clickInCard.name}" in card "${step.clickInCard.heading}"`;
  }
  return `click ${step.click.role} "${step.click.name}"`;
}

// --------------------------------------------------------------------------
// clickInCard — CSS-selector scoping to the Card, getByRole for the trigger
// (see the Step type's doc comment)
// --------------------------------------------------------------------------

/** Selects the Card whose heading (an `h3`, two levels down per
 * `components/ui/card.tsx`'s `Card > CardHeader > CardTitle`) contains
 * starts with `heading` — open-ended so a trailing count badge (e.g.
 * "Packing" + a "3" span, no space between them in the JSX) doesn't break
 * the match, anchored so the phone tabs' empty state ("No packing items
 * yet", also an h3 two levels down) is not taken for the Card. */
function cardHeadingSelector(heading: string): string {
  return `div:has(> div > h3:text-matches(${JSON.stringify(`^${escapeRegExp(heading)}`)}))`;
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
  if (typeof heading === "string") {
    const card = page.locator(cardHeadingSelector(heading));
    if ((await card.count()) > 0) {
      return { target: card.first().getByRole(step.role, { name, exact: step.exact }), scoped: true };
    }
  }
  return { target: page.getByRole(step.role, { name, exact: step.exact }), scoped: false };
}

/** The first of `matches` that is visible and lies inside the viewport's
 * width; null when none does. The Day view is a paged carousel (ADR 0065)
 * that renders its neighbouring days off to each side with their own copies
 * of every control, and DOM order puts the previous day's first. */
async function inView(page: Page, matches: Locator): Promise<Locator | null> {
  const width = page.viewportSize()?.width ?? Infinity;
  const n = Math.min(await matches.count(), 60);
  for (let i = 0; i < n; i++) {
    const el = matches.nth(i);
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (box && box.x + box.width > 0 && box.x < width) return el;
  }
  return null;
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

      const within = "click" in step ? step.click.within : undefined;
      // Refuse to click with a dialog open (an open menu is fine: that's
      // how menu -> menuitem recipes work) — unless the step says its
      // trigger is inside that dialog.
      if (!within && (await page.locator(OPEN_DIALOG_SELECTOR).count()) > 0) {
        return { ok: false, reason: "a dialog is already open" };
      }

      if ("css" in step) {
        const target = await inView(page, page.locator(step.css));
        if (!target) return { ok: false, reason: `trigger not found: ${step.css}` };
        const label = ((await target.innerText()) ?? "").trim();
        if (isSubmitLabel(label)) {
          return { ok: false, reason: `refused: ${step.css} resolved to the submit control "${label}"` };
        }
        await target.click({ timeout: 5000 });
        continue;
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
      const scope = within ? page.locator(OPEN_DIALOG_SELECTOR) : page;
      const matches = scope.getByRole(step.click.role, { name, exact: step.click.exact });
      // A sheet's contents arrive after the sheet does (its chunk is lazy).
      if (within) await matches.first().waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
      const count = await matches.count();
      if (count === 0) {
        if (step.click.optional) continue;
        return { ok: false, reason: `trigger not found: ${step.click.role} "${name}"` };
      }
      const target = count === 1 ? matches.first() : ((await inView(page, matches)) ?? matches.first());
      await target.click({ timeout: 5000 });
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
    if (recipe.expect.role === "textbox") await expectLocator.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
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
  if (recipe.expect.role === "textbox") {
    const name = recipe.expect.name ? parseName(recipe.expect.name, {}) : undefined;
    const field = page.getByRole("textbox", name ? { name } : {}).first();
    await field.focus();
    // The viewport has just lost 300px to the "keyboard"; iOS brings the
    // focused field back into what is left.
    await field.evaluate((el) => el.scrollIntoView({ block: "center" }));
    return;
  }
  // The last open one: a recipe can open a dialog from inside a sheet.
  const overlay = page.getByRole(recipe.expect.role).last();
  const field = overlay.locator("input:not([type=hidden]), textarea").first();
  if ((await field.count()) === 0) return;
  if (!(await field.isVisible())) return;
  await field.focus();
}
