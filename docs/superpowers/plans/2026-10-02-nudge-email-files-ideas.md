# Install nudge, approval email, Files index, tap-to-open ideas, Traveller details, sticky share column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six independent improvements on one branch: a phone-only install nudge (A), an email when an Access request is approved (B), Files as a navigable index with titles and Item links (C), tap-to-open ideas in the plan editor (D), Traveller details on Account/Settings with a Contact details share dial (E), and a sticky left column on the desktop share page (F).

**Architecture:** Each part adds a small pure module plus a thin UI, following the repo's split of pure `lib/` modules (tested without React or the db) from `server/actions/*` (every value export an async function, allowlisted by `lib/server-action-exports.test.ts`) and client components. Two migrations: `Attachment.title`, and `TravellerDetails` + `TripMember.travelNumber` + `ShareLink.includeContacts`. The share page's never-shared floor stays structural: new fields are selected only when their dial is on.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching a route), React 19, Tailwind v4, Prisma (Postgres; migrations are hand-written SQL under `prisma/migrations/<timestamp>_<name>/migration.sql`), Auth.js, Resend via `fetch`, Vitest + Testing Library (jsdom), zod. No new dependency.

**Spec:** `docs/specs/2026-10-02-install-nudge-approval-email-files-ideas.md` — read it first; the plan argues from it. Glossary: `CONTEXT.md` **Install nudge**, **Traveller details**, **Attachment**, **Access request**, **Item**, **Share link**, **Device**.

## Global Constraints

- Branch `feat/nudge-email-files-ideas-2026-10-02`, created from `main` in place (no worktree). Never commit to `main`; never push; never deploy; never run `npm run feedback:pull` / `feedback:resolve` / `feedback:accept` (they open production). `docs/feedback/inbox.md` is already refreshed and uncommitted on `main`; it goes into the branch's first commit.
- Every task ends green for the files it touched: `TZ=UTC npx vitest run <paths>`, then `npx tsc --noEmit` and `npm run lint` (zero errors; six pre-existing warnings in untouched test files are not this branch's). The full `npm test` and `npm run build` run once, in Task 17. Known flake: `lib/help-guide.test.ts` drift guard can time out at 5s under the parallel suite and passes alone.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Task 9's commit also carries `Resolves-Feedback: cmupci300000004jp5c54md6u`; Task 11's carries `Resolves-Feedback: cmup8xolg000004jtqvc2lfu7`. No other trailers; nothing is resolved on the branch.
- `server/actions/*.ts` are `"use server"` modules: every value export must be an async function, and every new one is added to `ALLOWLIST` in `lib/server-action-exports.test.ts` (alphabetical within its file's array). Pure helpers and types live in `lib/`.
- Migrations: additive only, nullable columns or defaulted booleans, so the still-running old build cannot violate them during the migrate-then-build window (the pattern in `prisma/migrations/20261001100000_user_welcome_seen_at/migration.sql`). `prisma generate` after a schema change (`npx prisma generate`); never `prisma migrate dev` against anything but the local docker db.
- The share page's never-shared floor (ADR 0051): `bankDetails`, `emergencyName`, `emergencyPhone`, `email` are never selected by any share query; `mobile` and `travelNumber` only when both `showTravellers` and `includeContacts` are on. The page test's `FORBIDDEN` list grows by the three new names.
- Copy, exact (spec §A–§E): nudge title `Put Teepee on your Home Screen`; nudge line `It opens like an app, keeps your trips with you offline, and on iPhone it's the only way the Digest can reach you.`; Android buttons `Install` / `Not now`; iPhone steps `Tap Share, then "Add to Home Screen", then open Teepee from there.` and button `Got it`; Help section title `Put Teepee on your Home Screen`, blurb `Install it from your phone's browser — and why an iPhone needs this for the Digest.`; email subject `You're in: sign in to Teepee`, line `Your request to use Teepee was approved. Sign in with Google, or ask for a sign-in link, using this address: {email}`, button `Sign in`, footer `If you didn't ask for access to Teepee, you can ignore this email.`; admin notices `Approved and emailed {email}.` / `Approved. Couldn't email them, so tell them yourself.`; Files group label `Things to do` (never `Activities`); `(removed)` for a missing owner; Settings line `The number you'll have on this trip — an eSIM or local SIM.`; Account helper lines in Task 13; dial label `Contact details`, helper `Each Traveller's phone numbers under their name — only with "Show who's going" on.`; share hero labels `Mobile` and `Travel number`.
- Terminology: Admin, Traveller, Access request, Attachment, Item / thing to do (never "activity"), Share link, Digest, Device, Install nudge, Traveller details. Never "notification", "banner", "PWA" in user-facing copy.
- No pushes change. `lib/admin-notify.ts` changes only its doc comment (Task 17).
- `next dev`/`next build` may rewrite a block in `CLAUDE.md`; never stage it.

## Review Focus

Spec-implied inputs no task's tests would otherwise exercise, most likely to bite first; each has its pinning test in the owning task.

1. **An Android phone where Chrome never fires `beforeinstallprompt`** (already installed, or an unsupported browser): no card, no dead `Install` button — Task 2 pins "not iOS and no prompt → nothing".
2. **A `localStorage` that throws** (private mode, storage disabled): the nudge must still render and `Got it` must still hide it for the session — Task 2 pins both reads and writes wrapped.
3. **Approve when Resend is configured but the API fails**: the person is approved anyway, nothing is rolled back, the admin is told — Task 5 pins `mailed: false` with the row written and `resolvedAt` stamped.
4. **A file whose owner was deleted** (an Item removed after upload): the Files page must still render the row, reading `(removed)` with no link — Task 7 pins it.
5. **Linking a file to an Item on another Trip** by id (a crafted request): refused, nothing updated — Task 8 pins it. And a Share link with `includeContacts` on but `showTravellers` off selects nothing extra — Task 15 pins it.

---

## Part A — Install nudge

### Task 1: Capture the install prompt at app load

**Files:**
- Create: `lib/install-prompt.ts`
- Create: `lib/install-prompt.test.ts`
- Modify: `components/pwa-register.tsx`
- Create: `components/pwa-register.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 2 reads these):
  ```ts
  export interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }> }
  export function captureInstallPrompt(e: Event): void       // preventDefault + stash + notify
  export function clearInstallPrompt(): void
  export function getInstallPrompt(): InstallPromptEvent | null
  export function subscribeInstallPrompt(listener: () => void): () => void
  export function listenForInstallPrompt(target?: Window): () => void   // registers beforeinstallprompt + appinstalled; returns teardown
  ```

- [ ] **Step 1: Branch and carry the inbox**

```bash
git checkout -b feat/nudge-email-files-ideas-2026-10-02
git add docs/feedback/inbox.md
git commit -m "chore: refresh feedback inbox (3 open after accepting the Plan editor note)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git status --short   # expect nothing
```

- [ ] **Step 2: Write the failing tests**

`lib/install-prompt.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureInstallPrompt,
  clearInstallPrompt,
  getInstallPrompt,
  listenForInstallPrompt,
  subscribeInstallPrompt,
} from "./install-prompt";

function fakePrompt(): Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted"; platform: string }> } {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted"; platform: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
  return e;
}

beforeEach(() => clearInstallPrompt());

