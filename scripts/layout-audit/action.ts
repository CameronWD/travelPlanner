/**
 * What moves when a Traveller does something on a page: ticks a checklist
 * item, adds a thing to do, adds a Cost, votes on an idea, marks a Cost paid.
 *
 * THIS SET WRITES to the local demo trip, through the app's own UI, and puts
 * every change back through the UI before it moves on (`undo`), checking on
 * a fresh load that the page is back as it was found (`undone`).
 *
 * Every server action's answer (a POST with a `next-action` header) is held
 * back 1.5s while a flow acts, so the server's answer lands outside the 500ms after the
 * click in which Chromium marks a shift as input-driven. `during` is then the
 * movement the click itself causes (an optimistic tick, a dialog closing),
 * and `late` the movement when the answer lands: the number that matters.
 * Shifts are counted from the click that commits the action, not from the
 * dialog opening or the typing before it.
 *
 * mark-paid acts on a Cost it adds itself (due today, so it is the first To
 * pay row on both profiles) and deletes it afterwards: un-ticking a paid Cost
 * keeps its paid amount as history (`markCostUnpaid`), which To pay then
 * shows as "Paid · date missing", so marking an existing Cost paid and
 * unpaid again would change the demo trip for good.
 *
 * AN INTERRUPTED RUN (killed between `act` and `undo`) is cleared up at the
 * start of the next one, by `recoverActions`: each change is written to
 * `<out>/action-in-flight.json` before its committing click and taken off it
 * once undone, so a re-run into the same out dir puts back the tick or vote
 * it left; and anything named "Audit item …", "Audit cost …" or "Audit paid
 * …" on Budget or on the `day` route's day is deleted, whatever the out dir.
 */

import * as fs from "node:fs";

import type { BrowserContext, Locator, Page, Request, Route } from "playwright";

import { settle } from "../lib/audit-browser";
import { CLS_INIT_JS, readShifts, resetShifts, summariseShifts, type ClsResult, type ShiftEntry } from "./loading";
import { openOverlay, OVERLAYS, type OverlayRecipe } from "./overlays";

type Shifts = Pick<ClsResult, "total" | "shifts" | "largest">;

/** What a flow changed and how to find it again: enough to put it back from
 * a later run. */
export type InFlight = { url: string } & Record<string, string | null>;

export interface ActionFlow {
  id: "checklist-tick" | "item-add" | "cost-add" | "vote" | "mark-paid";
  routeLabel: string;
  act(page: Page): Promise<void>;
  undo(page: Page): Promise<void>;
  /** Puts back a change, on a fresh load, and checks it is back. */
  restore(page: Page, change: InFlight): Promise<void>;
}

export interface InFlightEntry {
  flow: ActionFlow["id"];
  profile: string;
  change: InFlight;
}

export interface ActionShiftResult {
  /** `action/<flow>/<profile>` — what LAYOUT_AUDIT_ONLY matches. */
  id: string;
  flow: string;
  profile: string;
  during: Shifts;
  late: Shifts;
  undone: boolean;
  error?: string;
}

const ACTION_DELAY_MS = 1500;
const AFTER_SETTLE_MS = 1500;
const ANSWER_TIMEOUT_MS = 20_000;
const BODY_WAIT_MS = 5000;
const PHONE_MAX_WIDTH = 767;

const isServerAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The request goes to the server at once and its answer is held back.
 * Holding the request instead lets Chromium abort the answer's body
 * (ERR_ABORTED) or never finish it. Never re-sent: a failed fetch aborts. */
async function holdServerAnswers(route: Route): Promise<void> {
  if (!isServerAction(route.request())) return route.continue().catch(() => {});
  try {
    const response = await route.fetch();
    await sleep(ACTION_DELAY_MS);
    await route.fulfill({ response });
  } catch {
    await route.abort().catch(() => {});
  }
}

/** The answer to the first server action asked for from now on: one asked
 * for earlier (a page's own rememberLastTrip) is ignored, whenever its answer
 * lands. A trip page's answers can be aborted by the client once their
 * headers are in, so the body is waited for only briefly. */
