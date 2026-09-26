/**
 * Minimal ambient type shim for the `playwright` package.
 *
 * `playwright` is deliberately NOT a project dependency (see the docblock in
 * ../contrast-audit.ts) — it's a ~300MB install with browser binaries that
 * most contributors will never need. It IS installed globally in this
 * environment (`NODE_PATH=/usr/local/lib/node_modules`), so it resolves fine
 * at runtime under `tsx`. But `tsc --noEmit` runs without that NODE_PATH (see
 * the project gates), so without a shim it can't find the module's real
 * types and the "does this repo still typecheck" gate would fail on a
 * dependency we intentionally didn't add.
 *
 * This declares only the slice of the API contrast-audit.ts actually calls.
 * If the script starts using more of Playwright's surface, extend this file
 * rather than reaching for `any`.
 */
declare module "playwright" {
  export interface ViewportSize {
    width: number;
    height: number;
  }

  export interface BrowserContextOptions {
    viewport?: ViewportSize | null;
    colorScheme?: "light" | "dark" | "no-preference";
    storageState?: string;
    // Added for the layout audit's entry script (Task 7) — phone widths
    // (<=430) run as a real mobile/touch device at 2x; see viewportFor() in
    // layout-audit/config.ts.
    isMobile?: boolean;
    hasTouch?: boolean;
    deviceScaleFactor?: number;
  }

  // Added for the layout audit's entry script (Task 7) — the auth
  // bootstrap saves a fresh storageState file after signing in.
  export interface StorageStateOptions {
    path?: string;
  }

  export interface GotoOptions {
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
    timeout?: number;
  }

  export interface WaitForSelectorOptions {
    timeout?: number;
    state?: "attached" | "detached" | "visible" | "hidden";
  }

  export interface GetByTextOptions {
    exact?: boolean;
  }

  export interface GetByRoleOptions {
    name?: string | RegExp;
    exact?: boolean;
  }

  export interface ClickOptions {
    timeout?: number;
  }

  export interface FillOptions {
    timeout?: number;
  }

  export interface WaitForUrlOptions {
    timeout?: number;
  }

  export interface ScreenshotOptions {
    path?: string;
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    animations?: "disabled" | "allow";
    type?: "png" | "jpeg";
    quality?: number;
  }

  export interface EmulateMediaOptions {
    media?: "screen" | "print" | null;
    colorScheme?: "light" | "dark" | null;
  }

  // Added for overlays.ts (Task 6) — openOverlay's `{ press: string }` step
  // (e.g. "Escape" to close an overlay after a screenshot in Task 7).
  export interface Keyboard {
    press(key: string, options?: { delay?: number }): Promise<void>;
  }

  export interface LocatorFilterOptions {
    hasText?: string | RegExp;
  }

  export interface LocatorWaitForOptions {
    state?: "attached" | "detached" | "visible" | "hidden";
    timeout?: number;
  }

  export interface Locator {
    count(): Promise<number>;
    first(): Locator;
    click(options?: ClickOptions): Promise<void>;
    // Added for trips.ts's ensureEmptyTrip (Task 5) — fills the /trips/new
    // name field via the app's own form, never the database directly.
    fill(value: string, options?: FillOptions): Promise<void>;
    // Added for overlays.ts (Task 6) — openOverlay narrows a role match down
    // to the one carrying particular body text when a recipe's `expect` sets
    // `hasText` (e.g. the notifications menu, whose accessible name doesn't
    // include "Notifications" but whose visible content does).
    filter(options?: LocatorFilterOptions): Locator;
    // Added for overlays.ts (Task 6) — focusFirstInput's "no-op if none"
    // guard, and a defensive check openOverlay could add later.
    isVisible(): Promise<boolean>;
    // Added for overlays.ts (Task 6) — openOverlay's "wait up to 5s for the
    // overlay to become visible" step; failing that wait (not throwing) is
    // how a recipe reports "overlay did not open" as a gap.
    waitFor(options?: LocatorWaitForOptions): Promise<void>;
    // Added for overlays.ts (Task 6) — deriveStop reads the stop name off
    // the drag handle's `aria-label="Reorder <name>"`.
    getAttribute(name: string): Promise<string | null>;
    // Added for overlays.ts (Task 6) — focusFirstInput scopes its search for
    // an input/textarea to inside the just-opened overlay.
    locator(selector: string): Locator;
    // Added for overlays.ts (Task 6) — focusFirstInput focuses the first
    // visible field inside the open overlay (never types into it).
    focus(): Promise<void>;
  }

  // Added for crops.ts (Task 8) — setContent renders a synthetic one-<img>
  // page (the original PNG as a data URI) so a crop can be captured via a
  // plain viewport screenshot rather than an image-decoding library.
  export interface SetContentOptions {
    timeout?: number;
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  }

  export interface Page {
    goto(url: string, options?: GotoOptions): Promise<unknown>;
    url(): string;
    close(): Promise<void>;
    setContent(html: string, options?: SetContentOptions): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    waitForSelector(
      selector: string,
      options?: WaitForSelectorOptions,
    ): Promise<unknown>;
    waitForURL(
      url: string | RegExp,
      options?: WaitForUrlOptions,
    ): Promise<void>;
    locator(selector: string): Locator;
    getByText(text: string, options?: GetByTextOptions): Locator;
    // Added for trips.ts's ensureEmptyTrip (Task 5) — locates the /trips/new
    // form's "Create trip" submit button by its accessible role/name.
    getByRole(role: string, options?: GetByRoleOptions): Locator;
    // Overloads for the evaluate() shapes contrast-audit.ts uses: a zero-arg
    // page function, one that takes a single serialisable arg, and a plain
    // source-string expression (used for the contrast probe itself — see
    // the "why a string, not a function" note above PROBE_SCRIPT).
    evaluate<R>(pageFunction: () => R | Promise<R>): Promise<R>;
    evaluate<R, Arg>(
      pageFunction: (arg: Arg) => R | Promise<R>,
      arg: Arg,
    ): Promise<R>;
    evaluate<R>(pageFunction: string): Promise<R>;
    // Added for capture.ts's sliced full-page screenshots (Task 4).
    screenshot(options?: ScreenshotOptions): Promise<Buffer>;
    setViewportSize(size: ViewportSize): Promise<void>;
    emulateMedia(options: EmulateMediaOptions): Promise<void>;
    // Added for overlays.ts (Task 6) — the `{ press: string }` recipe step
    // and Task 7's post-screenshot Escape.
    keyboard: Keyboard;
  }

  export interface BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    // Added for the layout audit's entry script (Task 7): with `path`, writes
    // the context's cookies + localStorage to that file so later contexts
    // can start from it (`storageState: path`). The returned object itself
    // is unused here, so it stays `unknown` rather than a guessed shape.
    storageState(options?: StorageStateOptions): Promise<unknown>;
  }

  export interface Browser {
    newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
    close(): Promise<void>;
  }

  export interface BrowserType {
    launch(options?: { headless?: boolean }): Promise<Browser>;
  }

  export const chromium: BrowserType;
}