describe("install prompt capture", () => {
  it("starts empty", () => {
    expect(getInstallPrompt()).toBeNull();
  });

  it("captures the event, prevents the browser's own mini-infobar, and notifies subscribers", () => {
    const listener = vi.fn();
    const off = subscribeInstallPrompt(listener);
    const e = fakePrompt();
    captureInstallPrompt(e);
    expect(e.defaultPrevented).toBe(true);
    expect(getInstallPrompt()).toBe(e);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    clearInstallPrompt();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears and notifies", () => {
    const listener = vi.fn();
    subscribeInstallPrompt(listener);
    captureInstallPrompt(fakePrompt());
    clearInstallPrompt();
    expect(getInstallPrompt()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("listenForInstallPrompt wires beforeinstallprompt and appinstalled on the target, and tears down", () => {
    const target = new EventTarget() as unknown as Window;
    const off = listenForInstallPrompt(target);
    const e = fakePrompt();
    target.dispatchEvent(e);
    expect(getInstallPrompt()).toBe(e);
    target.dispatchEvent(new Event("appinstalled"));
    expect(getInstallPrompt()).toBeNull();
    off();
    target.dispatchEvent(fakePrompt());
    expect(getInstallPrompt()).toBeNull();
  });
});
```

`components/pwa-register.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PwaRegister } from "./pwa-register";
import { clearInstallPrompt, getInstallPrompt } from "@/lib/install-prompt";

afterEach(() => clearInstallPrompt());

describe("PwaRegister", () => {
  it("captures a beforeinstallprompt fired after mount, in any environment", () => {
    render(<PwaRegister />);
    const e = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(e);
    expect(getInstallPrompt()).toBe(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("stops listening on unmount", () => {
    const { unmount } = render(<PwaRegister />);
    unmount();
    window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
    expect(getInstallPrompt()).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `TZ=UTC npx vitest run lib/install-prompt.test.ts components/pwa-register.test.tsx`
Expected: FAIL — `Failed to resolve import "./install-prompt"` / `"@/lib/install-prompt"`.

- [ ] **Step 4: Write the module**

`lib/install-prompt.ts`:

```ts
/**
 * The browser's install prompt, captured once at app load so the Install
 * nudge (CONTEXT.md; components/trips/install-nudge.tsx) can offer the
 * real install later. Chrome on Android (and desktop) fires
 * `beforeinstallprompt` early and exactly once per page load; if nothing
 * is listening by then, the only install path left is the browser menu.
 * Pure module, no React: the nudge subscribes through useSyncExternalStore.
 * iOS never fires this event — the nudge handles iPhone separately.
 */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Listener = () => void;

let captured: InstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function captureInstallPrompt(e: Event): void {
  e.preventDefault();
  captured = e as InstallPromptEvent;
  notify();
}

export function clearInstallPrompt(): void {
  captured = null;
  notify();
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return captured;
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Register on `target` (the window); returns the teardown. */
export function listenForInstallPrompt(target: Window = window): () => void {
  const onPrompt = (e: Event) => captureInstallPrompt(e);
  const onInstalled = () => clearInstallPrompt();
  target.addEventListener("beforeinstallprompt", onPrompt);
  target.addEventListener("appinstalled", onInstalled);
  return () => {
    target.removeEventListener("beforeinstallprompt", onPrompt);
    target.removeEventListener("appinstalled", onInstalled);
  };
}
```

- [ ] **Step 5: Register it in PwaRegister**

`components/pwa-register.tsx` — add the import and a second effect. The service-worker effect stays production-only; the install listener runs everywhere (harmless in dev, and it is what lets the nudge be tested against a dev server):

```tsx
"use client";

import { useEffect } from "react";
import { listenForInstallPrompt } from "@/lib/install-prompt";

/**
 * Registers the TEEPEE service worker in production.
 *
 * - Only runs in production (NODE_ENV === 'production') to avoid breaking
 *   Next.js HMR in development.
 * - Fails silently so a SW registration issue never crashes the app.
 * - Renders nothing — mount-only side effect.
 *
 * Also captures the browser's install prompt (lib/install-prompt.ts) in
 * every environment: it fires once, early, and the Install nudge needs it
 * later.
 */
export function PwaRegister() {
  useEffect(() => listenForInstallPrompt(), []);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Fail silently — a missing or broken SW must never break the app.
    });
    // Ask the browser to protect our cache from storage-pressure eviction —
    // an installed PWA is generally granted this. Best-effort, fire-and-forget.
    navigator.storage?.persist?.().catch(() => {
      /* Fail silently */
    });
  }, []);

  return null;
}
```

- [ ] **Step 6: Run the tests and gates**

Run: `TZ=UTC npx vitest run lib/install-prompt.test.ts components/pwa-register.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/install-prompt.ts lib/install-prompt.test.ts components/pwa-register.tsx components/pwa-register.test.tsx
git commit -m "feat(install): capture the browser's install prompt at app load

Spec 2026-10-02 §A: a pure store for beforeinstallprompt, wired from
PwaRegister in every environment, so the Install nudge can offer the real
install later.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The Install nudge card on Trips

**Files:**
- Create: `components/trips/install-nudge.tsx`
- Create: `components/trips/install-nudge.test.tsx`
- Modify: `app/(app)/trips/page.tsx` (after `<WelcomeGate />`, line ~40)

**Interfaces:**
- Consumes: `isStandalone()` (`lib/standalone.ts`); `isIosWithoutInstall()` (`components/account/device-state.ts`); `getInstallPrompt`, `subscribeInstallPrompt`, `clearInstallPrompt`, `captureInstallPrompt` (Task 1); `Button` (`components/ui/button.tsx`, variants `primary` / `outline`, size `md`).
- Produces: `export function InstallNudge({ className }: { className?: string })`; `export const INSTALL_NUDGE_KEY = "teepee:install-nudge"`.

- [ ] **Step 1: Write the failing tests**

`components/trips/install-nudge.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const isStandaloneMock = vi.hoisted(() => vi.fn(() => false));
const isIosWithoutInstallMock = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/standalone", () => ({ isStandalone: isStandaloneMock }));
vi.mock("@/components/account/device-state", () => ({ isIosWithoutInstall: isIosWithoutInstallMock }));

import { InstallNudge, INSTALL_NUDGE_KEY } from "./install-nudge";
import { captureInstallPrompt, clearInstallPrompt } from "@/lib/install-prompt";

function fakePrompt(outcome: "accepted" | "dismissed") {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome, platform: "web" });
  return e;
}

beforeEach(() => {
  localStorage.clear();
  clearInstallPrompt();
  isStandaloneMock.mockReturnValue(false);
  isIosWithoutInstallMock.mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

describe("InstallNudge", () => {
  it("renders nothing on the server pass and nothing when neither iOS nor a prompt applies (Review Focus 1)", async () => {
    const { container } = render(<InstallNudge />);
    await waitFor(() => expect(container.querySelector("[data-testid='install-nudge']")).toBeNull());
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("iPhone in Safari: the steps and Got it, which hides it now and on the next render", async () => {
    isIosWithoutInstallMock.mockReturnValue(true);
    const { unmount } = render(<InstallNudge />);
    expect(await screen.findByRole("heading", { name: "Put Teepee on your Home Screen" })).toBeInTheDocument();
    expect(screen.getByText('Tap Share, then "Add to Home Screen", then open Teepee from there.')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByTestId("install-nudge")).toBeNull();
    expect(localStorage.getItem(INSTALL_NUDGE_KEY)).toBe("dismissed");
    unmount();
    render(<InstallNudge />);
    await waitFor(() => expect(screen.queryByTestId("install-nudge")).toBeNull());
  });

  it("Android with a captured prompt: Install fires the prompt; accepted removes the card", async () => {
    const e = fakePrompt("accepted");
    act(() => captureInstallPrompt(e));
    render(<InstallNudge />);
    const install = await screen.findByRole("button", { name: "Install" });
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    await userEvent.click(install);
    expect(e.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("install-nudge")).toBeNull());
  });

  it("Android: a dismissed prompt keeps the card; Not now dismisses it", async () => {
    act(() => captureInstallPrompt(fakePrompt("dismissed")));
    render(<InstallNudge />);
    await userEvent.click(await screen.findByRole("button", { name: "Install" }));
    expect(screen.getByTestId("install-nudge")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("install-nudge")).toBeNull();
  });

  it("installed (standalone): nothing, even on iOS", async () => {
    isStandaloneMock.mockReturnValue(true);
    isIosWithoutInstallMock.mockReturnValue(true);
    render(<InstallNudge />);
    await waitFor(() => expect(screen.queryByTestId("install-nudge")).toBeNull());
  });

  it("is phone-only by class and survives a throwing localStorage (Review Focus 2)", async () => {
    isIosWithoutInstallMock.mockReturnValue(true);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<InstallNudge />);
    const card = await screen.findByTestId("install-nudge");
    expect(card.className.split(/\s+/)).toContain("md:hidden");
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByTestId("install-nudge")).toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run components/trips/install-nudge.test.tsx`
Expected: FAIL — `Failed to resolve import "./install-nudge"`.

- [ ] **Step 3: Write the card**

`components/trips/install-nudge.tsx`:

```tsx
"use client";

import * as React from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStandalone } from "@/lib/standalone";
import { isIosWithoutInstall } from "@/components/account/device-state";
import { clearInstallPrompt, getInstallPrompt, subscribeInstallPrompt } from "@/lib/install-prompt";
import { cn } from "@/lib/cn";

export const INSTALL_NUDGE_KEY = "teepee:install-nudge";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_NUDGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(INSTALL_NUDGE_KEY, "dismissed");
  } catch {
    // Storage unavailable: the card simply shows again next time.
  }
}

function useInstallPrompt() {
  return React.useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);
}

/**
 * The Install nudge (CONTEXT.md; spec 2026-10-02 §A): phones only, in a
 * browser tab rather than the installed app. Android gets the real install
 * (the prompt captured in lib/install-prompt.ts); iPhone gets the Share →
 * Add to Home Screen steps, since iOS has no install API. Dismissal is per
 * browser, in localStorage, because this is about this browser — unlike
 * What's new (ADR 0056), which is about the person. The three client-only
 * facts are read after mount so the server pass renders nothing and the
 * installed app never flashes a card it does not need.
 */
export function InstallNudge({ className }: { className?: string }) {
  const prompt = useInstallPrompt();
  const [facts, setFacts] = React.useState<{ ios: boolean; standalone: boolean; dismissed: boolean } | null>(null);

  React.useEffect(() => {
    setFacts({ ios: isIosWithoutInstall(), standalone: isStandalone(), dismissed: readDismissed() });
  }, []);

  if (!facts || facts.standalone || facts.dismissed) return null;
  const android = prompt !== null;
  if (!facts.ios && !android) return null;

  function dismiss() {
    writeDismissed();
    setFacts((f) => (f ? { ...f, dismissed: true } : f));
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      clearInstallPrompt();
      dismiss();
    }
  }

  return (
    <section
      aria-labelledby="install-nudge-title"
      data-testid="install-nudge"
      className={cn("rounded-2xl border-2 border-border bg-card p-4 shadow-hard-2 md:hidden", className)}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border-2 border-border bg-sun">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="install-nudge-title" className="font-display text-base font-extrabold tracking-[-0.02em]">
            Put Teepee on your Home Screen
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            It opens like an app, keeps your trips with you offline, and on iPhone it&apos;s the only way the Digest can reach you.
          </p>
          {android ? (
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="primary" size="md" onClick={install}>
                Install
              </Button>
              <Button type="button" variant="outline" size="md" onClick={dismiss}>
                Not now
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm font-semibold">Tap Share, then &quot;Add to Home Screen&quot;, then open Teepee from there.</p>
              <Button type="button" variant="outline" size="md" className="mt-3" onClick={dismiss}>
                Got it
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Mount it on Trips**

`app/(app)/trips/page.tsx` — add `import { InstallNudge } from "@/components/trips/install-nudge";` and, directly after `<WelcomeGate />`:

```tsx
        <InstallNudge className="mr-[18px] md:mr-10" />
```

(The same right margin the What's new banner uses, so it sits in the same column.)

- [ ] **Step 5: Run the tests and gates**

Run: `TZ=UTC npx vitest run components/trips/install-nudge.test.tsx "app/(app)/trips/page.test.tsx" && npx tsc --noEmit && npm run lint`
Expected: PASS. If the Trips page test needs a mock for `@/components/trips/install-nudge` (it renders a client component that reads `window`), add `vi.mock("@/components/trips/install-nudge", () => ({ InstallNudge: () => null }));` beside its other component mocks.

- [ ] **Step 6: Commit**

```bash
git add components/trips/install-nudge.tsx components/trips/install-nudge.test.tsx "app/(app)/trips/page.tsx" "app/(app)/trips/page.test.tsx"
git commit -m "feat(install): the Install nudge on Trips, phones only

Android offers the captured install prompt; iPhone gets the Share → Add
to Home Screen steps; dismissal is remembered per browser. Spec
2026-10-02 §A.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Help guide section — Put Teepee on your Home Screen

**Files:**
- Modify: `lib/help-guide.ts` (append to `HELP_SECTIONS` after the `links` entry — the last `advanced` entry)
- Modify: `components/trip/help-guide.tsx` (the lucide import at line ~3-30; `ICONS` map; a new `<Section>` after the `links` section at line ~1660)
- Test: `lib/help-guide.test.ts`, `components/trip/help-guide.test.tsx`

**Interfaces:** none produced. Ruling (controller): the spec places the section "directly after the Digest/Devices section"; that section (`account`) is in the `everyday` group and groups must stay contiguous (`lib/help-guide.test.ts` "orders groups"), so the section goes **last in `advanced`**, after `links`.

- [ ] **Step 1: Write the failing tests**

`lib/help-guide.test.ts` — inside `describe("HELP_SECTIONS", ...)` add:

```ts
  it("ends the advanced group with the Home Screen install section (spec 2026-10-02 §A)", () => {
    const advanced = HELP_SECTIONS.filter((s) => s.group === "advanced");
    const last = advanced[advanced.length - 1];
    expect(last.id).toBe("home-screen");
    expect(last.title).toBe("Put Teepee on your Home Screen");
    expect(last.blurb).toBe("Install it from your phone's browser — and why an iPhone needs this for the Digest.");
  });
```

`components/trip/help-guide.test.tsx` — add (matching how the file renders the guide in its other tests):

```tsx
  it("renders the Home Screen install section with both platforms' steps", () => {
    render(<HelpGuide tripId="t1" />);
    expect(screen.getByText("Put Teepee on your Home Screen")).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home screen/)).toBeInTheDocument();
  });
```

(`render(<HelpGuide tripId="t1" />)` is the file's existing render call.)

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx`
Expected: FAIL — last advanced id is `links`; no "Put Teepee on your Home Screen" text.

- [ ] **Step 3: Add the section data**

`lib/help-guide.ts` — after the `links` entry in `HELP_SECTIONS`:

```ts
  {
    id: "home-screen",
    title: "Put Teepee on your Home Screen",
    blurb: "Install it from your phone's browser — and why an iPhone needs this for the Digest.",
    group: "advanced",
  },
```

- [ ] **Step 4: Add the icon and the body**

`components/trip/help-guide.tsx`: add `Smartphone,` to the `lucide-react` import; add to `ICONS`:

```ts
  "home-screen": { icon: Smartphone, tone: "sun" },
```

After the `links` section's closing `</Section>`, add:

```tsx
          <Section heading={Sub} section={sectionById("home-screen")}>
            <p>
              Teepee is a website that installs like an app. From your Home Screen
              it opens full-screen, keeps the trips you&rsquo;ve saved for offline
              with you, and on an iPhone it is the only way the Digest can reach
              you.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Android</strong>: Chrome offers{" "}
                <strong className="font-semibold">Install</strong> — on the card
                Teepee shows on your trips page, or from the browser menu under{" "}
                <strong className="font-semibold">Add to Home screen</strong>.
              </li>
              <li>
                <strong className="font-semibold">iPhone</strong>: in Safari, tap{" "}
                <strong className="font-semibold">Share</strong>, then{" "}
                <strong className="font-semibold">Add to Home Screen</strong>, then
                open Teepee from there.
              </li>
            </ul>
            <p>
              Dismissed the card on your trips page? These steps are the same,
              whenever you&rsquo;re ready.
            </p>
          </Section>
```

- [ ] **Step 5: Run the tests and gates**

Run: `TZ=UTC npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS (the drift guard may need to run alone if it times out).

- [ ] **Step 6: Commit**

```bash
git add lib/help-guide.ts lib/help-guide.test.ts components/trip/help-guide.tsx components/trip/help-guide.test.tsx
git commit -m "docs(help): Put Teepee on your Home Screen — the install steps for both phones

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Part B — Approval email

### Task 4: `lib/mail.ts` as the one Resend door, and the approval email template

**Files:**
- Create: `lib/mail.ts`, `lib/mail.test.ts`
- Create: `lib/approval-email.ts`, `lib/approval-email.test.ts`
- Modify: `lib/auth.ts:49-67` (the Resend provider's `sendVerificationRequest`)

**Interfaces:**
- Consumes: `escapeHtml`, `renderSignInEmail` (`lib/sign-in-email.ts`).
- Produces (Task 5 reads these):
  ```ts
  // lib/mail.ts
  export interface MailMessage { to: string; subject: string; html: string; text: string }
  export type SendMailResult = { sent: true } | { sent: false; error: string }
  export function mailConfigured(env?: Record<string, string | undefined>): boolean
  export async function sendMail(message: MailMessage, env?: Record<string, string | undefined>): Promise<SendMailResult>  // never throws
  // lib/approval-email.ts
  export function renderApprovalEmail({ email, signInUrl }: { email: string; signInUrl: string }): { subject: string; html: string; text: string }
  ```

- [ ] **Step 1: Write the failing tests**

`lib/mail.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { mailConfigured, sendMail } from "./mail";

const ENV = { AUTH_RESEND_KEY: "re_test", AUTH_RESEND_FROM: "Teepee <signin@teepee.test>" };
const MSG = { to: "friend@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

afterEach(() => vi.restoreAllMocks());

describe("mailConfigured", () => {
  it("needs both vars", () => {
    expect(mailConfigured(ENV)).toBe(true);
    expect(mailConfigured({ AUTH_RESEND_KEY: "re_test" })).toBe(false);
    expect(mailConfigured({ AUTH_RESEND_FROM: "x" })).toBe(false);
    expect(mailConfigured({})).toBe(false);
  });
});

describe("sendMail", () => {
  it("POSTs to Resend with the from/to/subject/html/text and reports sent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(sendMail(MSG, ENV)).resolves.toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer re_test", "Content-Type": "application/json" },
      body: JSON.stringify({ from: ENV.AUTH_RESEND_FROM, to: MSG.to, subject: MSG.subject, html: MSG.html, text: MSG.text }),
    });
  });

  it("reports a non-2xx as not sent, with the status and body, without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(sendMail(MSG, ENV)).resolves.toEqual({ sent: false, error: "Resend error 500: nope" });
  });

  it("reports a rejected fetch as not sent", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(sendMail(MSG, ENV)).resolves.toEqual({ sent: false, error: "offline" });
  });

  it("does not fetch at all when unconfigured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await sendMail(MSG, {});
    expect(result.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

`lib/approval-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderApprovalEmail } from "./approval-email";

describe("renderApprovalEmail", () => {
  const out = renderApprovalEmail({ email: "friend@example.com", signInUrl: "https://teepee.test/" });

  it("has the agreed subject, line, button, raw link and footer", () => {
    expect(out.subject).toBe("You're in: sign in to Teepee");
    expect(out.text).toContain(
      "Your request to use Teepee was approved. Sign in with Google, or ask for a sign-in link, using this address: friend@example.com",
    );
    expect(out.text).toContain("https://teepee.test/");
    expect(out.text).toContain("If you didn't ask for access to Teepee, you can ignore this email.");
    expect(out.html).toContain('href="https://teepee.test/"');
    expect(out.html).toContain(">Sign in<");
    expect(out.html).toContain("friend@example.com");
  });

  it("escapes the address and the url in the html", () => {
    const evil = renderApprovalEmail({ email: "a<b>@example.com", signInUrl: 'https://teepee.test/?x="y"' });
    expect(evil.html).not.toContain("a<b>@example.com");
    expect(evil.html).toContain("a&lt;b&gt;@example.com");
    expect(evil.html).toContain("&quot;y&quot;");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run lib/mail.test.ts lib/approval-email.test.ts`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `lib/mail.ts`**

```ts
/**
 * The one place TEEPEE talks to Resend (spec 2026-10-02 §B). Two senders
 * use it: the Sign-in link (lib/auth.ts, which still throws to Auth.js on
 * a failure) and the approval email (server/actions/access-requests.ts,
 * which must never let mail undo an approval). Never throws; a failure is
 * a value. Configured only when both AUTH_RESEND_KEY and AUTH_RESEND_FROM
 * are set (docs/resendDeploy.md).
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendMailResult = { sent: true } | { sent: false; error: string };

export function mailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.AUTH_RESEND_KEY && env.AUTH_RESEND_FROM);
}

export async function sendMail(
  message: MailMessage,
  env: Record<string, string | undefined> = process.env,
): Promise<SendMailResult> {
  const apiKey = env.AUTH_RESEND_KEY;
  const from = env.AUTH_RESEND_FROM;
  if (!apiKey || !from) {
    return { sent: false, error: "Mail is not configured (AUTH_RESEND_KEY / AUTH_RESEND_FROM)." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: message.to, subject: message.subject, html: message.html, text: message.text }),
    });
    if (!res.ok) return { sent: false, error: `Resend error ${res.status}: ${await res.text()}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Write `lib/approval-email.ts`**

```ts
import { escapeHtml } from "@/lib/sign-in-email";

/**
 * The approval email (spec 2026-10-02 §B; CONTEXT.md "Access request"):
 * sent once, by lib/mail.ts, after an Admin approves. Same table-free,
 * image-free shape as the Sign-in email. The button goes to the Landing —
 * never a minted link: the Sign-in link is Auth.js's to mint, and the
 * Google path is the common one anyway.
 */
export function renderApprovalEmail({ email, signInUrl }: { email: string; signInUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "You're in: sign in to Teepee";
  const line = `Your request to use Teepee was approved. Sign in with Google, or ask for a sign-in link, using this address: ${email}`;
  const footer = "If you didn't ask for access to Teepee, you can ignore this email.";
  const href = escapeHtml(signInUrl);
  const text = [line, "", signInUrl, "", footer].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#FFFBF3;color:#211F1B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="margin:0 0 16px;font-size:22px;font-weight:800;">Teepee</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">${escapeHtml(line)}</p>
      <p style="margin:0 0 24px;">
        <a href="${href}" style="display:inline-block;padding:14px 22px;border:2px solid #211F1B;border-radius:12px;background:#211F1B;color:#FFFBF3;font-size:16px;font-weight:700;text-decoration:none;">Sign in</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5c5852;">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:#211F1B;">${href}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#5c5852;">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;
  return { subject, html, text };
}
```

- [ ] **Step 5: Route the Sign-in link through `sendMail`**

`lib/auth.ts` — add `import { sendMail } from "@/lib/mail";` and replace the provider's `sendVerificationRequest` (lines ~56-64) with:

```ts
      async sendVerificationRequest({ identifier, url }) {
        const result = await sendMail({ to: identifier, ...renderSignInEmail({ url }) });
        // Auth.js reports a failed send only if this throws.
        if (!result.sent) throw new Error(result.error);
      },
```

Update the comment above the provider (line ~49-50): "sendVerificationRequest is ours so the mail says "Teepee", not the host; it sends through lib/mail.ts, the only place this app talks to Resend."

- [ ] **Step 6: Run the tests and gates**

Run: `TZ=UTC npx vitest run lib/mail.test.ts lib/approval-email.test.ts lib/auth.test.ts lib/sign-in-email.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (if `lib/sign-in-email.test.ts` does not exist, drop it).

- [ ] **Step 7: Commit**

```bash
git add lib/mail.ts lib/mail.test.ts lib/approval-email.ts lib/approval-email.test.ts lib/auth.ts
git commit -m "feat(mail): lib/mail.ts as the one Resend door; the approval email template

The Sign-in link now sends through sendMail and still throws to Auth.js on
failure. Spec 2026-10-02 §B.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Approve sends the email; the panel says whether it went

**Files:**
- Modify: `server/actions/access-requests.ts` (`approveAccessRequest`, ~lines 95-135)
- Modify: `app/(app)/admin/access-requests.tsx` (`handleApprove`, the message block)
- Test: `server/actions/access-requests.test.ts`, `app/(app)/admin/access-requests.test.tsx`

**Interfaces:**
- Consumes: `mailConfigured`, `sendMail` (Task 4); `renderApprovalEmail` (Task 4); `siteUrl()` (`lib/site-url.ts`); `ok(data)` (`lib/action-result.ts`).
- Produces: `approveAccessRequest(id): Promise<ActionResult<{ mailed: boolean }>>`.

- [ ] **Step 1: Write the failing action tests**

In `server/actions/access-requests.test.ts`: add to the hoisted mocks `mailConfiguredMock: vi.fn(() => false), sendMailMock: vi.fn()`, and the module mocks:

```ts
vi.mock("@/lib/mail", () => ({ mailConfigured: mailConfiguredMock, sendMail: sendMailMock }));
vi.mock("@/lib/site-url", () => ({ siteUrl: () => "https://teepee.test" }));
```

(Destructure the two new mocks from the hoisted object.) Change the first approve test's result expectation from `{ success: true }` to `{ success: true, mailed: false }` (unconfigured by default). Reset `mailConfiguredMock.mockReturnValue(false); sendMailMock.mockReset();` in the file's `afterEach`. Then add inside `describe("approveAccessRequest", ...)`:

```ts
  it("emails the approved address after the allowlist row and resolvedAt are written, when mail is configured", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    allowedEmailCreateMock.mockResolvedValue({});
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(true);
    sendMailMock.mockResolvedValue({ sent: true });

    const result = await approveAccessRequest("ar1");

    expect(result).toEqual({ success: true, mailed: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.to).toBe("friend@example.com");
    expect(msg.subject).toBe("You're in: sign in to Teepee");
    expect(msg.text).toContain("https://teepee.test/");
    // Order: the grant and the resolve happen before the send.
    expect(allowedEmailCreateMock.mock.invocationCallOrder[0]).toBeLessThan(sendMailMock.mock.invocationCallOrder[0]);
    expect(accessRequestUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(sendMailMock.mock.invocationCallOrder[0]);
  });

  // Review Focus 3: mail can never undo an approval.
  it("still approves, and reports mailed: false, when the send fails", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    allowedEmailCreateMock.mockResolvedValue({});
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(true);
    sendMailMock.mockResolvedValue({ sent: false, error: "Resend error 500: nope" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await approveAccessRequest("ar1");

    expect(result).toEqual({ success: true, mailed: false });
    expect(allowedEmailCreateMock).toHaveBeenCalledTimes(1);
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { resolvedAt: expect.any(Date) } }));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("sends nothing when mail is not configured", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    allowedEmailCreateMock.mockResolvedValue({});
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(false);
    await expect(approveAccessRequest("ar1")).resolves.toEqual({ success: true, mailed: false });
    expect(sendMailMock).not.toHaveBeenCalled();
  });
```

And inside `describe("dismissAccessRequest", ...)`:

```ts
  it("never emails", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(true);
    await dismissAccessRequest("ar1");
    expect(sendMailMock).not.toHaveBeenCalled();
  });
```

(Use the file's existing fixture shapes for `findUnique` rows if they differ from the inline objects above — match what the neighbouring approve tests pass.)

- [ ] **Step 2: Write the failing panel tests**

In `app/(app)/admin/access-requests.test.tsx`, change the Approve test's mock to resolve `{ success: true, mailed: true }` and add:

```tsx
  it("says the email went when approve reports mailed", async () => {
    approveAccessRequest.mockResolvedValue({ success: true, mailed: true });
    render(<AccessRequestsPanel initial={requests} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve Friend Person" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Approved and emailed friend@example.com.");
    expect(screen.queryByText("Friend Person")).toBeNull();
  });

  it("tells the admin to tell them when no email went", async () => {
    approveAccessRequest.mockResolvedValue({ success: true, mailed: false });
    render(<AccessRequestsPanel initial={requests} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve Friend Person" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Approved. Couldn't email them, so tell them yourself.");
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `TZ=UTC npx vitest run server/actions/access-requests.test.ts "app/(app)/admin/access-requests.test.tsx"`
Expected: FAIL — `mailed` missing from the result; no `role="status"` element.

- [ ] **Step 4: Send after the grant**

`server/actions/access-requests.ts` — imports:

```ts
import { mailConfigured, sendMail } from "@/lib/mail";
import { renderApprovalEmail } from "@/lib/approval-email";
import { siteUrl } from "@/lib/site-url";
```

Change the signature to `export async function approveAccessRequest(id: string): Promise<ActionResult<{ mailed: boolean }>>` and replace the tail of the function (from the `await db.accessRequest.update({ ... resolvedAt ... })` through `return ok();`) with:

```ts
  await db.accessRequest.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });

  // The email comes last and can never undo the approval above (spec
  // 2026-10-02 §B): a failed send is reported to the admin, not retried,
  // and never rolled back. Dismiss never emails — silence is what the
  // refusal screen promises (ADR 0057).
  let mailed = false;
  if (mailConfigured()) {
    const result = await sendMail({ to: email, ...renderApprovalEmail({ email, signInUrl: `${siteUrl()}/` }) });
    mailed = result.sent;
    if (!result.sent) console.error("[access-requests] approval email failed:", result.error);
  }

  revalidatePath("/admin");
  return ok({ mailed });
```

Update the function's doc comment with one sentence: "Emails the address after the grant when mail is configured; the result's `mailed` says whether it went."

- [ ] **Step 5: The panel notice**

`app/(app)/admin/access-requests.tsx` — add `const [notice, setNotice] = React.useState<string | null>(null);` beside `message`; in `handleApprove`, on success:

```ts
    if (result.success) {
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      setNotice(
        result.mailed
          ? `Approved and emailed ${request.email}.`
          : "Approved. Couldn't email them, so tell them yourself.",
      );
    } else {
```

Clear it at the start of both handlers (`setNotice(null);` next to `setMessage(null);`). Render it above the existing error `message` block:

```tsx
      {notice && (
        <p role="status" className="text-sm font-semibold text-muted-foreground">
          {notice}
        </p>
      )}
```

- [ ] **Step 6: Run the tests and gates**

Run: `TZ=UTC npx vitest run server/actions/access-requests.test.ts "app/(app)/admin" lib/server-action-exports.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (no new action, so the allowlist is unchanged).

- [ ] **Step 7: Commit**

```bash
git add server/actions/access-requests.ts server/actions/access-requests.test.ts "app/(app)/admin/access-requests.tsx" "app/(app)/admin/access-requests.test.tsx"
git commit -m "feat(admin): approving an Access request emails the address

After the allowlist row and resolvedAt, never before; a failed or
unconfigured send reports mailed: false and the panel tells the admin to
tell them. Dismiss never emails. Spec 2026-10-02 §B.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Part C — Files as the Trip's index

### Task 6: `Attachment.title` — migration, view field, and rendering

**Files:**
- Modify: `prisma/schema.prisma` (`model Attachment`, after `filename`)
- Create: `prisma/migrations/20261002120000_attachment_title/migration.sql`
- Modify: `components/trip/attachment-list.tsx` (`AttachmentView`, both row layouts)
- Modify: every `db.attachment.findMany` select whose rows become an `AttachmentView`: `app/(app)/trips/[tripId]/files/page.tsx:56`, `app/(app)/trips/[tripId]/plan/page.tsx:240`, `lib/day-view-loader.ts:238` and `:257`, `lib/travelling-home-loader.ts:173`, `app/(app)/globe/page.tsx:33` — add `title: true` to each select (Journal photo queries render polaroids, not names; leave them).
- Test: `components/trip/attachment-list.test.tsx`

**Interfaces:**
- Produces: `AttachmentView.title?: string | null`; `export function attachmentName(att: Pick<AttachmentView, "filename" | "title">): string` (title when set, else filename) in `components/trip/attachment-list.tsx`.

- [ ] **Step 1: Schema and migration**

`prisma/schema.prisma`, in `model Attachment` directly after `filename     String`:

```prisma
  /// A name the Traveller gave the file (CONTEXT.md "Attachment"); shown in
  /// place of the filename wherever the file is listed. Null = none.
  title        String?
```

`prisma/migrations/20261002120000_attachment_title/migration.sql`:

```sql
-- Attachment title (spec 2026-10-02 §C; CONTEXT.md "Attachment"). Additive
-- and nullable, so the still-running old build — which never writes it —
-- cannot violate anything during the migrate-then-build window.

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "title" TEXT;
```

Run `npx prisma generate`.

- [ ] **Step 2: Write the failing tests**

In `components/trip/attachment-list.test.tsx`, add (using the file's existing fixture helpers for an `AttachmentView` and the same render props its "renders attachment filenames" test uses):

```tsx
  it("shows the title in place of the filename when set, with the filename beneath — both layouts", () => {
    const titled: AttachmentView = { ...sampleAttachments[0], id: "t1", filename: "scan-0012.pdf", title: "Hotel voucher" };
    const { unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[titled]} showUpload={false} />);
    expect(screen.getByText("Hotel voucher")).toBeInTheDocument();
    expect(screen.getByText(/scan-0012\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Hotel voucher" })).toBeInTheDocument();
    unmount();
    render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[titled]} showUpload={false} compact />);
    expect(screen.getByText("Hotel voucher")).toBeInTheDocument();
    expect(screen.getByText("scan-0012.pdf")).toBeInTheDocument();
  });

  it("falls back to the filename when there is no title", () => {
    render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[{ ...sampleAttachments[0], title: null }]} showUpload={false} />);
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
  });
```

(`sampleAttachments` is the file's existing fixture array; its first entry is `boarding-pass.pdf`.)

- [ ] **Step 3: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/trip/attachment-list.test.tsx`
Expected: FAIL — "Hotel voucher" not rendered.

- [ ] **Step 4: Render the title**

`components/trip/attachment-list.tsx`:

```ts
export interface AttachmentView {
  id: string;
  filename: string;
  /** A Traveller-given name (CONTEXT.md "Attachment"); shown in place of the filename when set. */
  title?: string | null;
  mime: string;
  size: number;
  url: string;
  uploadedById: string;
  createdAt: Date;
}

/** The name a file is shown by: its title when set, else its filename. */
export function attachmentName(att: Pick<AttachmentView, "filename" | "title">): string {
  const title = att.title?.trim();
  return title ? title : att.filename;
}
```

Compact row: replace `{att.filename}` in the name `<p>` with `{attachmentName(att)}`, and add directly under it (before the mime badge row):

```tsx
                  {att.title ? (
                    <p className="truncate text-[11px] text-muted-foreground">{att.filename}</p>
                  ) : null}
```

Full row: the name `<p>` becomes `title={attachmentName(att)}` / `{attachmentName(att)}`, and the size line becomes:

```tsx
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                  {att.title ? `${att.filename} · ` : ""}
                  {formatBytes(att.size)}
                  {" · added "}
                  {formatAddedDate(att.createdAt)}
                </p>
```

Every `View ${att.filename}` / `Delete ${att.filename}` label and the delete confirm's `handleDelete(att.id, att.filename)` use `attachmentName(att)` instead.

- [ ] **Step 5: Select the title everywhere a view is built**

Add `title: true,` after `filename: true,` in each of the six selects listed under Files. `tsc` will not force this (the field is optional), so grep afterwards: `grep -rn -A4 'db.attachment.findMany' app lib | grep -c 'title: true'` should print 6.

- [ ] **Step 6: Run the tests and gates**

Run: `TZ=UTC npx vitest run components/trip/attachment-list.test.tsx "app/(app)/trips/[tripId]/files" lib/day-view-loader.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (drop a test path that does not exist).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261002120000_attachment_title components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx "app/(app)/trips/[tripId]/files/page.tsx" "app/(app)/trips/[tripId]/plan/page.tsx" lib/day-view-loader.ts lib/travelling-home-loader.ts "app/(app)/globe/page.tsx"
git commit -m "feat(files): an Attachment may carry a title, shown in place of the filename

Nullable column, selected wherever a file is listed. Spec 2026-10-02 §C.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Every Files row names and links to its owner

**Files:**
- Create: `lib/files-index-loader.ts`, `lib/files-index-loader.test.ts`
- Modify: `components/trip/attachment-list.tsx` (`AttachmentView.owner`, owner line in both layouts)
- Modify: `app/(app)/trips/[tripId]/files/page.tsx` (owner resolution; `TARGET_TYPE_LABELS.ITEM`)
- Test: `app/(app)/trips/[tripId]/files/page.test.tsx`

**Interfaces:**
- Consumes: `tripPath(ref, sub)` (`lib/trip-path.ts`); `serializePlanHash({ open, day })` (`lib/plan/plan-hash.ts`); `TargetType` (`lib/enums.ts`).
- Produces:
  ```ts
  // components/trip/attachment-list.tsx
  export interface FileOwner { label: string; href: string | null }
  // AttachmentView gains: owner?: FileOwner | null
  // lib/files-index-loader.ts
  export interface OwnerRef { targetType: TargetType; targetId: string | null }
  export const REMOVED_OWNER: FileOwner
  export function ownerKey(targetType: TargetType, targetId: string): string
  export async function loadFileOwners(tripId: string, ref: string, refs: OwnerRef[]): Promise<Map<string, FileOwner>>
  ```

- [ ] **Step 1: Write the failing loader test**

`lib/files-index-loader.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const stopFindManyMock = vi.hoisted(() => vi.fn());
const itemFindManyMock = vi.hoisted(() => vi.fn());
const transportFindManyMock = vi.hoisted(() => vi.fn());
const accommodationFindManyMock = vi.hoisted(() => vi.fn());
const journalEntryFindManyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    journalEntry: { findMany: journalEntryFindManyMock },
  },
}));

import { loadFileOwners, ownerKey, REMOVED_OWNER } from "./files-index-loader";

beforeEach(() => {
  for (const m of [stopFindManyMock, itemFindManyMock, transportFindManyMock, accommodationFindManyMock, journalEntryFindManyMock]) {
    m.mockReset().mockResolvedValue([]);
  }
});

describe("loadFileOwners", () => {
  it("names each owner and links to where it lives", async () => {
    stopFindManyMock
      .mockResolvedValueOnce([{ id: "s-rome", name: "Rome" }]) // the STOP owners
      .mockResolvedValueOnce([{ id: "s-rome", name: "Rome" }, { id: "s-flo", name: "Florence" }]); // leg endpoints
    itemFindManyMock.mockResolvedValue([
      { id: "i-sched", title: "Colosseum", date: "2026-12-05", stopId: "s-rome" },
      { id: "i-idea", title: "Gelato", date: null, stopId: "s-rome" },
      { id: "i-wish", title: "Someday", date: null, stopId: null },
    ]);
    transportFindManyMock.mockResolvedValue([{ id: "t1", fromStopId: "s-rome", toStopId: "s-flo" }]);
    accommodationFindManyMock.mockResolvedValue([{ id: "a1", name: "Hotel Roma", stopId: "s-rome" }]);
    journalEntryFindManyMock.mockResolvedValue([{ id: "j1", date: "2026-12-06" }]);

    const owners = await loadFileOwners("trip-1", "europe", [
      { targetType: "STOP", targetId: "s-rome" },
      { targetType: "ITEM", targetId: "i-sched" },
      { targetType: "ITEM", targetId: "i-idea" },
      { targetType: "ITEM", targetId: "i-wish" },
      { targetType: "TRANSPORT", targetId: "t1" },
      { targetType: "ACCOMMODATION", targetId: "a1" },
      { targetType: "JOURNAL", targetId: "j1" },
    ]);

    expect(owners.get(ownerKey("STOP", "s-rome"))).toEqual({ label: "Rome", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("ITEM", "i-sched"))).toEqual({ label: "Colosseum", href: "/trips/europe/day/2026-12-05" });
    expect(owners.get(ownerKey("ITEM", "i-idea"))).toEqual({ label: "Gelato", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("ITEM", "i-wish"))).toEqual({ label: "Someday", href: "/trips/europe/wishlist" });
    expect(owners.get(ownerKey("TRANSPORT", "t1"))).toEqual({ label: "Rome → Florence", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("ACCOMMODATION", "a1"))).toEqual({ label: "Hotel Roma", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("JOURNAL", "j1"))).toEqual({ label: "Journal · 2026-12-06", href: "/trips/europe/journal" });
  });

  it("scopes every lookup to the trip and only to the ids asked for", async () => {
    await loadFileOwners("trip-1", "europe", [{ targetType: "ITEM", targetId: "i1" }]);
    expect(itemFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", id: { in: ["i1"] } } }));
    expect(stopFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", id: { in: [] } } }));
  });

  // Review Focus 4: a deleted owner is absent from the map; the page shows REMOVED_OWNER.
  it("leaves a missing owner out, and REMOVED_OWNER has no link", async () => {
    const owners = await loadFileOwners("trip-1", "europe", [{ targetType: "ITEM", targetId: "gone" }]);
    expect(owners.get(ownerKey("ITEM", "gone"))).toBeUndefined();
    expect(REMOVED_OWNER).toEqual({ label: "(removed)", href: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run lib/files-index-loader.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the loader**

First, in `components/trip/attachment-list.tsx` add (next to `AttachmentView`):

```ts
/** What a file is attached to, as Files shows it: a name, and a link to where it lives (null when the owner is gone). */
export interface FileOwner {
  label: string;
  href: string | null;
}
```

and `owner?: FileOwner | null;` on `AttachmentView`. Then `lib/files-index-loader.ts`:

```ts
import { db } from "@/lib/db";
import { tripPath } from "@/lib/trip-path";
import { serializePlanHash } from "@/lib/plan/plan-hash";
import type { TargetType } from "@/lib/enums";
import type { FileOwner } from "@/components/trip/attachment-list";

export interface OwnerRef {
  targetType: TargetType;
  targetId: string | null;
}

export const REMOVED_OWNER: FileOwner = { label: "(removed)", href: null };

export function ownerKey(targetType: TargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/**
 * Files is the Trip's complete index (CONTEXT.md "Attachment"; spec
 * 2026-10-02 §C): every non-Trip file names its owner and links to where
 * it lives. One query per owner type, scoped to the Trip and to the ids
 * actually present, plus one for Transport endpoints. An owner that no
 * longer exists is simply absent — the page shows REMOVED_OWNER.
 */
export async function loadFileOwners(tripId: string, ref: string, refs: OwnerRef[]): Promise<Map<string, FileOwner>> {
  const idsOf = (type: TargetType) =>
    refs.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId as string);

  const [stops, items, transports, accommodations, journal] = await Promise.all([
    db.stop.findMany({ where: { tripId, id: { in: idsOf("STOP") } }, select: { id: true, name: true } }),
    db.item.findMany({ where: { tripId, id: { in: idsOf("ITEM") } }, select: { id: true, title: true, date: true, stopId: true } }),
    db.transport.findMany({ where: { tripId, id: { in: idsOf("TRANSPORT") } }, select: { id: true, fromStopId: true, toStopId: true } }),
    db.accommodation.findMany({ where: { tripId, id: { in: idsOf("ACCOMMODATION") } }, select: { id: true, name: true, stopId: true } }),
    db.journalEntry.findMany({ where: { tripId, id: { in: idsOf("JOURNAL") } }, select: { id: true, date: true } }),
  ]);

  const legStopIds = transports.flatMap((t) => [t.fromStopId, t.toStopId]).filter((id): id is string => Boolean(id));
  const legStops =
    legStopIds.length > 0
      ? await db.stop.findMany({ where: { tripId, id: { in: legStopIds } }, select: { id: true, name: true } })
      : [];
  const stopName = new Map([...stops, ...legStops].map((s) => [s.id, s.name] as const));

  const planWith = (stopId: string | null | undefined) =>
    stopId ? tripPath(ref, `/plan#${serializePlanHash({ open: [stopId], day: null })}`) : tripPath(ref, "/plan");

  const owners = new Map<string, FileOwner>();
  for (const s of stops) owners.set(ownerKey("STOP", s.id), { label: s.name, href: planWith(s.id) });
  for (const i of items) {
    owners.set(ownerKey("ITEM", i.id), {
      label: i.title,
      href: i.date ? tripPath(ref, `/day/${i.date}`) : i.stopId ? planWith(i.stopId) : tripPath(ref, "/wishlist"),
    });
  }
  for (const t of transports) {
    const from = stopName.get(t.fromStopId ?? "") ?? "?";
    const to = stopName.get(t.toStopId ?? "") ?? "?";
    owners.set(ownerKey("TRANSPORT", t.id), { label: `${from} → ${to}`, href: planWith(t.fromStopId) });
  }
  for (const a of accommodations) owners.set(ownerKey("ACCOMMODATION", a.id), { label: a.name, href: planWith(a.stopId) });
  for (const j of journal) owners.set(ownerKey("JOURNAL", j.id), { label: `Journal · ${j.date}`, href: tripPath(ref, "/journal") });
  return owners;
}
```

- [ ] **Step 4: Run the loader test**

Run: `TZ=UTC npx vitest run lib/files-index-loader.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

In `app/(app)/trips/[tripId]/files/page.test.tsx`: make the `AttachmentList` mock render what it is given, and mock the loader:

```tsx
vi.mock("@/components/trip/attachment-list", () => ({
  AttachmentList: ({ attachments, targetType }: { attachments: Array<{ id: string; filename: string; owner?: { label: string; href: string | null } | null }>; targetType: string }) => (
    <ul data-testid={`list-${targetType}`}>
      {attachments.map((a) => (
        <li key={a.id}>
          {a.filename}
          {a.owner ? (a.owner.href ? <a href={a.owner.href}>{a.owner.label}</a> : <span>{a.owner.label}</span>) : null}
        </li>
      ))}
    </ul>
  ),
}));
const loadFileOwnersMock = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
vi.mock("@/lib/files-index-loader", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/files-index-loader")>();
  return { ...real, loadFileOwners: loadFileOwnersMock };
});
```

Replace the `@/lib/enums` mock's `TARGET_TYPES: []` with the real list (`["TRIP", "STOP", "ITEM", "TRANSPORT", "ACCOMMODATION", "JOURNAL", "MARKER"]`) so grouping runs. Add tests:

```tsx
  it("names each file's owner with a link, labels Items as Things to do, and marks a gone owner (removed)", async () => {
    const { db } = await import("@/lib/db");
    (db.attachment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "f1", filename: "rome.pdf", title: null, mime: "application/pdf", size: 1, url: "/u/1", targetType: "STOP", targetId: "s-rome", uploadedById: "u1", createdAt: new Date() },
      { id: "f2", filename: "ticket.pdf", title: null, mime: "application/pdf", size: 1, url: "/u/2", targetType: "ITEM", targetId: "i-gone", uploadedById: "u1", createdAt: new Date() },
      { id: "f3", filename: "trip.pdf", title: null, mime: "application/pdf", size: 1, url: "/u/3", targetType: "TRIP", targetId: null, uploadedById: "u1", createdAt: new Date() },
    ]);
    loadFileOwnersMock.mockResolvedValue(new Map([["STOP:s-rome", { label: "Rome", href: "/trips/t1/plan#open=s-rome" }]]));
    render(await FilesPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByRole("link", { name: "Rome" }).getAttribute("href")).toBe("/trips/t1/plan#open=s-rome");
    expect(screen.getByText("(removed)")).toBeInTheDocument();
    expect(screen.getByText("Things to do")).toBeInTheDocument();
    expect(screen.queryByText("Activities")).toBeNull();
    expect(loadFileOwnersMock).toHaveBeenCalledWith("t1", "t1", [
      { targetType: "STOP", targetId: "s-rome" },
      { targetType: "ITEM", targetId: "i-gone" },
    ]);
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `TZ=UTC npx vitest run "app/(app)/trips/[tripId]/files/page.test.tsx"`
Expected: FAIL — no owner link; "Activities" present.

- [ ] **Step 7: Wire the page**

`app/(app)/trips/[tripId]/files/page.tsx`: import `{ loadFileOwners, ownerKey, REMOVED_OWNER } from "@/lib/files-index-loader"`; change `TARGET_TYPE_LABELS.ITEM` to `"Things to do"`; after `rows` is fetched and `slug` resolved:

```ts
  const owners = await loadFileOwners(
    tripId,
    slug,
    rows.filter((r) => r.targetType !== "TRIP").map((r) => ({ targetType: r.targetType as TargetType, targetId: r.targetId })),
  );
  const withOwner = (r: (typeof rows)[number]): AttachmentView => ({
    ...r,
    owner: r.targetType === "TRIP" ? null : r.targetId ? (owners.get(ownerKey(r.targetType as TargetType, r.targetId)) ?? REMOVED_OWNER) : REMOVED_OWNER,
  });
```

and use `withOwner(r)` where the page currently spreads `{ ...r }` for both the Trip-level and grouped lists.

- [ ] **Step 8: Render the owner line**

`components/trip/attachment-list.tsx` — add `import Link from "next/link";`. In both layouts, under the name (after the filename-secondary line in compact; after the size line in full):

```tsx
                {att.owner ? (
                  <p className="mt-0.5 truncate text-xs font-semibold">
                    {att.owner.href ? (
                      <Link href={att.owner.href} className="text-foreground underline-offset-2 hover:underline">
                        {att.owner.label}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{att.owner.label}</span>
                    )}
                  </p>
                ) : null}
```

- [ ] **Step 9: Run the tests and gates**

Run: `TZ=UTC npx vitest run "app/(app)/trips/[tripId]/files" components/trip/attachment-list.test.tsx lib/files-index-loader.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/files-index-loader.ts lib/files-index-loader.test.ts components/trip/attachment-list.tsx "app/(app)/trips/[tripId]/files/page.tsx" "app/(app)/trips/[tripId]/files/page.test.tsx"
git commit -m "feat(files): every row names its owner and links there; Items are Things to do

Stop, Item (Day when scheduled, else the Plan with its Stop open),
Transport leg, Accommodation and Journal, with (removed) for a gone owner.
Spec 2026-10-02 §C.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Actions — `setAttachmentTitle` and `linkAttachmentToItem`

**Files:**
- Modify: `server/actions/attachments.ts` (`findAttachmentForAccess` select; two new actions appended)
- Modify: `lib/server-action-exports.test.ts:43` (`"attachments.ts"` allowlist)
- Test: `server/actions/attachments.test.ts`

**Interfaces:**
- Consumes: `requireAttachmentAccess(id)` (module-private helper in the same file); `db`; `revalidatePath`.
- Produces:
  ```ts
  export async function setAttachmentTitle(id: string, title: string): Promise<{ success: true } | { success: false; error: string }>
  export async function linkAttachmentToItem(id: string, itemId: string | null): Promise<{ success: true } | { success: false; error: string }>
  ```
  (the same result shape the file's `deleteAttachment` returns.)

- [ ] **Step 1: Write the failing tests**

In `server/actions/attachments.test.ts`: add `itemFindFirstMock: vi.fn()` to the hoisted mocks and `item: { findFirst: itemFindFirstMock }` to the `db` mock; make sure `makeAttachmentRow()` includes `targetType: "TRIP", targetId: null` (add if missing); import the two new actions; append:

```ts
describe("setAttachmentTitle", () => {
  it("checks access first, trims, and writes the title", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    const result = await setAttachmentTitle(ATTACHMENT_ID, "  Hotel voucher ");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, attachmentUpdateMock);
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { title: "Hotel voucher" } });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/files`);
    expect(result).toEqual({ success: true });
  });

  it("an empty title clears it", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    await setAttachmentTitle(ATTACHMENT_ID, "   ");
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { title: null } });
  });

  it("refuses a title over 120 characters without writing", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    const result = await setAttachmentTitle(ATTACHMENT_ID, "x".repeat(121));
    expect(result).toEqual({ success: false, error: "Title must be 120 characters or fewer." });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
  });
});

describe("linkAttachmentToItem", () => {
  it("links a Trip-level file to an Item on the same trip", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    itemFindFirstMock.mockResolvedValue({ id: "item-1" });
    const result = await linkAttachmentToItem(ATTACHMENT_ID, "item-1");
    expect(itemFindFirstMock).toHaveBeenCalledWith({ where: { id: "item-1", tripId: TRIP_ID }, select: { id: true } });
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { targetType: "ITEM", targetId: "item-1" } });
    expect(result).toEqual({ success: true });
  });

  // Review Focus 5: an Item on another Trip, by id.
  it("refuses an Item that is not on this trip, writing nothing", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    itemFindFirstMock.mockResolvedValue(null);
    const result = await linkAttachmentToItem(ATTACHMENT_ID, "other-trip-item");
    expect(result).toEqual({ success: false, error: "That Item isn't on this Trip." });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
  });

  it("null unlinks back to Trip-level", async () => {
    attachmentFindUniqueMock.mockResolvedValue({ ...makeAttachmentRow(), targetType: "ITEM", targetId: "item-1" });
    await linkAttachmentToItem(ATTACHMENT_ID, null);
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { targetType: "TRIP", targetId: null } });
  });

  it("refuses a file uploaded on a Stop, Transport or Accommodation", async () => {
    attachmentFindUniqueMock.mockResolvedValue({ ...makeAttachmentRow(), targetType: "STOP", targetId: "s1" });
    const result = await linkAttachmentToItem(ATTACHMENT_ID, "item-1");
    expect(result).toEqual({ success: false, error: "Only Trip-level files can be linked to an Item." });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
  });

  it("checks access before any write", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    itemFindFirstMock.mockResolvedValue({ id: "item-1" });
    await linkAttachmentToItem(ATTACHMENT_ID, "item-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, attachmentUpdateMock);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run server/actions/attachments.test.ts lib/server-action-exports.test.ts`
Expected: FAIL — the actions are not exported (and, once they are, the allowlist test until Step 4).

- [ ] **Step 3: Write the actions**

`server/actions/attachments.ts` — add `targetType: true, targetId: true,` to `findAttachmentForAccess`'s select, then append:

```ts
const TITLE_MAX = 120;

/**
 * Give a file a title (CONTEXT.md "Attachment"; spec 2026-10-02 §C) — the
 * name it is shown by wherever it is listed. Empty clears it.
 */
export async function setAttachmentTitle(
  id: string,
  title: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { attachment } = await requireAttachmentAccess(id);
  const trimmed = title.trim();
  if (trimmed.length > TITLE_MAX) {
    return { success: false, error: `Title must be ${TITLE_MAX} characters or fewer.` };
  }
  await db.attachment.update({ where: { id }, data: { title: trimmed.length === 0 ? null : trimmed } });
  if (attachment.tripId) revalidatePath(`/trips/${attachment.tripId}/files`);
  else revalidatePath("/globe");
  return { success: true };
}

/**
 * Link a Trip-level file to an Item on the same Trip, or (null) unlink it
 * back to Trip-level. Files uploaded on a Stop, Transport or Accommodation
 * stay where they were put — moving those is a different feature.
 */
export async function linkAttachmentToItem(
  id: string,
  itemId: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const { attachment } = await requireAttachmentAccess(id);
  if (!attachment.tripId) {
    return { success: false, error: "Only a Trip's files can be linked to an Item." };
  }
  if (attachment.targetType !== "TRIP" && attachment.targetType !== "ITEM") {
    return { success: false, error: "Only Trip-level files can be linked to an Item." };
  }
  if (itemId) {
    const item = await db.item.findFirst({ where: { id: itemId, tripId: attachment.tripId }, select: { id: true } });
    if (!item) return { success: false, error: "That Item isn't on this Trip." };
    await db.attachment.update({ where: { id }, data: { targetType: "ITEM", targetId: itemId } });
  } else {
    await db.attachment.update({ where: { id }, data: { targetType: "TRIP", targetId: null } });
  }
  revalidatePath(`/trips/${attachment.tripId}/files`);
  return { success: true };
}
```

- [ ] **Step 4: Allowlist**

`lib/server-action-exports.test.ts:43` → `"attachments.ts": ["deleteAttachment", "linkAttachmentToItem", "setAttachmentTitle", "uploadAttachment"],`

- [ ] **Step 5: Run the tests and gates**

Run: `TZ=UTC npx vitest run server/actions/attachments.test.ts lib/server-action-exports.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/actions/attachments.ts server/actions/attachments.test.ts lib/server-action-exports.test.ts
git commit -m "feat(files): setAttachmentTitle and linkAttachmentToItem actions

Access-checked on the file's Trip; linking refuses an Item off this Trip
and any file not Trip-level or Item-linked. Spec 2026-10-02 §C.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Rename and Link-to controls on the Files page

**Files:**
- Create: `components/trip/file-title-dialog.tsx`, `components/trip/file-link-dialog.tsx`
- Create: `components/trip/files-index.tsx` (client; owns the two dialogs' state and renders the Files sections)
- Create: `components/trip/files-index.test.tsx`
- Modify: `components/trip/attachment-list.tsx` (`onRename?`, `onLink?` props and two icon buttons)
- Modify: `app/(app)/trips/[tripId]/files/page.tsx` (loads link targets; renders `FilesIndex` in place of the inline sections)
- Test: `app/(app)/trips/[tripId]/files/page.test.tsx`

**Interfaces:**
- Consumes: `setAttachmentTitle`, `linkAttachmentToItem` (Task 8); `attachmentName`, `AttachmentView` (Task 6/7); `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` (`components/ui/dialog.tsx`); `Input` (`components/ui/input.tsx`), `Label` (`components/ui/label.tsx`), `Button`; `REAL_PLAN` (`lib/plan-scope.ts`, `{ forkId: null }`).
- Produces:
  ```ts
  // components/trip/files-index.tsx
  export interface LinkTargetGroup { stopName: string; items: Array<{ id: string; title: string }> }
  export interface FilesSection { type: TargetType; label: string; attachments: AttachmentView[] }
  export function FilesIndex({ tripId, tripAttachments, sections, linkTargets }: { tripId: string; tripAttachments: AttachmentView[]; sections: FilesSection[]; linkTargets: LinkTargetGroup[] })
  // AttachmentListProps gains: onRename?(att: AttachmentView): void; onLink?(att: AttachmentView): void
  ```
  The page keeps exporting `FILES_SECTION_HEADER_CLASS` (its test asserts it) and passes it down via `FilesIndex`'s import of the same constant from a new `lib/files-section-class.ts`? — No: keep it simple — `FilesIndex` imports `FILES_SECTION_HEADER_CLASS` from `@/app/(app)/trips/[tripId]/files/section-class` (new tiny file exporting the constant), and the page re-exports it: `export { FILES_SECTION_HEADER_CLASS } from "./section-class";`.

- [ ] **Step 1: Write the failing tests**

`components/trip/files-index.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setAttachmentTitle = vi.fn();
const linkAttachmentToItem = vi.fn();
vi.mock("@/server/actions/attachments", () => ({
  get setAttachmentTitle() { return setAttachmentTitle; },
  get linkAttachmentToItem() { return linkAttachmentToItem; },
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), usePathname: () => "/trips/t1/files" }));
vi.mock("@/lib/image-compress", () => ({ compressImage: vi.fn(), oversizeUploadMessage: () => "" }));

import { FilesIndex } from "./files-index";
import type { AttachmentView } from "./attachment-list";

const base = { mime: "application/pdf", size: 1024, url: "/api/attachments/x", uploadedById: "u1", createdAt: new Date("2026-10-01T00:00:00Z") };
const tripFile: AttachmentView = { ...base, id: "f-trip", filename: "trip.pdf", title: null, owner: null };
const itemFile: AttachmentView = { ...base, id: "f-item", filename: "ticket.pdf", title: "Colosseum ticket", owner: { label: "Colosseum", href: "/trips/t1/day/2026-12-05" } };
const stopFile: AttachmentView = { ...base, id: "f-stop", filename: "rome.pdf", title: null, owner: { label: "Rome", href: "/trips/t1/plan#open=s1" } };
const linkTargets = [
  { stopName: "Rome", items: [{ id: "i1", title: "Colosseum" }, { id: "i2", title: "Gelato" }] },
  { stopName: "Wishlist", items: [{ id: "i3", title: "Someday" }] },
];

beforeEach(() => {
  setAttachmentTitle.mockReset().mockResolvedValue({ success: true });
  linkAttachmentToItem.mockReset().mockResolvedValue({ success: true });
  refresh.mockReset();
});

function renderIndex() {
  return render(
    <FilesIndex
      tripId="t1"
      tripAttachments={[tripFile]}
      sections={[
        { type: "ITEM", label: "Things to do", attachments: [itemFile] },
        { type: "STOP", label: "Stops", attachments: [stopFile] },
      ]}
      linkTargets={linkTargets}
    />,
  );
}

describe("FilesIndex", () => {
  it("renames a file through the dialog and refreshes", async () => {
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Rename rome.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename file" });
    const field = within(dialog).getByLabelText("Title");
    await userEvent.clear(field);
    await userEvent.type(field, "Rome hotel voucher");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(setAttachmentTitle).toHaveBeenCalledWith("f-stop", "Rome hotel voucher");
    expect(refresh).toHaveBeenCalled();
  });

  it("offers Link to… on Trip-level and Item files only, listing Items by Stop plus Trip-level", async () => {
    renderIndex();
    expect(screen.getByRole("button", { name: "Link trip.pdf to an Item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Colosseum ticket to an Item" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link rome.pdf to an Item" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Link trip.pdf to an Item" }));
    const dialog = await screen.findByRole("dialog", { name: "Link to an Item" });
    const select = within(dialog).getByLabelText("Item") as HTMLSelectElement;
    expect(within(select).getByRole("group", { name: "Rome" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Trip-level (not linked)" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "i2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(linkAttachmentToItem).toHaveBeenCalledWith("f-trip", "i2");
    expect(refresh).toHaveBeenCalled();
  });

  it("choosing Trip-level unlinks", async () => {
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Link Colosseum ticket to an Item" }));
    const dialog = await screen.findByRole("dialog", { name: "Link to an Item" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Item"), "");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(linkAttachmentToItem).toHaveBeenCalledWith("f-item", null);
  });

  it("shows the action's error inside the dialog and keeps it open", async () => {
    setAttachmentTitle.mockResolvedValue({ success: false, error: "Title must be 120 characters or fewer." });
    renderIndex();
    await userEvent.click(screen.getByRole("button", { name: "Rename trip.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename file" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Title must be 120 characters or fewer.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run components/trip/files-index.test.tsx`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Two small dialogs**

`components/trip/file-title-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAttachmentTitle } from "@/server/actions/attachments";

export interface FileTitleDialogProps {
  file: { id: string; title: string | null | undefined } | null;
  onOpenChange(open: boolean): void;
  onSaved(): void;
}

/** Rename a file (spec 2026-10-02 §C): one Title field; empty clears it. */
export function FileTitleDialog({ file, onOpenChange, onSaved }: FileTitleDialogProps) {
  const id = React.useId();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setValue(file?.title ?? "");
    setError(null);
  }, [file]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    startTransition(async () => {
      const result = await setAttachmentTitle(file.id, value);
      if (result.success) {
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input id={`${id}-title`} value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} autoFocus />
            <p className="text-xs text-muted-foreground">Leave empty to show the filename.</p>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" loading={pending} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`components/trip/file-link-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { linkAttachmentToItem } from "@/server/actions/attachments";

export interface LinkTargetGroup {
  stopName: string;
  items: Array<{ id: string; title: string }>;
}

export interface FileLinkDialogProps {
  file: { id: string; itemId: string | null } | null;
  targets: LinkTargetGroup[];
  onOpenChange(open: boolean): void;
  onSaved(): void;
}

/** Link a Trip-level file to an Item, or back to Trip-level (spec 2026-10-02 §C). */
export function FileLinkDialog({ file, targets, onOpenChange, onSaved }: FileLinkDialogProps) {
  const id = React.useId();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setValue(file?.itemId ?? "");
    setError(null);
  }, [file]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    startTransition(async () => {
      const result = await linkAttachmentToItem(file.id, value === "" ? null : value);
      if (result.success) {
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Link to an Item</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-item`}>Item</Label>
            <select
              id={`${id}-item`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-11 rounded-md border-2 border-border bg-card px-3 text-base sm:text-sm"
            >
              <option value="">Trip-level (not linked)</option>
              {targets.map((group) => (
                <optgroup key={group.stopName} label={group.stopName}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" loading={pending} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Row controls**

`components/trip/attachment-list.tsx` — `AttachmentListProps` gains:

```ts
  /** Files page only: open the Rename dialog for this file. */
  onRename?: (att: AttachmentView) => void;
  /** Files page only: open the Link-to dialog for this file (Trip-level and Item files). */
  onLink?: (att: AttachmentView) => void;
```

Import `Pencil, Link2` from `lucide-react`. In the **full** layout's action cluster (before `AttachmentLink`), and in the compact layout's `<div className="flex shrink-0 items-center gap-1">`:

```tsx
                {onRename && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(CARD_ACTION, "hover:bg-muted")}
                    aria-label={`Rename ${attachmentName(att)}`}
                    onClick={() => onRename(att)}
                  >
                    <Pencil className="size-[18px]" aria-hidden="true" />
                  </Button>
                )}
                {onLink && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(CARD_ACTION, "hover:bg-muted")}
                    aria-label={`Link ${attachmentName(att)} to an Item`}
                    onClick={() => onLink(att)}
                  >
                    <Link2 className="size-[18px]" aria-hidden="true" />
                  </Button>
                )}
```

(In compact, use the compact cluster's own size classes — `size-9`/`size-8` — as its neighbours do.)

- [ ] **Step 5: The index component and the section-class file**

`app/(app)/trips/[tripId]/files/section-class.ts`:

```ts
/**
 * Tailwind classes for the entity-group section-header label — kit Label
 * (`text-label`: 11px, uppercase, 0.08em) in the display face. Shared by the
 * page (which re-exports it for its test) and the client FilesIndex.
 */
export const FILES_SECTION_HEADER_CLASS = "font-display font-bold text-label text-muted-foreground";
```

`components/trip/files-index.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { TargetType } from "@/lib/enums";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { FileTitleDialog } from "@/components/trip/file-title-dialog";
import { FileLinkDialog, type LinkTargetGroup } from "@/components/trip/file-link-dialog";
import { FILES_SECTION_HEADER_CLASS } from "@/app/(app)/trips/[tripId]/files/section-class";

export type { LinkTargetGroup };

export interface FilesSection {
  type: TargetType;
  label: string;
  attachments: AttachmentView[];
}

/**
 * The Files page's body (spec 2026-10-02 §C): Trip-level files with the
 * upload tile, then one section per owner type. Owns the Rename and Link-to
 * dialogs so the server page stays a loader. Link-to shows on Trip-level
 * files and on Item files (to unlink); files uploaded on a Stop, Transport
 * or Accommodation stay where they were put.
 */
export function FilesIndex({
  tripId,
  tripAttachments,
  sections,
  linkTargets,
}: {
  tripId: string;
  tripAttachments: AttachmentView[];
  sections: FilesSection[];
  linkTargets: LinkTargetGroup[];
}) {
  const router = useRouter();
  const [renaming, setRenaming] = React.useState<AttachmentView | null>(null);
  const [linking, setLinking] = React.useState<{ att: AttachmentView; itemId: string | null } | null>(null);
  const saved = () => router.refresh();

  return (
    <>
      <AttachmentList tripId={tripId} targetType="TRIP" attachments={tripAttachments} onRename={setRenaming} onLink={(att) => setLinking({ att, itemId: null })} />

      {sections.map((section) => (
        <div key={section.type} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 pt-2">
            <h3 className={FILES_SECTION_HEADER_CLASS}>{section.label}</h3>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{section.attachments.length}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
          </div>
          <AttachmentList
            tripId={tripId}
            targetType={section.type}
            attachments={section.attachments}
            showUpload={false}
            onRename={setRenaming}
            onLink={section.type === "ITEM" ? (att) => setLinking({ att, itemId: null }) : undefined}
          />
        </div>
      ))}

      <FileTitleDialog file={renaming ? { id: renaming.id, title: renaming.title } : null} onOpenChange={(o) => !o && setRenaming(null)} onSaved={saved} />
      <FileLinkDialog file={linking ? { id: linking.att.id, itemId: linking.itemId } : null} targets={linkTargets} onOpenChange={(o) => !o && setLinking(null)} onSaved={saved} />
    </>
  );
}
```

An Item file's Link-to dialog opens on "Trip-level (not linked)": the view does not carry the current `targetId`, and it does not need to — choosing Trip-level unlinks, choosing an Item re-links.

- [ ] **Step 6: The page becomes a loader**

`app/(app)/trips/[tripId]/files/page.tsx`: replace the local `FILES_SECTION_HEADER_CLASS` constant with `export { FILES_SECTION_HEADER_CLASS } from "./section-class";`; import `FilesIndex, type FilesSection, type LinkTargetGroup` and `REAL_PLAN` from `@/lib/plan-scope`; load the link targets after the attachments:

```ts
  const linkItems = await db.item.findMany({
    where: { tripId, ...REAL_PLAN },
    select: { id: true, title: true, stopId: true, stop: { select: { name: true, sortOrder: true } } },
    orderBy: [{ sortOrder: "asc" }],
  });
  const byStop = new Map<string, LinkTargetGroup & { order: number }>();
  for (const it of linkItems) {
    const key = it.stop?.name ?? "Wishlist";
    const group = byStop.get(key) ?? { stopName: key, items: [], order: it.stop?.sortOrder ?? Number.MAX_SAFE_INTEGER };
    group.items.push({ id: it.id, title: it.title });
    byStop.set(key, group);
  }
  const linkTargets: LinkTargetGroup[] = [...byStop.values()].sort((a, b) => a.order - b.order).map(({ stopName, items }) => ({ stopName, items }));
  const sections: FilesSection[] = (Array.from(grouped.entries()) as Array<[TargetType, AttachmentView[]]>).map(([type, attachments]) => ({
    type,
    label: TARGET_TYPE_LABELS[type],
    attachments,
  }));
```

and render `<FilesIndex tripId={tripId} tripAttachments={tripAttachments} sections={sections} linkTargets={linkTargets} />` in place of the inline Trip-level `AttachmentList` and the grouped map. The empty state stays as it is. (`Item.stop` is the relation Prisma exposes for `stopId`; if the model names it differently — `grep -n 'stop ' prisma/schema.prisma` inside `model Item` — use that name.)

- [ ] **Step 7: Update the page test**

In `app/(app)/trips/[tripId]/files/page.test.tsx`: mock `@/components/trip/files-index` to render the sections it is given (the same shape the Task 7 `AttachmentList` mock rendered, iterating `sections` and `tripAttachments`), add `item: { findMany: vi.fn().mockResolvedValue([]) }` to the `db` mock, and keep the Task 7 assertions (owner link, `(removed)`, `Things to do`). Keep the header-class tests (the constant is still exported from the page).

- [ ] **Step 8: Run the tests and gates**

Run: `TZ=UTC npx vitest run components/trip/files-index.test.tsx components/trip/attachment-list.test.tsx "app/(app)/trips/[tripId]/files" && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/trip/file-title-dialog.tsx components/trip/file-link-dialog.tsx components/trip/files-index.tsx components/trip/files-index.test.tsx components/trip/attachment-list.tsx "app/(app)/trips/[tripId]/files/section-class.ts" "app/(app)/trips/[tripId]/files/page.tsx" "app/(app)/trips/[tripId]/files/page.test.tsx"
git commit -m "feat(files): Rename and Link-to controls on the Files page

A title dialog on every file; a Link-to dialog on Trip-level and Item
files listing the Trip's things to do by Stop, with Trip-level to unlink.
Spec 2026-10-02 §C.

Resolves-Feedback: cmupci300000004jp5c54md6u
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Part D — Tap-to-open ideas

### Task 10: `IdeaSheet` — an idea opened

**Files:**
- Create: `components/plan/idea-sheet.tsx`, `components/plan/idea-sheet.test.tsx`

**Interfaces:**
- Consumes: `Dialog, DialogContent, DialogHeader, DialogTitle` (`components/ui/dialog.tsx` — already a bottom sheet below `sm` and a centred dialog above, so one component covers phone and desktop); `ItemCard, type ItemCardItem` (`components/trip/item-card.tsx`); `DayPickerMenu` (`components/trip/day-picker-menu.tsx`, props `days, label, onPick, trigger`); `type AttachmentView`; `type CostRow` from `@/server/actions/costs` (the type-only import `item-card.tsx` makes); `Button`.
- Produces:
  ```ts
  export interface IdeaSheetProps {
    tripId: string;
    idea: ItemCardItem | null;     // null = closed
    days: string[];                // the Stop's days; [] on a rough Stop
    homeCurrency?: string;
    costs?: CostRow[];
    attachments?: AttachmentView[];
    onClose(): void;
    onPickDay(idea: ItemCardItem, dateISO: string): void;
    onEdit(idea: ItemCardItem): void;
  }
  export function IdeaSheet(props: IdeaSheetProps)
  ```

- [ ] **Step 1: Write the failing test**

`components/plan/idea-sheet.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdeaSheet } from "./idea-sheet";
import type { ItemCardItem } from "@/components/trip/item-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/trips/t1/plan" }));

const IDEA: ItemCardItem = {
  id: "i1",
  title: "Musée d'Orsay",
  category: "SIGHTSEEING",
  date: null,
  stopId: "s1",
  address: "1 Rue de la Légion d'Honneur",
  link: "https://www.musee-orsay.fr",
  booking: "ORS-123",
  notes: "Book the 9am slot",
  hiddenFromShares: false,
};
const DAYS = ["2026-12-10", "2026-12-11"];

function renderSheet(over: Partial<React.ComponentProps<typeof IdeaSheet>> = {}) {
  const props = {
    tripId: "t1",
    idea: IDEA,
    days: DAYS,
    onClose: vi.fn(),
    onPickDay: vi.fn(),
    onEdit: vi.fn(),
    ...over,
  };
  render(<IdeaSheet {...props} />);
  return props;
}

describe("IdeaSheet (spec 2026-10-02 §D)", () => {
  it("opens as a dialog named after the idea, showing its notes, link and booking reference", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Musée d'Orsay" })).toBeInTheDocument();
    expect(screen.getByText("Book the 9am slot")).toBeInTheDocument();
    expect(screen.getByText("ORS-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /musee-orsay/ })).toBeInTheDocument();
  });

  it("Pick a day lists the Stop's days; picking schedules and closes", async () => {
    const props = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Pick a day for Musée d'Orsay" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Fri 11 Dec" }));
    expect(props.onPickDay).toHaveBeenCalledWith(IDEA, "2026-12-11");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Edit hands the idea to the form and closes", async () => {
    const props = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Edit Musée d'Orsay" }));
    expect(props.onEdit).toHaveBeenCalledWith(IDEA);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("a rough Stop (no days) has no Pick a day", () => {
    renderSheet({ days: [] });
    expect(screen.queryByRole("button", { name: /Pick a day/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Musée d'Orsay" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    renderSheet({ idea: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

(`"Fri 11 Dec"` is how `DayPickerMenu` labels `2026-12-11` — the same string `components/plan/ideas-box.test.tsx` already asserts.)

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run components/plan/idea-sheet.test.tsx`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the sheet**

`components/plan/idea-sheet.tsx`:

```tsx
"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ItemCard, type ItemCardItem } from "@/components/trip/item-card";
import { DayPickerMenu } from "@/components/trip/day-picker-menu";
import type { AttachmentView } from "@/components/trip/attachment-list";
import type { CostRow } from "@/server/actions/costs";

export interface IdeaSheetProps {
  tripId: string;
  /** null = closed. */
  idea: ItemCardItem | null;
  /** The Stop's days; [] on a rough Stop, which hides Pick a day. */
  days: string[];
  homeCurrency?: string;
  costs?: CostRow[];
  attachments?: AttachmentView[];
  onClose(): void;
  onPickDay(idea: ItemCardItem, dateISO: string): void;
  onEdit(idea: ItemCardItem): void;
}

/**
 * A thing to do, opened (CONTEXT.md "Item"; spec 2026-10-02 §D): everything
 * the idea carries, with Pick a day and Edit inside. One Dialog serves both
 * phone (bottom sheet) and desktop (centred). The ItemCard renders without
 * its own action cluster — the two buttons below are the actions.
 */
export function IdeaSheet({ tripId, idea, days, homeCurrency, costs, attachments, onClose, onPickDay, onEdit }: IdeaSheetProps) {
  return (
    <Dialog open={idea !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined}>
        {idea ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{idea.title}</DialogTitle>
            </DialogHeader>
            <ItemCard item={idea} mode="wishlist" tripId={tripId} homeCurrency={homeCurrency} costs={costs} attachments={attachments} />
            <div className="flex flex-wrap gap-2">
              {days.length > 0 && (
                <DayPickerMenu
                  days={days}
                  label={`Pick a day for ${idea.title}`}
                  onPick={(d) => {
                    onClose();
                    onPickDay(idea, d);
                  }}
                  trigger={
                    <Button type="button" variant="primary" size="md" aria-label={`Pick a day for ${idea.title}`}>
                      Pick a day
                    </Button>
                  }
                />
              )}
              <Button
                type="button"
                variant="outline"
                size="md"
                aria-label={`Edit ${idea.title}`}
                onClick={() => {
                  onClose();
                  onEdit(idea);
                }}
              >
                Edit
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

If `ItemCard` in `wishlist` mode renders its own Edit control even without `onEdit` (check `CardActionCluster`'s behaviour with `onEdit` undefined), it must not — the test's `getByRole("button", { name: "Edit Musée d'Orsay" })` would find two; in that case pass `onEdit` through to `ItemCard` instead of rendering the separate Edit button, keeping the accessible name `Edit {title}`.

- [ ] **Step 4: Run the test and gates**

Run: `TZ=UTC npx vitest run components/plan/idea-sheet.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/plan/idea-sheet.tsx components/plan/idea-sheet.test.tsx
git commit -m "feat(plan): IdeaSheet — a thing to do, opened, with Pick a day and Edit inside

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Tapping an idea opens it — desktop chips and the phone stop sheet

**Files:**
- Modify: `components/plan/ideas-box.tsx` (props; chip = open), `components/plan/ideas-box.test.tsx`
- Modify: `components/plan/stop-open-body.tsx` (`IdeasBox` call, new `onOpenIdea` prop)
- Modify: `components/plan/mobile/stop-sheet.tsx` (Ideas tab rows; `onPickDay` → `onOpenIdea`), `components/plan/mobile/stop-sheet.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx` (`openIdea` state; `IdeaSheet` render; `pickIdea`/`PickDaySheet` removed; `StopOpenBody`/`StopSheet` props)
- Test: whatever tests cover `StopOpenBody` and `itinerary-manager` (`components/plan/stop-open-body.test.tsx`, `components/trip/itinerary-manager.test.tsx` if present)

**Interfaces:**
- Consumes: `IdeaSheet` (Task 10); `toItemCardItem` (`components/plan/types.ts`); `slotsFor(stop, idx)` and `handleScheduleThing(thing, dateISO)` (both already in `itinerary-manager.tsx`).
- Produces: `IdeasBoxProps = { ideas: ThingToDo[]; onOpen(idea: ThingToDo): void; onAdd(): void; disabled?: boolean }` (`days`/`onPick` removed); `StopOpenBodyProps.onOpenIdea(idea: ThingToDo): void`; `StopSheetProps.onOpenIdea(idea: ThingToDo): void` (replaces `onPickDay`).

- [ ] **Step 1: Rewrite the failing tests**

`components/plan/ideas-box.test.tsx` — replace the test "a chip opens the day picker and schedules on pick" and "a rough stop's ideas are plain chips (no days to pick)" with:

```tsx
  it("a chip opens the idea", async () => {
    const onOpen = vi.fn();
    render(<IdeasBox ideas={IDEAS} onOpen={onOpen} onAdd={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Open Musée d'Orsay" }));
    expect(onOpen).toHaveBeenCalledWith(IDEAS[0]);
  });

  it("a rough stop's ideas open too — the sheet decides whether a day can be picked", async () => {
    const onOpen = vi.fn();
    render(<IdeasBox ideas={IDEAS} onOpen={onOpen} onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Pick a day/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open Le Bon Marché" }));
    expect(onOpen).toHaveBeenCalledWith(IDEAS[2]);
  });
```

and update every other `render(<IdeasBox … days={DAYS} onPick={…} />)` in the file to `onOpen={vi.fn()}` with no `days`/`onPick`; the first test's `getByRole("button", { name: /Pick a day for Musée d'Orsay/ })` becomes `{ name: "Open Musée d'Orsay" }`. Delete the now-unused `DAYS` constant.

`components/plan/mobile/stop-sheet.test.tsx` — the Ideas half of "tabs: …; Ideas has Pick day" becomes:

```tsx
    await userEvent.click(screen.getByRole("radio", { name: "Ideas 1" }));
    const row = screen.getByRole("button", { name: "Open Musée d'Orsay" });
    expect(row.className).toContain("tap-target");
    await userEvent.click(row);
    expect(props.onOpenIdea).toHaveBeenCalledWith(IDEAS[0]);
```

(rename the test to "…Ideas rows open the idea"); the rough-stop test's last line becomes `expect(screen.getByRole("button", { name: "Open Musée d'Orsay" })).toBeInTheDocument();`. The `renderSheet` helper's props: `onPickDay` → `onOpenIdea`.

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/plan/ideas-box.test.tsx components/plan/mobile/stop-sheet.test.tsx`
Expected: FAIL — no "Open …" buttons; `onOpenIdea` not a prop.

- [ ] **Step 3: IdeasBox opens**

`components/plan/ideas-box.tsx`: props become `{ ideas: ThingToDo[]; onOpen(idea: ThingToDo): void; onAdd(): void; disabled?: boolean }`; remove the `DayPickerMenu` and `ChevronDown` imports; `chipFor` becomes one branch:

```tsx
  const chipFor = (idea: ThingToDo) => (
    <button
      key={idea.id}
      type="button"
      aria-label={`Open ${idea.title}`}
      disabled={disabled}
      className={CHIP_CLASS}
      onClick={() => onOpen(idea)}
    >
      <span className={cn("size-[9px] rounded-full", categoryDotClass(idea.category))} aria-hidden="true" />
      <span className="max-w-[10rem] truncate">{idea.title}</span>
      {idea.hiddenFromShares && (
        <span role="img" aria-label="Hidden from shares">
          <EyeOff className="size-3" aria-hidden="true" />
        </span>
      )}
    </button>
  );
```

Update the box's doc comment: "chips per unscheduled thing-to-do, each opening the idea (spec 2026-10-02 §D); Pick a day lives inside the opened idea."

- [ ] **Step 4: StopOpenBody and StopSheet thread it**

`components/plan/stop-open-body.tsx`: add `onOpenIdea(idea: ThingToDo): void;` to its props and change the `IdeasBox` call to `<IdeasBox ideas={ideas} onOpen={onOpenIdea} onAdd={onAddIdea} />` (the `days`/`onPick` args go; `onScheduleIdea` stays for the day panel's `onPickIdea`).

`components/plan/mobile/stop-sheet.tsx`: rename the prop `onPickDay(idea)` → `onOpenIdea(idea)`; the Ideas row becomes a button:

```tsx
                ideas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    aria-label={`Open ${idea.title}`}
                    onClick={() => onOpenIdea(idea)}
                    className="tap-target flex min-h-[52px] w-full items-center gap-3 border-b-2 border-muted text-left"
                  >
                    <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(idea.category))} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{idea.title}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))
```

(import `ChevronRight` from lucide; the `rough`-gated Pick day pill is gone — a rough Stop's idea still opens.)

- [ ] **Step 5: The manager owns the open idea**

`components/trip/itinerary-manager.tsx`:
- import `IdeaSheet` from `@/components/plan/idea-sheet`; remove the `PickDaySheet` import and the `pickIdea`/`setPickIdea`/`pickStop` state and its render block.
- add state: `const [openIdea, setOpenIdea] = React.useState<{ stopId: string; idea: ThingToDo } | null>(null);` and `const openIdeaStop = openIdea ? (stops.find((s) => s.id === openIdea.stopId) ?? null) : null;`
- `StopOpenBody` (desktop, ~line 1751): add `onOpenIdea={(idea) => setOpenIdea({ stopId: stop.id, idea })}`.
- `StopSheet` (phone, ~line 2400): replace `onPickDay={…}` with `onOpenIdea={(idea) => setOpenIdea({ stopId: sheetStop.id, idea })}`.
- render, where `PickDaySheet` was:

```tsx
      {/* An idea, opened (spec 2026-10-02 §D) — phone sheet or desktop dialog */}
      <IdeaSheet
        tripId={tripId}
        idea={openIdea ? toItemCardItem(openIdea.idea) : null}
        days={openIdeaStop?.arriveDate && openIdeaStop.departDate ? slotsFor(openIdeaStop, stops.indexOf(openIdeaStop)).map((s) => s.dateISO) : []}
        homeCurrency={homeCurrency}
        costs={openIdea ? thingsToDoItemCostsById?.get(openIdea.idea.id) : undefined}
        attachments={openIdea ? (attachmentsByItemId?.get(openIdea.idea.id) ?? []) : []}
        onClose={() => setOpenIdea(null)}
        onPickDay={(_item, d) => {
          if (openIdea) void handleScheduleThing(openIdea.idea, d);
        }}
        onEdit={(item) => setItemForm({ mode: "edit", item })}
      />
```

(`homeCurrency` — use whatever name the manager already holds the Trip's home currency under for `ItemFormDialog`'s `homeCurrency` prop at ~line 2370.)

- [ ] **Step 6: Run the tests and gates**

Run: `TZ=UTC npx vitest run components/plan components/trip/itinerary-manager.test.tsx components/trip/item-card.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS (drop a test path that does not exist). `tsc` catches any remaining `onPickDay` / `days` / `onPick` caller.

- [ ] **Step 7: Commit**

```bash
git add components/plan/ideas-box.tsx components/plan/ideas-box.test.tsx components/plan/stop-open-body.tsx components/plan/mobile/stop-sheet.tsx components/plan/mobile/stop-sheet.test.tsx components/trip/itinerary-manager.tsx
git commit -m "feat(plan): tapping a thing to do under a Stop opens it

Desktop chips and the phone stop sheet's Ideas rows open the IdeaSheet;
Pick a day moves inside it; the phone's separate PickDaySheet for ideas
goes. Spec 2026-10-02 §D.

Resolves-Feedback: cmup8xolg000004jtqvc2lfu7
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Part F — Sticky left column on the desktop share page

### Task 12: Pin the hero or map beside the route list

**Files:**
- Modify: `app/share/[token]/page.tsx:76-79` (`PLACEMENT`)
- Test: `app/share/[token]/page.test.tsx` (the three stage tests)

**Interfaces:** none.

- [ ] **Step 1: Write the failing assertions**

In each stage test in `describe("SharePage — stages …")`, add after the `sectionOrder` assertion:

```ts
    // Spec 2026-10-02 §F: the left item beside the route list sticks on desktop.
    const sticky = Array.from(container.querySelectorAll("[data-share-section]")).filter((el) => el.className.includes("lg:sticky"));
    expect(sticky.map((el) => el.getAttribute("data-share-section"))).toEqual([LEFT]);
    expect(sticky[0].className.split(/\s+/)).toEqual(expect.arrayContaining(["lg:sticky", "lg:top-6", "lg:self-start"]));
```

with `LEFT` = `"hero"` in the `before` test and `"map"` in `during` and `after`.

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run "app/share/[token]/page.test.tsx"`
Expected: FAIL — no section carries `lg:sticky`.

- [ ] **Step 3: Pin it**

`app/share/[token]/page.tsx` `PLACEMENT`:

```ts
const STICK = "lg:sticky lg:top-6 lg:self-start";
const PLACEMENT: Record<ShareStage, Partial<Record<ShareSection, string>>> = {
  before: { hero: `lg:order-1 ${STICK}`, route: "lg:order-2", map: "lg:order-3 lg:col-span-2", days: "lg:order-4 lg:col-span-2", cta: "lg:order-5 lg:col-span-2" },
  during: { hero: "lg:order-1", "right-now": "lg:order-2", next: "lg:hidden", map: `lg:order-3 ${STICK}`, route: "lg:order-4", days: "lg:order-5 lg:col-span-2", journal: "lg:order-6 lg:col-span-2", cta: "lg:order-7 lg:col-span-2" },
  after: { hero: "lg:order-1", tally: "lg:order-2 lg:self-start", journal: "lg:order-3 lg:col-span-2", map: `hidden lg:order-4 lg:block ${STICK}`, route: "lg:order-5", days: "lg:order-6 lg:col-span-2", cta: "lg:order-7 lg:col-span-2" },
};
```

Add to the comment above it: "The left item that shares a row with the route list sticks (spec 2026-10-02 §F): the route grows with the Trip, the hero/map does not, and a pinned left item fills the row as the route scrolls. The sticky class is on the grid cell, outside ShareReveal's wrapper, so the reveal's transform cannot break it."

- [ ] **Step 4: Run the tests and gates**

Run: `TZ=UTC npx vitest run "app/share/[token]" && npx tsc --noEmit && npm run lint`
Expected: PASS (the share-style-bans and share-motion tests included).

- [ ] **Step 5: Commit**

```bash
git add "app/share/[token]/page.tsx" "app/share/[token]/page.test.tsx"
git commit -m "fix(share): the hero or map sticks beside the route list on desktop

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Part E — Traveller details

### Task 13: Model, migration, validation and the two actions

**Files:**
- Modify: `prisma/schema.prisma` (`model User` relations; `model TripMember`; `model ShareLink` after `showTravellers`; new `model TravellerDetails` after `model User`)
- Create: `prisma/migrations/20261002130000_traveller_details/migration.sql`
- Create: `lib/validations/traveller-details.ts`, `lib/validations/traveller-details.test.ts`
- Create: `server/actions/traveller-details.ts`, `server/actions/traveller-details.test.ts`
- Modify: `lib/server-action-exports.test.ts` (`ALLOWLIST`: new `"traveller-details.ts"` entry, alphabetical among the keys)

**Interfaces:**
- Consumes: `requireUser`, `requireTripAccess` (`lib/guards.ts`); `ok`, `validationResult` (`lib/action-result.ts`); `revalidatePath`.
- Produces:
  ```ts
  // lib/validations/traveller-details.ts
  export const travellerDetailsSchema  // { mobile, emergencyName, emergencyPhone, bankDetails } — each optional text, trimmed, "" → null; max 40 / 80 / 40 / 500
  export type TravellerDetailsInput = z.input<typeof travellerDetailsSchema>
  export const travelNumberSchema      // z.string().trim().max(40)
  // server/actions/traveller-details.ts
  export async function saveTravellerDetails(input: TravellerDetailsInput): Promise<ActionResult>
  export async function saveTravelNumber(tripId: string, value: string): Promise<ActionResult>
  // Prisma: TravellerDetails { userId (pk), mobile?, emergencyName?, emergencyPhone?, bankDetails?, updatedAt }; TripMember.travelNumber?; ShareLink.includeContacts (default false); User.travellerDetails?
  ```

- [ ] **Step 1: Schema and migration**

`prisma/schema.prisma`:
- in `model User`, after `digestDispatches   DigestDispatch[]`: `travellerDetails   TravellerDetails?`
- in `model TripMember`, after `role   String …`:
  ```prisma
  /// The number this Traveller has on this Trip — an eSIM or local SIM
  /// (CONTEXT.md "Traveller details"). Theirs to set from the Trip's Settings.
  travelNumber String?
  ```
- in `model ShareLink`, after `showTravellers Boolean @default(false)`:
  ```prisma
  /// Sixth dial (spec 2026-10-02 §E): each Traveller's home mobile and travel
  /// number under their name on the hero. Off by default, off on every
  /// existing link, and only honoured while showTravellers is on. The
  /// emergency contact, bank details and sign-in email are never selected
  /// by any link.
  includeContacts Boolean @default(false)
  ```
- after `model User { … }`:
  ```prisma
  /// What a Traveller chooses to tell the people they travel with (CONTEXT.md
  /// "Traveller details"): kept once, read on every Trip's Settings by fellow
  /// Travellers. Nothing here is a passport or an insurance policy, by
  /// decision. Only `mobile` can ever reach a Share link, and only by its dial.
  model TravellerDetails {
    userId         String   @id
    mobile         String?
    emergencyName  String?
    emergencyPhone String?
    bankDetails    String?
    updatedAt      DateTime @updatedAt

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  }
  ```

`prisma/migrations/20261002130000_traveller_details/migration.sql`:

```sql
-- Traveller details (spec 2026-10-02 §E; CONTEXT.md "Traveller details").
-- Additive on every path: a new table nobody reads until the new build, a
-- nullable TripMember column, and a defaulted ShareLink dial that is off
-- on every existing link — so the still-running old build cannot violate
-- anything during the migrate-then-build window.

-- CreateTable
CREATE TABLE "TravellerDetails" (
    "userId" TEXT NOT NULL,
    "mobile" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "bankDetails" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravellerDetails_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "TravellerDetails" ADD CONSTRAINT "TravellerDetails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN "travelNumber" TEXT;

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "includeContacts" BOOLEAN NOT NULL DEFAULT false;
```

Run `npx prisma generate`.

- [ ] **Step 2: Write the failing tests**

`lib/validations/traveller-details.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { travellerDetailsSchema, travelNumberSchema } from "./traveller-details";

describe("travellerDetailsSchema", () => {
  it("trims, and turns empty strings into null", () => {
    expect(travellerDetailsSchema.parse({ mobile: " +61 400 000 000 ", emergencyName: "", emergencyPhone: undefined, bankDetails: "  " })).toEqual({
      mobile: "+61 400 000 000",
      emergencyName: null,
      emergencyPhone: null,
      bankDetails: null,
    });
  });

  it("caps each field", () => {
    expect(travellerDetailsSchema.safeParse({ mobile: "1".repeat(41) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({ emergencyName: "n".repeat(81) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({ emergencyPhone: "1".repeat(41) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({ bankDetails: "b".repeat(501) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({}).success).toBe(true);
  });
});

describe("travelNumberSchema", () => {
  it("trims and caps at 40", () => {
    expect(travelNumberSchema.parse("  +39 333 1234567 ")).toBe("+39 333 1234567");
    expect(travelNumberSchema.safeParse("1".repeat(41)).success).toBe(false);
    expect(travelNumberSchema.parse("")).toBe("");
  });
});
```

`server/actions/traveller-details.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, requireTripAccessMock, upsertMock, updateManyMock, revalidatePathMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireTripAccessMock: vi.fn(),
  upsertMock: vi.fn(),
  updateManyMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock, requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({ db: { travellerDetails: { upsert: upsertMock }, tripMember: { updateMany: updateManyMock } } }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { saveTravellerDetails, saveTravelNumber } from "@/server/actions/traveller-details";

afterEach(() => vi.clearAllMocks());

describe("saveTravellerDetails", () => {
  it("upserts the viewer's own row with trimmed values and nulls", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    upsertMock.mockResolvedValue({});
    const result = await saveTravellerDetails({ mobile: " 0400 ", emergencyName: "Mum", emergencyPhone: "", bankDetails: "BSB 000-000 Acc 1" });
    expect(result).toEqual({ success: true });
    const data = { mobile: "0400", emergencyName: "Mum", emergencyPhone: null, bankDetails: "BSB 000-000 Acc 1" };
    expect(upsertMock).toHaveBeenCalledWith({ where: { userId: "u1" }, create: { userId: "u1", ...data }, update: data });
    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
  });

  it("returns field errors and writes nothing when a value is too long", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    const result = await saveTravellerDetails({ bankDetails: "b".repeat(501) });
    expect(result.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user first", async () => {
    requireUserMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveTravellerDetails({})).rejects.toThrow("NEXT_REDIRECT");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("saveTravelNumber", () => {
  it("writes only the viewer's membership row on that trip", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
    updateManyMock.mockResolvedValue({ count: 1 });
    const result = await saveTravelNumber("t1", " +39 333 1234567 ");
    expect(result).toEqual({ success: true });
    expect(updateManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u1" }, data: { travelNumber: "+39 333 1234567" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/t1/settings");
  });

  it("empty clears it", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
    await saveTravelNumber("t1", "   ");
    expect(updateManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u1" }, data: { travelNumber: null } });
  });

  it("refuses a non-member before writing", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(saveTravelNumber("t1", "x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `TZ=UTC npx vitest run lib/validations/traveller-details.test.ts server/actions/traveller-details.test.ts`
Expected: FAIL — unresolved imports.

- [ ] **Step 4: Validation and actions**

`lib/validations/traveller-details.ts`:

```ts
import { z } from "zod";

/**
 * Traveller details (CONTEXT.md; spec 2026-10-02 §E). Every field is
 * optional free text — a phone number is whatever the Traveller types —
 * trimmed, with "" becoming null so a cleared field reads as "not given".
 */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const travellerDetailsSchema = z.object({
  mobile: optionalText(40),
  emergencyName: optionalText(80),
  emergencyPhone: optionalText(40),
  bankDetails: optionalText(500),
});

export type TravellerDetailsInput = z.input<typeof travellerDetailsSchema>;

export const travelNumberSchema = z.string().trim().max(40);
```

`server/actions/traveller-details.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { type ActionResult, ok, validationResult } from "@/lib/action-result";
import { travellerDetailsSchema, travelNumberSchema, type TravellerDetailsInput } from "@/lib/validations/traveller-details";

/**
 * Save the viewer's own Traveller details (CONTEXT.md; spec 2026-10-02 §E).
 * Account-level, one row per person; never another person's row.
 */
export async function saveTravellerDetails(input: TravellerDetailsInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = travellerDetailsSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);

  await db.travellerDetails.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/account");
  return ok();
}

/**
 * Set the viewer's travel number on one Trip — the eSIM or local SIM for
 * that trip. Lives on the membership row because it is one Traveller's
 * number for one Trip; empty clears it.
 */
export async function saveTravelNumber(tripId: string, value: string): Promise<ActionResult> {
  const { user } = await requireTripAccess(tripId);
  const parsed = travelNumberSchema.safeParse(value);
  if (!parsed.success) return validationResult(parsed.error);

  await db.tripMember.updateMany({
    where: { tripId, userId: user.id },
    data: { travelNumber: parsed.data.length === 0 ? null : parsed.data },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok();
}
```

- [ ] **Step 5: Allowlist**

`lib/server-action-exports.test.ts` `ALLOWLIST`: add `"traveller-details.ts": ["saveTravelNumber", "saveTravellerDetails"],` in alphabetical key order (after `"transport.ts"`, before `"trips.ts"`).

- [ ] **Step 6: Run the tests and gates**

Run: `TZ=UTC npx vitest run lib/validations/traveller-details.test.ts server/actions/traveller-details.test.ts lib/server-action-exports.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261002130000_traveller_details lib/validations/traveller-details.ts lib/validations/traveller-details.test.ts server/actions/traveller-details.ts server/actions/traveller-details.test.ts lib/server-action-exports.test.ts
git commit -m "feat(travellers): Traveller details — model, travel number, Contact details dial, and the two actions

TravellerDetails (home mobile, emergency contact, bank details) on the
person; TripMember.travelNumber on the membership; ShareLink.includeContacts
off everywhere. Spec 2026-10-02 §E.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: "Your details" card on Account

**Files:**
- Create: `components/account/traveller-details-card.tsx`, `components/account/traveller-details-card.test.tsx`
- Modify: `app/(app)/account/page.tsx` (read the row; render the card in the left column after the Admin queue card)
- Test: `app/(app)/account/page.test.tsx`

**Interfaces:**
- Consumes: `saveTravellerDetails` (Task 13); `Input`, `Textarea`, `Label`, `Button`, `Card`, `CardTitle`.
- Produces: `export interface TravellerDetailsValues { mobile: string | null; emergencyName: string | null; emergencyPhone: string | null; bankDetails: string | null }`; `export function TravellerDetailsForm({ initial }: { initial: TravellerDetailsValues })`.

- [ ] **Step 1: Write the failing tests**

`components/account/traveller-details-card.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveTravellerDetails = vi.fn();
vi.mock("@/server/actions/traveller-details", () => ({
  get saveTravellerDetails() { return saveTravellerDetails; },
}));

import { TravellerDetailsForm } from "./traveller-details-card";

beforeEach(() => saveTravellerDetails.mockReset().mockResolvedValue({ success: true }));

const EMPTY = { mobile: null, emergencyName: null, emergencyPhone: null, bankDetails: null };

describe("TravellerDetailsForm", () => {
  it("shows the four fields with their helper lines, prefilled", () => {
    render(<TravellerDetailsForm initial={{ ...EMPTY, mobile: "0400 000 000", bankDetails: "BSB 000-000" }} />);
    expect(screen.getByLabelText("Mobile")).toHaveValue("0400 000 000");
    expect(screen.getByLabelText("Emergency contact name")).toHaveValue("");
    expect(screen.getByLabelText("Emergency contact number")).toHaveValue("");
    expect(screen.getByLabelText("Bank details")).toHaveValue("BSB 000-000");
    expect(screen.getByText("Fellow Travellers see this; a Share link only if its Contact details dial is on.")).toBeInTheDocument();
    expect(screen.getByText("Only the people on your Trips ever see this.")).toBeInTheDocument();
    expect(screen.getByText("For transfers between Travellers. Never on a Share link.")).toBeInTheDocument();
  });

  it("saves what was typed and says so", async () => {
    render(<TravellerDetailsForm initial={EMPTY} />);
    await userEvent.type(screen.getByLabelText("Mobile"), "0400 111 222");
    await userEvent.type(screen.getByLabelText("Emergency contact name"), "Mum");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(saveTravellerDetails).toHaveBeenCalledWith({ mobile: "0400 111 222", emergencyName: "Mum", emergencyPhone: "", bankDetails: "" });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows a field error from the action", async () => {
    saveTravellerDetails.mockResolvedValue({ success: false, errors: { bankDetails: ["String must contain at most 500 character(s)"] } });
    render(<TravellerDetailsForm initial={EMPTY} />);
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText(/at most 500/)).toBeInTheDocument();
  });
});
```

`app/(app)/account/page.test.tsx` — add `travellerDetails: { findUnique: travellerDetailsFindUniqueMock }` to the `db` mock (hoisted, default `null`), mock the form (`vi.mock("@/components/account/traveller-details-card", () => ({ TravellerDetailsForm: ({ initial }: { initial: { mobile: string | null } }) => <div data-testid="traveller-details-form">{initial.mobile ?? "none"}</div> }))`), and add:

```tsx
  it("renders Your details in the left column under You, prefilled from the viewer's row", async () => {
    travellerDetailsFindUniqueMock.mockResolvedValue({ mobile: "0400", emergencyName: null, emergencyPhone: null, bankDetails: null });
    render(await AccountPage());
    const card = screen.getByRole("region", { name: "Your details" });
    expect(within(card).getByTestId("traveller-details-form")).toHaveTextContent("0400");
    const you = screen.getByRole("region", { name: "You" });
    expect(card.parentElement).toBe(you.parentElement);
    expect(travellerDetailsFindUniqueMock).toHaveBeenCalledWith({ where: { userId: "user-1" }, select: { mobile: true, emergencyName: true, emergencyPhone: true, bankDetails: true } });
  });

  it("renders Your details empty when there is no row yet", async () => {
    render(await AccountPage());
    expect(within(screen.getByRole("region", { name: "Your details" })).getByTestId("traveller-details-form")).toHaveTextContent("none");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/account/traveller-details-card.test.tsx "app/(app)/account/page.test.tsx"`
Expected: FAIL — unresolved import; no "Your details" region.

- [ ] **Step 3: The form**

`components/account/traveller-details-card.tsx`:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTravellerDetails } from "@/server/actions/traveller-details";

export interface TravellerDetailsValues {
  mobile: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  bankDetails: string | null;
}

type Errors = Partial<Record<keyof TravellerDetailsValues, string>>;

/**
 * Traveller details on Account (CONTEXT.md; spec 2026-10-02 §E): the home
 * mobile, an emergency contact and bank details for transfers. The travel
 * number is per Trip and lives on the Trip's Settings. Each helper line says
 * exactly who sees the field, because that is the question a person has
 * before typing a bank account into a travel app.
 */
export function TravellerDetailsForm({ initial }: { initial: TravellerDetailsValues }) {
  const id = React.useId();
  const [values, setValues] = React.useState({
    mobile: initial.mobile ?? "",
    emergencyName: initial.emergencyName ?? "",
    emergencyPhone: initial.emergencyPhone ?? "",
    bankDetails: initial.bankDetails ?? "",
  });
  const [errors, setErrors] = React.useState<Errors>({});
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const set = (key: keyof TravellerDetailsValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await saveTravellerDetails(values);
      if (result.success) {
        setSaved(true);
      } else {
        const next: Errors = {};
        for (const key of Object.keys(values) as Array<keyof TravellerDetailsValues>) {
          const msg = result.errors[key]?.[0];
          if (msg) next[key] = msg;
        }
        setErrors(next);
      }
    });
  }

  const field = (
    key: keyof TravellerDetailsValues,
    label: string,
    help: string,
    control: "input" | "textarea",
    extra: Record<string, unknown> = {},
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      {control === "input" ? (
        <Input id={`${id}-${key}`} value={values[key]} onChange={set(key)} invalid={Boolean(errors[key])} {...extra} />
      ) : (
        <Textarea id={`${id}-${key}`} value={values[key]} onChange={set(key)} rows={3} {...extra} />
      )}
      <p className="text-xs text-muted-foreground">{help}</p>
      {errors[key] && <p className="text-xs font-medium text-destructive">{errors[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {field("mobile", "Mobile", "Fellow Travellers see this; a Share link only if its Contact details dial is on.", "input", { inputMode: "tel", autoComplete: "tel", maxLength: 40 })}
      {field("emergencyName", "Emergency contact name", "Only the people on your Trips ever see this.", "input", { maxLength: 80 })}
      {field("emergencyPhone", "Emergency contact number", "Only the people on your Trips ever see this.", "input", { inputMode: "tel", maxLength: 40 })}
      {field("bankDetails", "Bank details", "For transfers between Travellers. Never on a Share link.", "textarea", { maxLength: 500 })}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="md" loading={pending} disabled={pending}>
          Save details
        </Button>
        {saved && (
          <p role="status" className="text-sm font-semibold text-muted-foreground">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
```

(The two "Only the people on your Trips ever see this." lines are intentionally identical; the test's `getByText` for it must become `getAllByText(...).length === 2` — update the test accordingly.)

- [ ] **Step 4: The page**

`app/(app)/account/page.tsx`: import `TravellerDetailsForm` and add to the `Promise.all` a fifth read:

```ts
    db.travellerDetails.findUnique({
      where: { userId: user.id },
      select: { mobile: true, emergencyName: true, emergencyPhone: true, bankDetails: true },
    }),
```

(destructured as `travellerDetails`). In the left column, after the Admin queue card:

```tsx
          {/* ── Traveller details (spec 2026-10-02 §E) — what you tell the
              people you travel with; the travel number is per Trip, on its
              Settings. ── */}
          <Card role="region" aria-labelledby="account-details" className="p-[18px]">
            <CardTitle id="account-details">Your details</CardTitle>
            <div className="mt-3.5">
              <TravellerDetailsForm
                initial={travellerDetails ?? { mobile: null, emergencyName: null, emergencyPhone: null, bankDetails: null }}
              />
            </div>
          </Card>
```

- [ ] **Step 5: Run the tests and gates**

Run: `TZ=UTC npx vitest run components/account/traveller-details-card.test.tsx "app/(app)/account/page.test.tsx" && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/account/traveller-details-card.tsx components/account/traveller-details-card.test.tsx "app/(app)/account/page.tsx" "app/(app)/account/page.test.tsx"
git commit -m "feat(account): Your details — home mobile, emergency contact, bank details

Each field says who sees it. Spec 2026-10-02 §E.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Travellers' details on the Trip's Settings, with the travel number

**Files:**
- Create: `components/trip/settings/traveller-details-list.tsx`, `components/trip/settings/traveller-details-list.test.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx` (members select; render the list under `InvitePanel`)
- Test: `app/(app)/trips/[tripId]/settings/page.test.tsx`

**Interfaces:**
- Consumes: `saveTravelNumber` (Task 13); `TravellerAvatar`, `travellerName` (`lib/traveller.ts`); `Input`, `Button`.
- Produces:
  ```ts
  export interface TravellerDetailsRow {
    userId: string;
    user: TravellerLike & { email: string | null };
    travelNumber: string | null;
    details: { mobile: string | null; emergencyName: string | null; emergencyPhone: string | null; bankDetails: string | null } | null;
  }
  export function TravellerDetailsList({ tripId, rows, currentUserId }: { tripId: string; rows: TravellerDetailsRow[]; currentUserId: string })
  ```

- [ ] **Step 1: Write the failing tests**

`components/trip/settings/traveller-details-list.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveTravelNumber = vi.fn();
vi.mock("@/server/actions/traveller-details", () => ({ get saveTravelNumber() { return saveTravelNumber; } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { TravellerDetailsList } from "./traveller-details-list";

const alice = { id: "u1", name: "Alice", image: null, email: null };
const bob = { id: "u2", name: "Bob", image: null, email: null };

beforeEach(() => saveTravelNumber.mockReset().mockResolvedValue({ success: true }));

describe("TravellerDetailsList", () => {
  it("lists each Traveller's filled-in details, omitting blanks, and says when there are none", () => {
    render(
      <TravellerDetailsList
        tripId="t1"
        currentUserId="u1"
        rows={[
          { userId: "u1", user: alice, travelNumber: "+39 333 1", details: { mobile: "0400", emergencyName: "Mum", emergencyPhone: "0411", bankDetails: null } },
          { userId: "u2", user: bob, travelNumber: null, details: null },
        ]}
      />,
    );
    const a = within(screen.getByRole("listitem", { name: "Alice" }));
    expect(a.getByText("0400")).toBeInTheDocument();
    expect(a.getByText("Mum · 0411")).toBeInTheDocument();
    expect(a.queryByText(/Bank details/)).toBeNull();
    const b = within(screen.getByRole("listitem", { name: "Bob" }));
    expect(b.getByText("No details yet")).toBeInTheDocument();
  });

  it("the viewer's row has the travel number field and an Edit on Account link; others are read-only", async () => {
    render(
      <TravellerDetailsList
        tripId="t1"
        currentUserId="u1"
        rows={[
          { userId: "u1", user: alice, travelNumber: null, details: null },
          { userId: "u2", user: bob, travelNumber: "+1 555", details: null },
        ]}
      />,
    );
    const a = within(screen.getByRole("listitem", { name: "Alice" }));
    expect(a.getByRole("link", { name: "Edit on Account" }).getAttribute("href")).toBe("/account");
    expect(a.getByText("The number you'll have on this trip — an eSIM or local SIM.")).toBeInTheDocument();
    await userEvent.type(a.getByLabelText("Travel number"), "+39 333 9");
    await userEvent.click(a.getByRole("button", { name: "Save travel number" }));
    expect(saveTravelNumber).toHaveBeenCalledWith("t1", "+39 333 9");
    const b = within(screen.getByRole("listitem", { name: "Bob" }));
    expect(b.getByText("+1 555")).toBeInTheDocument();
    expect(b.queryByLabelText("Travel number")).toBeNull();
  });
});
```

`app/(app)/trips/[tripId]/settings/page.test.tsx` — find the `trip.findUnique` fixture's `members` entries and add `travelNumber: null` and `user.travellerDetails: null` to each; mock the list (`vi.mock("@/components/trip/settings/traveller-details-list", () => ({ TravellerDetailsList: ({ rows }: { rows: Array<{ userId: string }> }) => <div data-testid="traveller-details-list">{rows.length}</div> }))`); add:

```tsx
  it("renders the Travellers' details list under the members, with one row per member", async () => {
    render(await SettingsPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByTestId("traveller-details-list")).toHaveTextContent(String(MEMBER_COUNT));
    const select = mockDb.trip.findUnique.mock.calls[0][0].select.members.select;
    expect(select.travelNumber).toBe(true);
    expect(select.user.select.travellerDetails).toEqual({ select: { mobile: true, emergencyName: true, emergencyPhone: true, bankDetails: true } });
  });
```

(`MEMBER_COUNT` = the number of members in the fixture; use the fixture's own constant or the literal.)

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/trip/settings/traveller-details-list.test.tsx "app/(app)/trips/[tripId]/settings/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: The list**

`components/trip/settings/traveller-details-list.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { travellerName, type TravellerLike } from "@/lib/traveller";
import { saveTravelNumber } from "@/server/actions/traveller-details";

export interface TravellerDetailsRow {
  userId: string;
  user: TravellerLike & { email: string | null };
  travelNumber: string | null;
  details: { mobile: string | null; emergencyName: string | null; emergencyPhone: string | null; bankDetails: string | null } | null;
}

function TravelNumberField({ tripId, initial }: { tripId: string; initial: string | null }) {
  const id = React.useId();
  const [value, setValue] = React.useState(initial ?? "");
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      className="mt-2 flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await saveTravelNumber(tripId, value);
          setSaved(result.success);
        });
      }}
    >
      <Label htmlFor={id}>Travel number</Label>
      <div className="flex gap-2">
        <Input id={id} value={value} inputMode="tel" maxLength={40} onChange={(e) => { setSaved(false); setValue(e.target.value); }} />
        <Button type="submit" variant="outline" size="md" loading={pending} disabled={pending} aria-label="Save travel number">
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">The number you&apos;ll have on this trip — an eSIM or local SIM.</p>
      {saved && <p role="status" className="text-xs font-semibold text-muted-foreground">Saved.</p>}
    </form>
  );
}

/**
 * Every Traveller's details on this Trip (CONTEXT.md "Traveller details";
 * spec 2026-10-02 §E): mobile, travel number, emergency contact, bank
 * details — whichever are filled. Members only (the Settings page's guard).
 * The viewer edits their own travel number here, since it belongs to this
 * Trip; everything else is edited on Account.
 */
export function TravellerDetailsList({ tripId, rows, currentUserId }: { tripId: string; rows: TravellerDetailsRow[]; currentUserId: string }) {
  return (
    <ul className="mt-4 flex flex-col gap-4 border-t-2 border-border-soft pt-4">
      {rows.map((row) => {
        const name = travellerName(row.user);
        const mine = row.userId === currentUserId;
        const d = row.details;
        const lines: Array<[string, string]> = [];
        if (d?.mobile) lines.push(["Mobile", d.mobile]);
        if (row.travelNumber && !mine) lines.push(["Travel number", row.travelNumber]);
        if (d?.emergencyName || d?.emergencyPhone) lines.push(["Emergency contact", [d?.emergencyName, d?.emergencyPhone].filter(Boolean).join(" · ")]);
        if (d?.bankDetails) lines.push(["Bank details", d.bankDetails]);
        return (
          <li key={row.userId} aria-label={name} className="flex gap-3">
            <TravellerAvatar traveller={row.user} size={32} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{name}</p>
              {lines.length === 0 && !(mine && row.travelNumber) ? (
                <p className="text-xs text-muted-foreground">No details yet</p>
              ) : (
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                  {lines.map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
                      <dd className="whitespace-pre-wrap break-words">{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              {mine && (
                <>
                  <TravelNumberField tripId={tripId} initial={row.travelNumber} />
                  <Link href="/account" className="mt-2 inline-block text-xs font-semibold underline-offset-2 hover:underline">
                    Edit on Account
                  </Link>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: The page**

`app/(app)/trips/[tripId]/settings/page.tsx`: in the `trip.findUnique` members select add `travelNumber: true,` beside `role`, and inside `user.select` add `travellerDetails: { select: { mobile: true, emergencyName: true, emergencyPhone: true, bankDetails: true } },`. Import `TravellerDetailsList` and render it directly after `<InvitePanel … />` inside the Travellers card:

```tsx
              <TravellerDetailsList
                tripId={tripId}
                currentUserId={user.id}
                rows={trip.members.map((m) => ({
                  userId: m.userId,
                  user: m.user,
                  travelNumber: m.travelNumber,
                  details: m.user.travellerDetails,
                }))}
              />
```

`InvitePanel`'s `Member` type takes `user: TravellerLike & { email: string }`; the extra `travellerDetails` field on the selected user is structurally fine for it.

- [ ] **Step 5: Run the tests and gates**

Run: `TZ=UTC npx vitest run components/trip/settings "app/(app)/trips/[tripId]/settings" && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/trip/settings/traveller-details-list.tsx components/trip/settings/traveller-details-list.test.tsx "app/(app)/trips/[tripId]/settings/page.tsx" "app/(app)/trips/[tripId]/settings/page.test.tsx"
git commit -m "feat(settings): each Traveller's details under the members, with the viewer's travel number

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: The Contact details dial, and numbers under each Traveller on the share hero

**Files:**
- Modify: `server/actions/share.ts` (`ShareLinkView`, `ShareScopeInput`, `LINK_SELECT`, `LinkRow`, `toView`, `scopeData`, `createShareLink`'s create data), `server/actions/share.test.ts`
- Modify: `components/trip/settings/share-links-panel.tsx` (`FULL_SCOPE`; new `ContactsDial`; rendered after `TravellersDial` in both forms), `components/trip/settings/share-links-panel.test.tsx`
- Modify: `lib/share-lookup.ts` (`findShareLink` select)
- Modify: `lib/share-traveller.ts` (`ShareTraveller.mobile?`, `.travelNumber?`; `shareTraveller(u, opts)` gains `contacts?`)
- Modify: `app/share/[token]/page.tsx:300-313` (members query; traveller mapping)
- Modify: `app/share/[token]/share-hero.tsx` (numbers under the names), `app/share/[token]/share-hero.test.tsx`
- Test: `app/share/[token]/page.test.tsx`

**Interfaces:**
- Consumes: `ShareLink.includeContacts`, `TripMember.travelNumber`, `TravellerDetails.mobile` (Task 13).
- Produces: `ShareScopeInput.includeContacts?: boolean`; `ShareLinkView.includeContacts: boolean`; `ShareTraveller.mobile?: string | null; travelNumber?: string | null`; `shareTraveller(u, { token, showPhoto, contacts?: { mobile: string | null; travelNumber: string | null } })`.

- [ ] **Step 1: Write the failing tests**

`server/actions/share.test.ts` — find the tests for create defaults and for `updateShareLink` scope and add, in the same style:

```ts
  it("creates a link with includeContacts off unless asked (spec 2026-10-02 §E)", async () => {
    shareCreateMock.mockResolvedValue(row());
    await createShareLink(TRIP_ID, { label: "Group chat" });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeContacts: false }) }),
    );
  });

  it("honours an explicit includeContacts: true on create and update, and the view carries it", async () => {
    shareCreateMock.mockResolvedValue(row({ includeContacts: true }));
    await createShareLink(TRIP_ID, { label: "Mum & Dad", includeContacts: true });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeContacts: true }) }),
    );
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ includeContacts: true }));
    const result = await updateShareLink(TRIP_ID, LINK_ID, { includeContacts: true });
    expect(shareUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ data: { includeContacts: true } }));
    expect(result.success && result.link.includeContacts).toBe(true);
  });
```

(The file's `row()` helper gains `includeContacts: false` in its defaults, beside `showTravellers: false`.)

`components/trip/settings/share-links-panel.test.tsx` — beside "offers a 'Show who's going' switch":

```tsx
  it("offers a Contact details switch, off by default, disabled until Show who's going is on", async () => {
    createShareLink.mockResolvedValue({ success: true, link: link({ id: "new", label: "Nana", showTravellers: true, includeContacts: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    const contacts = screen.getByRole("switch", { name: /contact details/i });
    expect(contacts).toHaveAttribute("aria-checked", "false");
    expect(contacts).toBeDisabled();
    expect(screen.getByText('Each Traveller\'s phone numbers under their name — only with "Show who\'s going" on.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: /show who's going/i }));
    expect(contacts).toBeEnabled();
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(contacts);
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(createShareLink).toHaveBeenCalledWith("t", expect.objectContaining({ showTravellers: true, includeContacts: true }));
  });

  it("saves an includeContacts edit through updateShareLink", async () => {
    updateShareLink.mockResolvedValue({ success: true, link: link({ showTravellers: true, includeContacts: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("switch", { name: /show who's going/i }));
    await userEvent.click(screen.getByRole("switch", { name: /contact details/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateShareLink).toHaveBeenCalledWith("t", "l1", expect.objectContaining({ showTravellers: true, includeContacts: true }));
  });
```

(The file's `link()` fixture helper gains `includeContacts: false` in its defaults.)

`app/share/[token]/share-hero.test.tsx` — beside the travellers test:

```tsx
  it("shows each Traveller's numbers, labelled, when given — and nothing when not", () => {
    const { rerender } = render(
      <ShareHero
        {...base}
        travellers={[
          { id: "u1", name: "Cameron", firstName: "Cameron", image: null, focalX: null, focalY: null, mobile: "0400 000 000", travelNumber: "+39 333 1" },
          { id: "u2", name: "Xan", firstName: "Xan", image: null, focalX: null, focalY: null, mobile: null, travelNumber: null },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Contact details" });
    expect(within(list).getByText("Cameron")).toBeInTheDocument();
    expect(within(list).getByText("Mobile 0400 000 000")).toBeInTheDocument();
    expect(within(list).getByText("Travel number +39 333 1")).toBeInTheDocument();
    expect(within(list).queryByText("Xan")).toBeNull();
    rerender(<ShareHero {...base} travellers={[{ id: "u1", name: "Cameron", firstName: "Cameron", image: null, focalX: null, focalY: null }]} />);
    expect(screen.queryByRole("list", { name: "Contact details" })).toBeNull();
  });
```

(`base` is the file's existing `ShareHeroProps` fixture.)

`app/share/[token]/page.test.tsx`:
- in the "never selects private fields" test, extend `FORBIDDEN` with `"bankDetails", "emergencyName", "emergencyPhone"`.
- add:

```tsx
  it("selects and shows the numbers only with both Show who's going and Contact details on (Review Focus 5)", async () => {
    tripMemberFindManyMock.mockResolvedValue([
      { ...MEMBER, travelNumber: "+39 333 1", user: { ...MEMBER.user, travellerDetails: { mobile: "0400 000 000" } } },
    ]);
    shareFindUniqueMock.mockResolvedValue({ ...share(), showTravellers: true, includeContacts: true });
    await renderPage();
    const sel = tripMemberFindManyMock.mock.calls[0][0].select;
    expect(sel.travelNumber).toBe(true);
    expect(sel.user.select.travellerDetails).toEqual({ select: { mobile: true } });
    for (const k of ["bankDetails", "emergencyName", "emergencyPhone", "email"]) {
      expect(JSON.stringify(sel)).not.toContain(k);
    }
    expect(screen.getByText("Mobile 0400 000 000")).toBeInTheDocument();
    expect(screen.getByText("Travel number +39 333 1")).toBeInTheDocument();
  });

  it("includeContacts without showTravellers selects nothing extra and runs no member query", async () => {
    shareFindUniqueMock.mockResolvedValue({ ...share(), showTravellers: false, includeContacts: true });
    await renderPage();
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run server/actions/share.test.ts components/trip/settings/share-links-panel.test.tsx "app/share/[token]"`
Expected: FAIL across all four.

- [ ] **Step 3: The action and the panel**

`server/actions/share.ts`: add `includeContacts: boolean;` to `ShareLinkView` and `LinkRow`, `includeContacts?: boolean;` to `ShareScopeInput` (doc: `/** "Contact details" (spec 2026-10-02 §E) — phone numbers under each Traveller; off by default and only honoured with showTravellers. */`), `includeContacts: true,` to `LINK_SELECT`, `includeContacts: row.includeContacts,` in `toView`, `if (input.includeContacts !== undefined) data.includeContacts = input.includeContacts;` in `scopeData`, and `includeContacts: input.includeContacts ?? false,` in `createShareLink`'s create data beside `showTravellers`.

`components/trip/settings/share-links-panel.tsx`: `FULL_SCOPE` gains `includeContacts: false`; add after `TravellersDial`:

```tsx
/**
 * The "Contact details" dial (spec 2026-10-02 §E): each Traveller's home
 * mobile and travel number under their name on the hero. Only meaningful
 * with "Show who's going" on, so it is disabled (and treated as off) until
 * that is. Same Switch-plus-helper markup as the two dials above it.
 */
function ContactsDial({
  checked,
  onChange,
  idPrefix,
  enabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  idPrefix: string;
  enabled: boolean;
}) {
  const id = `${idPrefix}-includeContacts`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm text-foreground">
          Contact details
        </label>
        <Switch id={id} checked={checked && enabled} onCheckedChange={onChange} disabled={!enabled} aria-label="Contact details" />
      </div>
      <p className="text-xs text-muted-foreground">
        Each Traveller&apos;s phone numbers under their name — only with &quot;Show who&apos;s going&quot; on.
      </p>
    </div>
  );
}
```

and render it after each `TravellersDial` (edit form and new form):

```tsx
          <ContactsDial
            idPrefix={`edit-${link.id}`}
            checked={scope.includeContacts}
            enabled={scope.showTravellers}
            onChange={(v) => setScope({ ...scope, includeContacts: v })}
          />
```

(and the `new-link` / `newScope` twin). If the panel's `scope` state is initialised from `link` fields, include `includeContacts: link.includeContacts`.

- [ ] **Step 4: The lookup, the traveller, the page, the hero**

`lib/share-lookup.ts` `findShareLink` select: add `includeContacts: true,` after `showTravellers: true,`.

`lib/share-traveller.ts`:

```ts
export interface ShareTraveller {
  id: string;
  name: string;
  firstName: string;
  image: string | null;
  focalX: number | null;
  focalY: number | null;
  /** Only with the link's Contact details dial on (spec 2026-10-02 §E); absent otherwise. */
  mobile?: string | null;
  travelNumber?: string | null;
}

export function shareTraveller(
  u: TravellerLike,
  opts: { token: string; showPhoto: boolean; contacts?: { mobile: string | null; travelNumber: string | null } },
): ShareTraveller {
  // … existing body unchanged …
  return {
    id: u.id,
    name: travellerName(named),
    firstName: travellerFirstName(named),
    image,
    focalX: opts.showPhoto ? u.photoFocalX ?? null : null,
    focalY: opts.showPhoto ? u.photoFocalY ?? null : null,
    ...(opts.contacts ? { mobile: opts.contacts.mobile, travelNumber: opts.contacts.travelNumber } : {}),
  };
}
```

`app/share/[token]/page.tsx` (lines ~300-313):

```ts
  // "Show who's going" (ADR 0051 amendment 2026-09-30): off means this query
  // never runs. TRAVELLER_SELECT carries no email; never add it here. With
  // "Contact details" also on (spec 2026-10-02 §E) the select adds exactly
  // the two numbers — never bankDetails, the emergency contact or email.
  const contacts = shareLink.showTravellers && shareLink.includeContacts;
  const members = shareLink.showTravellers
    ? await db.tripMember.findMany({
        where: { tripId },
        orderBy: { createdAt: "asc" },
        select: contacts
          ? { travelNumber: true, user: { select: { ...TRAVELLER_SELECT, travellerDetails: { select: { mobile: true } } } } }
          : { user: { select: TRAVELLER_SELECT } },
      })
    : [];
  const travellers = members.map((m) =>
    shareTraveller(m.user, {
      token,
      showPhoto: true,
      ...(contacts && "travelNumber" in m
        ? { contacts: { mobile: (m.user as { travellerDetails?: { mobile: string | null } | null }).travellerDetails?.mobile ?? null, travelNumber: m.travelNumber ?? null } }
        : {}),
    }),
  );
```

(Prisma types the two selects as a union; the `"travelNumber" in m` narrowing keeps it honest without a cast on `m` itself.)

`app/share/[token]/share-hero.tsx` — after the travellers' names block (`{travellers.length > 0 ? (…) : null}`), add:

```tsx
        {travellers.some((t) => t.mobile || t.travelNumber) ? (
          <ul aria-label="Contact details" data-slot="share-contacts" className="mt-3 flex flex-col gap-1 text-[13px]">
            {travellers
              .filter((t) => t.mobile || t.travelNumber)
              .map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-bold">{t.firstName}</span>
                  {t.mobile ? <span>Mobile {t.mobile}</span> : null}
                  {t.travelNumber ? <span>Travel number {t.travelNumber}</span> : null}
                </li>
              ))}
          </ul>
        ) : null}
```

(The hero test looks for the full name `Cameron` — the fixture's `firstName` is also `Cameron`; keep `firstName` here to match the names row above it.)

- [ ] **Step 5: Run the tests and gates**

Run: `TZ=UTC npx vitest run server/actions/share.test.ts components/trip/settings "app/share/[token]" lib/share-traveller.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (drop a test path that does not exist). The share-style-bans test must still pass on the hero.

- [ ] **Step 6: Commit**

```bash
git add server/actions/share.ts server/actions/share.test.ts components/trip/settings/share-links-panel.tsx components/trip/settings/share-links-panel.test.tsx lib/share-lookup.ts lib/share-traveller.ts "app/share/[token]/page.tsx" "app/share/[token]/page.test.tsx" "app/share/[token]/share-hero.tsx" "app/share/[token]/share-hero.test.tsx"
git commit -m "feat(share): the Contact details dial — phone numbers under each Traveller

Off by default, only with Show who's going; the share select adds exactly
mobile and travelNumber, never the emergency contact, bank details or
email. Spec 2026-10-02 §E.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Part G — Docs and the whole-branch gates

### Task 17: Docs, ADR amendments, and the gates

**Files:**
- Modify: `lib/admin-notify.ts` (doc comment, the "no mail dependency" sentence)
- Modify: `docs/adr/0057-one-door-sign-in-allowlist.md` (append an amendment)
- Modify: `docs/adr/0051-share-links-per-audience-with-a-never-shared-floor.md` (append an amendment)
- Modify: `docs/resendDeploy.md` (one line)
- Modify: `docs/specs/2026-10-02-install-nudge-approval-email-files-ideas.md` (status line)

- [ ] **Step 1: admin-notify**

In `lib/admin-notify.ts` replace `Notify the operator in-app. TEEPEE has no mail dependency of any kind\n * (ADRs 0047, 0050) — reuse web-push and the account-level Devices (ADR 0048).` with:

```
 * Notify the operator in-app. Operator notifications stay on web-push and
 * the account-level Devices (ADR 0048); the app's only mail is through
 * lib/mail.ts — the Sign-in link and the approval email (spec 2026-10-02
 * §B) — and neither is a channel to the operator.
```

- [ ] **Step 2: ADR amendments**

Append to `docs/adr/0057-one-door-sign-in-allowlist.md`:

```markdown
## Amendment — 2026-10-02 (`feat/nudge-email-files-ideas-2026-10-02`, spec 2026-10-02 §B)

**Approval emails the address; Dismiss never does.** `approveAccessRequest`
sends one email through `lib/mail.ts` after — never before — the
`AllowedEmail` row and `resolvedAt` are written, and a failed or
unconfigured send can never undo the approval: the action reports
`mailed: false` and the Admin is told to tell them. The email's button goes
to the Landing, not a minted Sign-in link: minting outside Auth.js's own
send pass would bypass the two-pass proof above, and the Google path is the
common one. Dismiss stays silent, which is exactly what the refusal panel
promises — telling someone they were declined would make the panel an
oracle after the fact.
```

Append to `docs/adr/0051-share-links-per-audience-with-a-never-shared-floor.md`:

```markdown
## Amendment — 2026-10-02 (`feat/nudge-email-files-ideas-2026-10-02`, spec 2026-10-02 §E)

**A sixth dial, "Contact details", and three more floor entries.** With
"Show who's going" on, a link may also carry each Traveller's home mobile
and travel number (CONTEXT.md "Traveller details") — off by default and off
on every existing link, and the member select adds exactly those two
columns only when both dials are on. The floor gains the emergency contact,
bank details and (restated) the sign-in email: a Share link is a public,
forwardable URL, and none of those belongs on one whatever the audience.
The floor stays structural — the share lookup never selects them.
```

- [ ] **Step 3: resendDeploy + spec status**

`docs/resendDeploy.md`: after the paragraph beginning "The sent copy is identical…", add: `The approval email (sent when an Admin approves an Access request) uses the same two vars; without them, approving still works and the admin panel says no email went.`

Spec: replace the two status lines with `**Status:** built on the branch (plan docs/superpowers/plans/2026-10-02-nudge-email-files-ideas.md); awaiting merge and deploy.`

- [ ] **Step 4: Gates**

```bash
npx tsc --noEmit && npm run lint && npm test
```

`npm test` is the full suite; the only acceptable failure is the known `lib/help-guide.test.ts` drift-guard timeout, which must then pass alone (`TZ=UTC npx vitest run lib/help-guide.test.ts`). List every failing test by file and name; anything else is this branch's — report it as DONE_WITH_CONCERNS with the output, do not fix it. Then `npm run build`; a failure only because `DATABASE_URL` is unreachable is environmental (say so); any other build error is this branch's.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-notify.ts docs/adr/0057-one-door-sign-in-allowlist.md docs/adr/0051-share-links-per-audience-with-a-never-shared-floor.md docs/resendDeploy.md docs/specs/2026-10-02-install-nudge-approval-email-files-ideas.md
git commit -m "docs: approval email and Contact details dial — ADR 0057 and 0051 amendments; admin-notify names lib/mail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline main..HEAD
```

Expected: eighteen commits on the branch (inbox + seventeen), none on `main`.