function serverAnswer(page: Page): Promise<void> {
  return page
    .waitForRequest(isServerAction, { timeout: ANSWER_TIMEOUT_MS })
    .then((request) => request.response())
    .then((response) => Promise.race([response?.finished(), sleep(BODY_WAIT_MS)]))
    .then(() => {});
}

const committed = new WeakMap<Page, Promise<void>>();
const noting = new WeakMap<Page, (change: InFlight) => void>();

/** The click that commits a flow's action: shifts are counted from here. */
async function commit(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await resetShifts(page);
  const answer = serverAnswer(page);
  answer.catch(() => {});
  committed.set(page, answer);
  await target.click();
}

/** A click that calls a server action, waited out (setup and undo). */
async function press(page: Page, target: Locator): Promise<void> {
  const answer = serverAnswer(page);
  await target.click();
  await answer;
}

/** Long enough for the page's own rememberLastTrip to have been asked for
 * before any click is waited on. */
async function load(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  await settle(page);
  await page.waitForTimeout(AFTER_SETTLE_MS);
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? Infinity) <= PHONE_MAX_WIDTH;

/** The first of `matches` that is visible and inside the viewport's width:
 * the Day view renders its neighbouring days off to each side, with their
 * own copies of every control. */
async function firstInView(page: Page, matches: Locator, what: string): Promise<Locator> {
  const width = page.viewportSize()?.width ?? Infinity;
  const n = Math.min(await matches.count(), 60);
  for (let i = 0; i < n; i++) {
    const el = matches.nth(i);
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (box && box.x + box.width > 0 && box.x < width) return el;
  }
  throw new Error(`no ${what} on the page`);
}

async function open(page: Page, recipe: OverlayRecipe): Promise<Locator> {
  const opened = await openOverlay(page, recipe);
  if (!opened.ok) throw new Error(opened.reason);
  return page.getByRole("dialog", { name: recipe.expect.name });
}

function recipe(id: string): OverlayRecipe {
  return OVERLAYS.find((r) => r.id === id)!;
}

const stamp = () => new Date().toISOString().replace(/\D/g, "").slice(0, 14);

const ITEM_PREFIX = "Audit item ";
const COST_PREFIXES = ["Audit cost ", "Audit paid "];

export const isAuditName = (name: string) => [ITEM_PREFIX, ...COST_PREFIXES].some((p) => name.startsWith(p));

// --------------------------------------------------------------------------
// The in-flight journal
// --------------------------------------------------------------------------

export function readInFlight(file: string): Record<string, InFlightEntry> {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, InFlightEntry>) : {};
}

export function recordInFlight(file: string, key: string, entry: InFlightEntry): void {
  fs.writeFileSync(file, JSON.stringify({ ...readInFlight(file), [key]: entry }, null, 2) + "\n");
}

export function clearInFlight(file: string, key: string): void {
  const rest = readInFlight(file);
  delete rest[key];
  if (Object.keys(rest).length > 0) fs.writeFileSync(file, JSON.stringify(rest, null, 2) + "\n");
  else fs.rmSync(file, { force: true });
}

/** Builds a flow from how it acts and how a change is put back. `act` calls
 * `note` with the change before the click that makes it. */
function flowOf(
  id: ActionFlow["id"],
  routeLabel: string,
  act: (page: Page, note: (change: InFlight) => void) => Promise<void>,
  restore: (page: Page, change: InFlight) => Promise<void>,
): ActionFlow {
  let pending: InFlight | null = null;
  return {
    id,
    routeLabel,
    async act(page) {
      pending = null;
      await act(page, (change) => {
        pending = change;
        noting.get(page)?.(change);
      });
    },
    async undo(page) {
      if (!pending) return;
      await restore(page, pending);
      pending = null;
    },
    restore,
  };
}

// --------------------------------------------------------------------------
// The flows
// --------------------------------------------------------------------------

/** The Day view's "Add to this day" → "Something to do": a sheet on a phone,
 * a menu on a desktop. */
