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

  export interface ClickOptions {
    timeout?: number;
  }

  export interface WaitForUrlOptions {
    timeout?: number;
  }

  export interface Locator {
    count(): Promise<number>;
    first(): Locator;
    click(options?: ClickOptions): Promise<void>;
  }

  export interface Page {
    goto(url: string, options?: GotoOptions): Promise<unknown>;
    url(): string;
    close(): Promise<void>;
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
  }

  export interface BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
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