export const ADD_ITEM_RECIPES: Record<"phone" | "desktop", OverlayRecipe> = {
  phone: {
    ...recipe("day-add-sheet-phone"),
    steps: [...recipe("day-add-sheet-phone").steps, { click: { role: "button", name: "Something to do", exact: true, within: "dialog" } }],
    expect: { role: "dialog", name: "Add Item" },
  },
  desktop: {
    ...recipe("day-add-menu"),
    steps: [...recipe("day-add-menu").steps, { click: { role: "menuitem", name: "Something to do" } }],
    expect: { role: "dialog", name: "Add Item" },
  },
};

function checklistTick(): ActionFlow {
  const box = (page: Page, name: string) => page.getByRole("checkbox", { name });
  const row = (page: Page, name: string) => page.locator("label").filter({ has: box(page, name) });
  return flowOf(
    "checklist-tick",
    "checklists",
    async (page, note) => {
      const first = await firstInView(page, page.getByRole("checkbox", { checked: false }), "unticked checklist item");
      // The label's first line is the item's own text; a due line follows it.
      const name = (await first.evaluate((el) => (el.closest("label")?.innerText ?? "").split("\n")[0].trim())) || "";
      if (!name || (await box(page, name).count()) !== 1) throw new Error(`the first unticked item has no unique name ("${name}")`);
      note({ url: page.url(), name });
      await commit(page, row(page, name));
    },
    async (page, { url, name }) => {
      await load(page, url);
      if (await box(page, name!).isChecked()) await press(page, row(page, name!));
      await load(page, url);
      if (await box(page, name!).isChecked()) throw new Error(`"${name}" is still ticked`);
    },
  );
}

async function deleteCost(page: Page, url: string, label: string): Promise<void> {
  const rows = page.locator(`li[aria-label="${label}"]`);
  await load(page, url);
  if ((await rows.count()) > 0) {
    await (await firstInView(page, page.getByRole("button", { name: /^(All \d+ costs|\d+ left|All paid|All costs)$/ }), "way into All costs")).click();
    const all = page.getByRole("dialog", { name: "All costs" });
    await all.getByRole("button", { name: `More for ${label}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete cost" }).click();
    await press(page, page.getByRole("dialog", { name: /^Delete/ }).getByRole("button", { name: "Delete", exact: true }));
    await load(page, url);
  }
  if ((await rows.count()) > 0) throw new Error(`"${label}" is still on Budget`);
}

async function addCost(page: Page, label: string, due?: string): Promise<Locator> {
  const dialog = await open(page, recipe("other-cost-add"));
  await dialog.getByRole("textbox", { name: "Description" }).fill(label);
  await dialog.getByRole("textbox", { name: "Cost amount" }).fill("1");
  if (due) await dialog.getByLabel("Due date (optional)").fill(due);
  return dialog.getByRole("button", { name: "Save", exact: true });
}

function costAdd(): ActionFlow {
  return flowOf(
    "cost-add",
    "budget",
    async (page, note) => {
      const label = `${COST_PREFIXES[0]}${stamp()}`;
      const save = await addCost(page, label);
      note({ url: page.url(), label });
      await commit(page, save);
    },
    (page, { url, label }) => deleteCost(page, url, label!),
  );
}

function markPaid(): ActionFlow {
  return flowOf(
    "mark-paid",
    "budget",
    async (page, note) => {
      const label = `${COST_PREFIXES[1]}${stamp()}`;
      const now = new Date();
      const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
      const url = page.url();
      const save = await addCost(page, label, today);
      note({ url, label });
      await press(page, save);
      await load(page, url);
      const box = await firstInView(page, page.getByRole("checkbox", { name: label, exact: true }), `To pay row "${label}"`);
      if ((await box.getAttribute("aria-checked")) !== "false") throw new Error(`"${label}" was added already paid`);
      await commit(page, box);
    },
    (page, { url, label }) => deleteCost(page, url, label!),
  );
}

const titled = (page: Page, title: string) => page.getByRole("button", { name: title, exact: true });

async function deleteItem(page: Page, url: string, title: string): Promise<void> {
  await load(page, url);
  if ((await titled(page, title).count()) > 0) {
    await (await firstInView(page, titled(page, title), `"${title}"`)).click();
    const edit = page.getByRole("dialog", { name: "Edit Item" });
    await edit.getByRole("button", { name: "Delete", exact: true }).click();
    await press(page, page.getByRole("dialog", { name: /^Delete/ }).getByRole("button", { name: "Delete", exact: true }));
    await load(page, url);
  }
  if ((await titled(page, title).count()) > 0) throw new Error(`"${title}" is still on the day`);
}

function itemAdd(): ActionFlow {
  return flowOf(
    "item-add",
    "day",
    async (page, note) => {
      const title = `${ITEM_PREFIX}${stamp()}`;
      const dialog = await open(page, ADD_ITEM_RECIPES[isPhone(page) ? "phone" : "desktop"]);
      await dialog.getByRole("textbox", { name: "Title" }).fill(title);
      note({ url: page.url(), title });
      await commit(page, dialog.getByRole("button", { name: "Add Item", exact: true }));
    },
    (page, { url, title }) => deleteItem(page, url, title!),
  );
}

const LEVELS = ["Must", "Keen", "Meh"] as const;

function vote(): ActionFlow {
  const levelOf = async (card: Locator): Promise<string | null> => {
    const on = card.locator('[role="radio"][aria-checked="true"]');
    return (await on.count()) === 0 ? null : (await on.first().innerText()).trim();
  };
  const level = (card: Locator, name: string) => card.getByRole("radio", { name: new RegExp(`^${name}\\b`) });
  return flowOf(
    "vote",
    "wishlist",
    async (page, note) => {
      const cards = page.locator('[data-testid^="item-card-"]').filter({ has: page.locator('[aria-label="Your vote"]') });
      const card = await firstInView(page, cards, "Wishlist idea with a vote");
      const testId = (await card.getAttribute("data-testid"))!;
      const before = await levelOf(card);
      if (before !== null && !(LEVELS as readonly string[]).includes(before)) throw new Error(`unknown vote level "${before}"`);
      note({ url: page.url(), testId, level: before });
      await commit(page, level(card, before === "Keen" ? "Must" : "Keen"));
    },
    async (page, { url, testId, level: before }) => {
      await load(page, url);
      const card = await firstInView(page, page.getByTestId(testId!), `idea ${testId}`);
      const now = await levelOf(card);
      if (now !== before) await press(page, level(card, before ?? now!));
      await load(page, url);
      const after = await levelOf(await firstInView(page, page.getByTestId(testId!), `idea ${testId}`));
      if (after !== before) throw new Error(`the vote on ${testId} is ${after ?? "cleared"}, was ${before ?? "cleared"}`);
    },
  );
}

export const ACTION_FLOWS: ActionFlow[] = [checklistTick(), itemAdd(), costAdd(), vote(), markPaid()];

// --------------------------------------------------------------------------
// Measuring one flow
// --------------------------------------------------------------------------

export function splitShifts(entries: ShiftEntry[]): { during: ShiftEntry[]; late: ShiftEntry[] } {
  return { during: entries.filter((e) => e.input), late: entries.filter((e) => !e.input) };
}

function shiftsOf(entries: ShiftEntry[]): Shifts {
  const { total, shifts, largest } = summariseShifts(entries.map((e) => ({ ...e, input: false })));
  return { total, shifts, largest };
}

export function summariseAction(entries: ShiftEntry[]): { during: Shifts; late: Shifts } {
  const { during, late } = splitShifts(entries);
  return { during: shiftsOf(during), late: shiftsOf(late) };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).split("\nCall log:")[0].replace(/\s+/g, " ").trim().slice(0, 500);

/** Loads `url` on a fresh page of `context` (Chromium), runs `flow`, returns
 * the layout shifts from its committing click, then puts it back. The change
 * is kept in `journal` (the in-flight file) until it has been put back. */
export async function measureAction(context: BrowserContext, url: string, flow: ActionFlow, profile: string, journal?: string): Promise<ActionShiftResult> {
  const id = `action/${flow.id}/${profile}`;
  const empty: Shifts = { total: 0, shifts: 0, largest: [] };
  let measured: { during: Shifts; late: Shifts } | undefined;
  let error: string | undefined;
  let undone = false;
  const page = await context.newPage();
  if (journal) noting.set(page, (change) => recordInFlight(journal, id, { flow: flow.id, profile, change }));
  try {
    try {
      await page.addInitScript({ content: CLS_INIT_JS });
      await load(page, url);
      await resetShifts(page);
      await page.route("**/*", holdServerAnswers);
      try {
        await flow.act(page);
        const answer = committed.get(page);
        if (!answer) throw new Error("the flow never committed its action");
        await answer;
        await settle(page);
        await page.waitForTimeout(AFTER_SETTLE_MS);
        measured = summariseAction(await readShifts(page));
      } finally {
        committed.delete(page);
        await page.unroute("**/*", holdServerAnswers).catch(() => {});
      }
    } catch (err) {
      error = errorText(err);
    }
    try {
      await flow.undo(page);
      undone = true;
      if (journal) clearInFlight(journal, id);
    } catch (err) {
      error = `${error ? `${error}; ` : ""}undo failed, the demo trip may be changed: ${errorText(err)}`;
    }
  } finally {
    await page.close().catch(() => {});
  }
  const result: ActionShiftResult = { id, flow: flow.id, profile, during: measured?.during ?? empty, late: measured?.late ?? empty, undone };
  return error ? { ...result, error } : result;
}

/**
 * Clears up after an interrupted run, before any flow acts: puts back each
 * change still in `journal`, then deletes everything named like an add
 * flow's leftovers on Budget and on the `day` route's day.
 */
export async function recoverActions(
  context: BrowserContext,
  where: { journal: string; budgetUrl?: string; dayUrl?: string },
): Promise<{ done: string[]; failed: string[] }> {
  const done: string[] = [];
  const failed: string[] = [];
  const page = await context.newPage();
  try {
    for (const [key, entry] of Object.entries(readInFlight(where.journal))) {
      const flow = ACTION_FLOWS.find((f) => f.id === entry.flow)!;
      try {
        await flow.restore(page, entry.change);
        clearInFlight(where.journal, key);
        done.push(`put back ${key} from an interrupted run: ${JSON.stringify(entry.change)}`);
      } catch (err) {
        failed.push(`could not put back ${key} (${JSON.stringify(entry.change)}): ${errorText(err)}`);
      }
    }
    if (where.budgetUrl) {
      await load(page, where.budgetUrl);
      const labels = await page.locator(COST_PREFIXES.map((p) => `li[aria-label^="${p}"]`).join(", ")).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
      for (const label of new Set(labels.filter(isAuditName))) {
        try {
          await deleteCost(page, where.budgetUrl, label);
          done.push(`deleted the leftover Cost "${label}"`);
        } catch (err) {
          failed.push(`could not delete the leftover Cost "${label}": ${errorText(err)}`);
        }
      }
    }
    if (where.dayUrl) {
      await load(page, where.dayUrl);
      const titles = await page.getByRole("button", { name: new RegExp(`^${ITEM_PREFIX}`) }).allInnerTexts();
      for (const title of new Set(titles.map((t) => t.trim()).filter(isAuditName))) {
        try {
          await deleteItem(page, where.dayUrl, title);
          done.push(`deleted the leftover Item "${title}"`);
        } catch (err) {
          failed.push(`could not delete the leftover Item "${title}": ${errorText(err)}`);
        }
      }
    }
  } finally {
    await page.close().catch(() => {});
  }
  return { done, failed };
}

export function mergeAction(prev: ActionShiftResult[], next: ActionShiftResult[]): ActionShiftResult[] {
  const rerun = new Map(next.map((r) => [r.id, r]));
  const seen = new Set(prev.map((r) => r.id));
  return [...prev.map((r) => rerun.get(r.id) ?? r), ...next.filter((r) => !seen.has(r.id))];
}
