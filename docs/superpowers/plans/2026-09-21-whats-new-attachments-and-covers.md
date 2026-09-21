# What's New, Attachments & Cover Fill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three Traveller-visible changes in one release — attachments open in a new tab when they can be previewed, portrait cover photos fill their box instead of sitting in grey bars, and a **What's new** surface tells returning Travellers what changed.

**Architecture:** Three independent slices. (1) A single `rendersInline(mime)` predicate shared by the attachment serve route and every attachment link, so "renders in place" and "opens in a new tab" can never disagree. (2) `TripCover` gains a blurred backdrop layer of the same image behind the uncropped foreground, plus taller boxes on mobile. (3) **Release note**s are a typed constant in the bundle (`lib/release-notes.ts`), and per-person read state is one nullable column on `User`, where `NULL` means "caught up as of account creation" rather than "has seen nothing".

**Tech Stack:** Next.js App Router (server components + `"use server"` actions), Prisma 7 with `@prisma/adapter-pg`, Tailwind, Vitest + Testing Library (jsdom), Zod.

## Global Constraints

- **Terminology is a contract** (`CONTEXT.md` §"Feedback on the app itself"). The entity is a **Release note**; the surface is **What's new**. Never call one a "Note" (that's trip content), an "update" (as a noun — **Activity** avoids it for the same reason), a "changelog entry", "announcement", "patch note" or "version". In code, UI copy, comments and commit messages.
- A **Release note** is *one line*, in a Traveller's language, and only for a change a Traveller would notice. Most work ships with no Release note at all.
- **Never run `prisma migrate` against any database.** Migrations are written and committed only; applying them is the operator's call on deploy.
- **Never run `npm run feedback:resolve`.** It writes to production. Closing Xanthia's note is a hand-back step after merge.
- Tests: `npm test` (`TZ=UTC vitest run`). Test files are colocated (`lib/foo.ts` → `lib/foo.test.ts`).
- Work stays on branch `chore/session-2026-09-21`. Do not commit to `main`, do not merge, do not deploy.
- Every new column must be **additive on reads and writes** per `docs/DEPLOY.md` §4b — nullable, nothing renamed or dropped.

---

### Task 1: The shared `rendersInline` predicate

The serve route already decides inline-vs-download from the MIME type. Extract that decision so the link components can ask the same question, rather than re-deriving it and drifting.

**Files:**
- Create: `lib/attachment-display.ts`
- Create: `lib/attachment-display.test.ts`
- Modify: `app/api/attachments/[id]/route.ts:89-91`

**Interfaces:**
- Consumes: nothing.
- Produces: `rendersInline(mime: string): boolean` from `@/lib/attachment-display`. Tasks 2 uses it at four call sites.

- [ ] **Step 1: Write the failing test**

Create `lib/attachment-display.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rendersInline } from "./attachment-display";

describe("rendersInline", () => {
  it("is true for images, which the browser renders in place", () => {
    expect(rendersInline("image/jpeg")).toBe(true);
    expect(rendersInline("image/png")).toBe(true);
    expect(rendersInline("image/heic")).toBe(true);
  });

  it("is true for PDFs", () => {
    expect(rendersInline("application/pdf")).toBe(true);
  });

  it("is false for types the browser downloads instead of showing", () => {
    expect(rendersInline("application/msword")).toBe(false);
    expect(rendersInline("text/calendar")).toBe(false);
    expect(rendersInline("application/zip")).toBe(false);
    expect(rendersInline("application/octet-stream")).toBe(false);
  });

  it("is false for an empty or unknown mime", () => {
    expect(rendersInline("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/attachment-display.test.ts`
Expected: FAIL — `Failed to resolve import "./attachment-display"`.

- [ ] **Step 3: Write the implementation**

Create `lib/attachment-display.ts`:

```ts
/**
 * Whether the browser will render this attachment in place rather than
 * downloading it.
 *
 * This single predicate decides two things that must never disagree:
 *
 *   1. the `Content-Disposition` the serve route sends
 *      (`inline` vs `attachment`), and
 *   2. whether an attachment link opens in a new tab.
 *
 * If they drift, a file the browser *downloads* gets `target="_blank"` and
 * the Traveller is handed a blank tab that never navigates anywhere. Keeping
 * both callers on one expression is the entire reason this module exists —
 * do not re-derive the condition at a call site.
 */
export function rendersInline(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/attachment-display.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Point the serve route at the shared predicate**

In `app/api/attachments/[id]/route.ts`, add to the imports at the top:

```ts
import { rendersInline } from "@/lib/attachment-display";
```

Then replace lines 89-91:

```ts
  // 4. Response headers (used by both the presigned and the streamed path).
  const isInline =
    attachment.mime.startsWith("image/") || attachment.mime === "application/pdf";
```

with:

```ts
  // 4. Response headers (used by both the presigned and the streamed path).
  // Shared with the attachment links (lib/attachment-display.ts) so a file the
  // browser downloads is never given a new tab it would leave empty.
  const isInline = rendersInline(attachment.mime);
```

- [ ] **Step 6: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS. The route's existing tests (`app/api/serve-route-caching.test.ts`) still pass — behaviour is byte-identical, only the expression moved.

- [ ] **Step 7: Commit**

```bash
git add lib/attachment-display.ts lib/attachment-display.test.ts "app/api/attachments/[id]/route.ts"
git commit -m "refactor(attachments): one predicate decides inline vs download"
```

---

### Task 2: Attachment links open in a new tab — outside the installed PWA

Xanthia asked for a new tab. **ADR 0043 (2026-09-14, commit `9eb6dac`) deliberately made these links same-tab** so a Traveller offline in the installed PWA can open a cached boarding pass — a `target="_blank"` there hands off to an in-app browser the service worker does not reach. A live test enforces it: `components/trip/attachment-links.test.tsx:15-19`, "opens attachments in-app so the offline cache can serve them", asserts the link has **no** `target`.

Both are right, about different contexts. In an ordinary browser tab a new same-origin tab is controlled by the *same* service worker, so the cached attachment is served exactly as it is in the current tab — the risk ADR 0043 names cannot occur. In the installed PWA it can. So ADR 0043 is **narrowed, not superseded** (operator decision, 2026-09-21).

**The mechanism matters.** The decision is made at *click time*, in an `onClick` handler — the markup keeps **no `target` attribute at all**. That is deliberate and load-bearing:

- ADR 0043's existing test keeps passing **verbatim**, because the invariant it pins (no `target` in the markup) remains true.
- No server/client hydration mismatch — nothing about the rendered HTML depends on `window`.
- Without JavaScript, behaviour is exactly today's same-tab navigation.
- Middle-click, ⌘-click and "Open in new tab" keep working as the browser intends, because `href` is untouched.

**Files:**
- Create: `lib/standalone.ts`
- Create: `lib/standalone.test.ts`
- Create: `components/trip/attachment-link.tsx`
- Create: `components/trip/attachment-link.test.tsx`
- Modify: `components/account/device-state.ts:31-36` (reuse the extracted helper)
- Modify: `components/trip/attachment-list.tsx:218-224`
- Modify: `components/trip/attachment-links.tsx`
- Modify: `components/trip/journal-editor.tsx:83-86`
- Modify: `app/(app)/trips/[tripId]/journal/page.tsx:134-138`
- Modify: `docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md` (append an amendment)

**Interfaces:**
- Consumes: `rendersInline(mime: string): boolean` from `@/lib/attachment-display` (Task 1).
- Produces: `isStandalone(): boolean` from `@/lib/standalone`; `AttachmentLink` from `@/components/trip/attachment-link`.

All four sites carry `AttachmentView` objects (`components/trip/attachment-list.tsx:26-34`), which include `mime` — journal photos included.

- [ ] **Step 1: Write the failing test for the standalone helper**

Create `lib/standalone.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { isStandalone } from "./standalone";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
});

describe("isStandalone", () => {
  it("is true when the display-mode media query matches", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(isStandalone()).toBe(true);
  });

  it("is true for iOS Safari's legacy navigator.standalone flag", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    (window.navigator as Navigator & { standalone?: boolean }).standalone = true;
    expect(isStandalone()).toBe(true);
  });

  it("is false in an ordinary browser tab", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(isStandalone()).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    // Older engines, and any environment where the query cannot be asked:
    // assume a browser tab rather than claiming installed.
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia = undefined;
    expect(isStandalone()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/standalone.test.ts`
Expected: FAIL — `Failed to resolve import "./standalone"`.

- [ ] **Step 3: Write the standalone helper**

Create `lib/standalone.ts`:

```ts
/**
 * Whether this page is running as an installed PWA rather than a browser tab.
 *
 * The distinction decides where an **Attachment** opens. ADR 0043 made
 * attachment links same-tab so a Traveller offline can open a cached ticket:
 * inside the installed app, a new tab is handed to an in-app browser the
 * service worker does not control, and the cached bytes are unreachable. In an
 * ordinary browser tab that does not apply — a new same-origin tab is
 * controlled by the *same* service worker — so there the link may open out.
 *
 * Browser-only: returns false during server rendering, which is also the
 * safe default (same-tab, today's behaviour).
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/standalone.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Reuse it in the existing iOS check**

`components/account/device-state.ts` already inlines this exact detection. Point it at the shared helper so display-mode knowledge has one home.

Add to the imports of `components/account/device-state.ts`:

```ts
import { isStandalone } from "@/lib/standalone";
```

and replace lines 31-35:

```ts
  if (!isIos) return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
```

with:

```ts
  if (!isIos) return false;
  return !isStandalone();
```

- [ ] **Step 6: Write the failing test for the shared link**

Create `components/trip/attachment-link.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/standalone", () => ({ isStandalone: vi.fn() }));

import { isStandalone } from "@/lib/standalone";
import { AttachmentLink } from "./attachment-link";

const mockIsStandalone = isStandalone as unknown as ReturnType<typeof vi.fn>;

describe("AttachmentLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("open", vi.fn());
  });

  it("opens a previewable file in a new tab in an ordinary browser tab", () => {
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(window.open).toHaveBeenCalledWith("/api/attachments/a1", "_blank", "noopener");
    expect(event.defaultPrevented).toBe(true);
  });

  it("stays in-app inside the installed PWA, so the offline cache can serve it (ADR 0043)", () => {
    mockIsStandalone.mockReturnValue(true);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(window.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a downloadable file alone — a download never navigates", () => {
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a2" mime="application/msword" label="View notes.docx">
        notes.docx
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View notes.docx" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(window.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("never renders a target attribute, whatever the context", () => {
    // ADR 0043's invariant: the decision is made at click time, so the markup
    // is identical in both contexts and needs no hydration-sensitive branch.
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    expect(screen.getByRole("link", { name: "View ticket.pdf" })).not.toHaveAttribute("target");
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run components/trip/attachment-link.test.tsx`
Expected: FAIL — `Failed to resolve import "./attachment-link"`.

- [ ] **Step 8: Write the shared link component**

Create `components/trip/attachment-link.tsx`:

```tsx
"use client";

import * as React from "react";
import { rendersInline } from "@/lib/attachment-display";
import { isStandalone } from "@/lib/standalone";

/**
 * The one way an **Attachment** is linked to, everywhere.
 *
 * Opening an attachment used to navigate away from the page a Traveller was
 * working on, which is what they asked us to fix. But ADR 0043 made these
 * links same-tab on purpose: inside the installed PWA, a new tab is handed to
 * an in-app browser the service worker does not control, and an offline
 * Traveller's cached boarding pass becomes unreachable. Both concerns are
 * real — they are just about different places, so the choice is made per
 * context:
 *
 *   ordinary browser tab  → open out (same service worker, cache intact)
 *   installed PWA         → stay in-app (ADR 0043, unchanged)
 *   file the browser downloads → stay put (it never navigates anyway)
 *
 * Decided in the click handler rather than in the markup, so no `target`
 * attribute is ever rendered. That keeps ADR 0043's invariant literally true,
 * avoids a hydration-sensitive branch, degrades to today's behaviour without
 * JavaScript, and leaves ⌘-click and "Open in new tab" to the browser.
 */
export function AttachmentLink({
  href,
  mime,
  label,
  className,
  children,
}: {
  href: string;
  mime: string;
  /** Accessible name; omitted when the children already read as the name. */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!rendersInline(mime)) return;
    if (isStandalone()) return;
    e.preventDefault();
    window.open(href, "_blank", "noopener");
  }

  return (
    <a href={href} onClick={handleClick} aria-label={label} className={className}>
      {children}
    </a>
  );
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run components/trip/attachment-link.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 10: Route all four sites through it**

In `components/trip/attachment-links.tsx`, replace the whole file with:

```tsx
import { Paperclip } from "lucide-react";
import { AttachmentLink } from "@/components/trip/attachment-link";
import type { AttachmentView } from "@/components/trip/attachment-list";

export function AttachmentLinks({ attachments }: { attachments: AttachmentView[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <AttachmentLink key={a.id} href={a.url} mime={a.mime}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
          <Paperclip className="size-3" aria-hidden="true" />{a.filename}
        </AttachmentLink>
      ))}
    </div>
  );
}
```

In `components/trip/attachment-list.tsx`, add to the imports:

```tsx
import { AttachmentLink } from "@/components/trip/attachment-link";
```

and replace lines 218-224:

```tsx
                <a
                  href={att.url}
                  aria-label={`View ${att.filename}`}
                  className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
```

with:

```tsx
                <AttachmentLink
                  href={att.url}
                  mime={att.mime}
                  label={`View ${att.filename}`}
                  className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </AttachmentLink>
```

In `components/trip/journal-editor.tsx`, add to the imports:

```tsx
import { AttachmentLink } from "@/components/trip/attachment-link";
```

and replace lines 83-86:

```tsx
              <a
                href={photo.url}
                aria-label={`View photo ${photo.filename}`}
              >
```

with:

```tsx
              <AttachmentLink
                href={photo.url}
                mime={photo.mime}
                label={`View photo ${photo.filename}`}
              >
```

— and close that element with `</AttachmentLink>` instead of `</a>`.

In `app/(app)/trips/[tripId]/journal/page.tsx`, add to the imports:

```tsx
import { AttachmentLink } from "@/components/trip/attachment-link";
```

and replace lines 134-138:

```tsx
                    <a
                      key={photo.id}
                      href={photo.url}
                      aria-label={`View photo ${photo.filename}`}
                    >
```

with:

```tsx
                    <AttachmentLink
                      key={photo.id}
                      href={photo.url}
                      mime={photo.mime}
                      label={`View photo ${photo.filename}`}
                    >
```

— and close that element with `</AttachmentLink>` instead of `</a>`.

- [ ] **Step 11: Confirm ADR 0043's existing test still passes unchanged**

Run: `npx vitest run components/trip/attachment-links.test.tsx`
Expected: PASS, **including** the pre-existing "opens attachments in-app so the offline cache can serve them" test at line 15. **Do not modify or delete that test.** If it fails, the implementation has rendered a `target` attribute and the approach is wrong — stop and report rather than editing the test to match.

- [ ] **Step 12: Amend ADR 0043**

Append to `docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md`:

```markdown

## Amendment — 2026-09-21: the same-tab rule is scoped to the installed PWA

A Traveller reported that opening an attachment navigates away from the page
they were working on — filed from desktop Chrome. That is precisely the
behaviour the Decision above introduced, so the two had to be reconciled
rather than one silently overwriting the other.

The Decision's stated reason is narrower than the rule it wrote. It names the
risk as handing off "to a new browser tab/window that a PWA shell may not
carry offline state into" — and that is true of the **installed PWA**, where
the handoff goes to an in-app browser outside the service worker's control. It
is not true of an ordinary browser tab: a new same-origin tab is controlled by
the *same* service worker and served from the *same* runtime cache, so a
warmed attachment opens offline there exactly as it does in the current tab.

So the rule is scoped to the context its reasoning actually covers:

- **Installed PWA — unchanged.** Attachment links navigate in-app. Everything
  the Decision above says continues to hold, and the offline-ticket case it
  was written for is untouched.
- **Ordinary browser tab — opens out.** Only for files the browser renders in
  place (`rendersInline`, `lib/attachment-display.ts`); a file it downloads
  never navigates, so opening a tab for one would leave it blank.

The choice is made in a click handler (`components/trip/attachment-link.tsx`),
not in the markup, so **no `target` attribute is rendered in either context**.
The test this ADR introduced —
`components/trip/attachment-links.test.tsx:15-19` — therefore still passes
verbatim, and still guards the thing it was written to guard.

This also closes a question raised while planning the change: whether
`target="_blank"` from the installed iPhone app would reach the sign-in page,
since a standalone iOS PWA can hold a cookie jar separate from Safari. Under
this amendment the installed app never opens out, so the case cannot arise and
needs no device verification.
```

- [ ] **Step 13: Run the full suite**

Run: `npm test`
Expected: PASS. If `components/trip/attachment-list.test.tsx` or `journal` tests assert on the old raw `<a>` markup, update those assertions to match the component's rendered output — but never weaken the ADR 0043 test at `attachment-links.test.tsx:15-19`.

- [ ] **Step 14: Commit**

```bash
git add lib/standalone.ts lib/standalone.test.ts components/trip/attachment-link.tsx components/trip/attachment-link.test.tsx components/account/device-state.ts components/trip/attachment-list.tsx components/trip/attachment-links.tsx components/trip/journal-editor.tsx "app/(app)/trips/[tripId]/journal/page.tsx" docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md
git commit -m "feat(attachments): open out in a browser tab, stay in-app in the PWA"
```

---

### Task 3: Cover photos fill their box instead of letterboxing

A portrait iPhone photo in the trips-card cover (`h-28`, full card width) renders about 84px wide inside a 112px-tall box, with `bg-muted` filling the rest. Replace the dead grey with a blurred copy of the same image, and give the boxes more height on mobile.

**Read before starting:** commit `274455a` ("fix(cover): letterbox the cover photo instead of cropping it") deliberately moved this from `object-cover` to `object-contain`, and pinned it with a test. **Do not simply flip it back** — that restores the cropping that commit removed. The foreground image must stay uncropped; only the dead space changes.

**Files:**
- Modify: `components/trip/trip-cover.tsx:29-44`
- Modify: `components/trip/trip-cover.test.tsx:20-30`
- Modify: `components/trip/trip-card.tsx:100`
- Modify: `app/(app)/trips/[tripId]/page.tsx:71`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks depend on. `TripCoverProps` is unchanged — `className` still controls the container, it is just now applied to a wrapper `div` rather than directly to the `img`.

- [ ] **Step 1: Rewrite the pinned test**

This test currently asserts `object-contain` and `not.toContain("object-cover")` on the first `img`. The blurred backdrop *is* an `object-cover` image, so that assertion must change deliberately. The replacement asserts the thing that actually matters — the foreground photo is never cropped — rather than the absence of a class string.

In `components/trip/trip-cover.test.tsx`, replace the whole `it("letterboxes the cover photo instead of cropping it", ...)` block (lines 20-30) with:

```tsx
  it("never crops the cover photo, and fills the dead space with a blurred copy", () => {
    const { container } = render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />,
    );
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs).toHaveLength(2);

    const [backdrop, photo] = imgs;

    // The backdrop is decorative: it carries no alt text and is hidden from
    // assistive tech, because it is the same picture as the foreground.
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
    expect(backdrop.getAttribute("alt")).toBe("");
    expect(backdrop.className).toContain("object-cover");
    expect(backdrop.className).toContain("blur-xl");

    // The photo itself is never cropped.
    expect(photo.className).toContain("object-contain");
    expect(photo.getAttribute("alt")).toContain("Trip");

    // One image, one request: the backdrop reuses the foreground's URL.
    expect(backdrop.getAttribute("src")).toBe(photo.getAttribute("src"));
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/trip-cover.test.tsx`
Expected: FAIL — `expected [ <img /> ] to have a length of 2 but got 1`.

- [ ] **Step 3: Implement the blurred fill**

In `components/trip/trip-cover.tsx`, replace the `hasCover` branch (lines 30-39):

```tsx
  if (hasCover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable
      <img
        src={`/api/trips/${tripId}/cover${coverVersion ? `?v=${encodeURIComponent(coverVersion)}` : ""}`}
        alt={`${name} cover`}
        className={`size-full object-contain bg-muted ${className ?? ""}`}
      />
    );
  }
```

with:

```tsx
  if (hasCover) {
    const src = `/api/trips/${tripId}/cover${coverVersion ? `?v=${encodeURIComponent(coverVersion)}` : ""}`;
    return (
      // Two layers of the SAME image. The foreground is object-contain, so the
      // photo is never cropped — that was the point of 274455a, and a Traveller
      // whose cover is a portrait phone photo must not lose its top and bottom.
      // But object-contain alone left most of a landscape box as flat bg-muted,
      // because almost every cover is shot in portrait. The backdrop fills that
      // space with a blurred, dimmed copy instead of grey. Same URL as the
      // foreground, so it is one network request and one cache entry — which
      // matters for the offline warm-set.
      <div className={`relative size-full overflow-hidden bg-muted ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable */}
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-75"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable */}
        <img
          src={src}
          alt={`${name} cover`}
          className="relative size-full object-contain"
        />
      </div>
    );
  }
```

Note on `scale-110`: `blur-xl` samples beyond the element's edges, which would otherwise show a soft transparent halo at the box border. Scaling the backdrop up slightly pushes that fringe outside the `overflow-hidden` wrapper.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/trip/trip-cover.test.tsx`
Expected: PASS. The route-render and monogram tests in the same file are untouched and still pass.

- [ ] **Step 5: Make the boxes taller on mobile**

Portrait photos need vertical room, and the phone is where TEEPEE is actually used while travelling.

In `components/trip/trip-card.tsx`, line 100, replace:

```tsx
        <div className="relative h-28 w-full overflow-hidden">
```

with:

```tsx
        <div className="relative h-36 w-full overflow-hidden">
```

In `app/(app)/trips/[tripId]/page.tsx`, line 71, replace:

```tsx
    <div className="relative -mt-2 mb-2 h-40 w-full overflow-hidden rounded-2xl border border-border shadow-soft sm:h-48">
```

with:

```tsx
    {/* Taller on a phone than on desktop, deliberately: the hero spans the full
        content width, so on a wide screen extra height makes an enormous band,
        while on a phone it is the only way a portrait cover gets real room. */}
    <div className="relative -mt-2 mb-2 h-56 w-full overflow-hidden rounded-2xl border border-border shadow-soft sm:h-48">
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. If `components/trip/trip-card.test.tsx` asserts on `h-28`, update that assertion to `h-36` — it is a deliberate change.

- [ ] **Step 7: Commit**

```bash
git add components/trip/trip-cover.tsx components/trip/trip-cover.test.tsx components/trip/trip-card.tsx "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat(cover): fill the box with a blurred copy instead of grey bars"
```

---

### Task 4: The Release note data module

**Files:**
- Create: `lib/release-notes.ts`
- Create: `lib/release-notes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `@/lib/release-notes`:
  - `interface ReleaseNote { publishedAt: string; text: string }`
  - `const RELEASE_NOTES: ReleaseNote[]` — newest first
  - `const WHATS_NEW_CARD_LIMIT = 3`
  - `function unreadReleaseNotes(notes: ReleaseNote[], seenAt: Date | null, accountCreatedAt: Date): ReleaseNote[]`
  - `function releaseNoteDate(note: ReleaseNote): string` — the `YYYY-MM-DD` part, for grouping
  Tasks 7, 8 and 9 consume these.

- [ ] **Step 1: Write the failing test**

Create `lib/release-notes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  RELEASE_NOTES,
  WHATS_NEW_CARD_LIMIT,
  unreadReleaseNotes,
  releaseNoteDate,
  type ReleaseNote,
} from "./release-notes";

const NOTES: ReleaseNote[] = [
  { publishedAt: "2026-09-21T12:00:00Z", text: "Third" },
  { publishedAt: "2026-09-21T09:00:00Z", text: "Second" },
  { publishedAt: "2026-09-10T09:00:00Z", text: "First" },
];

const CREATED = new Date("2026-01-01T00:00:00Z");

describe("unreadReleaseNotes", () => {
  it("returns everything published after the last dismissal", () => {
    const seen = new Date("2026-09-21T10:00:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED).map((n) => n.text)).toEqual(["Third"]);
  });

  it("returns nothing when the Traveller is fully caught up", () => {
    const seen = new Date("2026-09-22T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED)).toEqual([]);
  });

  it("treats a null dismissal as caught up at account creation, not as unread history", () => {
    // The feature must not introduce itself by dumping the entire backlog on
    // the two Travellers who were already here when it shipped.
    const createdAfterEverything = new Date("2026-09-22T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, null, createdAfterEverything)).toEqual([]);
  });

  it("shows a never-dismissed Traveller only what shipped since they joined", () => {
    const joined = new Date("2026-09-15T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, null, joined).map((n) => n.text)).toEqual([
      "Third",
      "Second",
    ]);
  });

  it("distinguishes two releases published on the same day", () => {
    // Why publishedAt carries a time and not just a date: dismissing the
    // morning's release must not silently swallow the afternoon's.
    const seen = new Date("2026-09-21T09:30:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED).map((n) => n.text)).toEqual(["Third"]);
  });

  it("preserves newest-first order", () => {
    const seen = new Date("2026-01-02T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED).map((n) => n.text)).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });
});

describe("releaseNoteDate", () => {
  it("is the calendar date, for grouping a release under one heading", () => {
    expect(releaseNoteDate({ publishedAt: "2026-09-21T12:00:00Z", text: "x" })).toBe("2026-09-21");
  });
});

describe("RELEASE_NOTES", () => {
  it("is ordered newest first", () => {
    const times = RELEASE_NOTES.map((n) => Date.parse(n.publishedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("has a valid timestamp on every note", () => {
    for (const note of RELEASE_NOTES) {
      expect(Number.isNaN(Date.parse(note.publishedAt))).toBe(false);
    }
  });

  it("keeps every note to one line", () => {
    // A Release note is one line. The cap on the card is a backstop; this is
    // the actual discipline.
    for (const note of RELEASE_NOTES) {
      expect(note.text).not.toContain("\n");
      expect(note.text.length).toBeLessThanOrEqual(140);
    }
  });

  it("caps the card at three", () => {
    expect(WHATS_NEW_CARD_LIMIT).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/release-notes.test.ts`
Expected: FAIL — `Failed to resolve import "./release-notes"`.

- [ ] **Step 3: Write the implementation**

Create `lib/release-notes.ts`:

```ts
/**
 * **Release note**s — what TEEPEE tells a **Traveller** it has changed.
 *
 * See CONTEXT.md §"Feedback on the app itself" and ADR 0056. In short: one
 * line, in a Traveller's language, and only for a change a Traveller would
 * notice. Most of what ships earns no Release note at all — that discipline,
 * not `WHATS_NEW_CARD_LIMIT`, is what keeps **What's new** short.
 *
 * These live in code rather than the database so they deploy with the change
 * they describe, get reviewed in the same diff, and are present in the bundle
 * — which means What's new works offline, where a fetched document would not.
 */
export interface ReleaseNote {
  /**
   * ISO 8601 instant this note shipped.
   *
   * A full timestamp rather than a bare date, because read state is a
   * comparison against it: two releases on the same day must be
   * distinguishable, or dismissing the morning's would silently swallow the
   * afternoon's.
   */
  publishedAt: string;
  /** One line. No markdown, no line breaks. */
  text: string;
}

/** Newest first. Add new notes at the top. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    publishedAt: "2026-09-21T12:00:00Z",
    text: "What's new: this. A short note here whenever something changes.",
  },
  {
    publishedAt: "2026-09-21T11:00:00Z",
    text: "Cover photos taken in portrait now fill the space instead of sitting in a grey box.",
  },
  {
    publishedAt: "2026-09-21T10:00:00Z",
    text: "On a computer, attachments now open in a new tab so you keep your place — thanks Xanthia.",
  },
];

/**
 * How many Release notes the What's new card shows before deferring to the
 * full list. However large a release is, the interruption stays a fixed
 * small size.
 */
export const WHATS_NEW_CARD_LIMIT = 3;

/**
 * The Release notes a Traveller has not yet seen, newest first.
 *
 * `seenAt` is `User.whatsNewSeenAt` and is `null` for anyone who has never
 * dismissed the card. `null` means **caught up**, not "has seen nothing": it
 * falls back to when the account was created. Without that, shipping this
 * feature would have greeted both existing Travellers with the entire
 * backlog, and every future Traveller would meet the app's whole history on
 * their first sign-in — when none of it is new to them, it is simply how the
 * app is.
 */
export function unreadReleaseNotes(
  notes: ReleaseNote[],
  seenAt: Date | null,
  accountCreatedAt: Date,
): ReleaseNote[] {
  const boundary = (seenAt ?? accountCreatedAt).getTime();
  return notes.filter((n) => Date.parse(n.publishedAt) > boundary);
}

/** The calendar date a note shipped, for grouping a release under one heading. */
export function releaseNoteDate(note: ReleaseNote): string {
  return note.publishedAt.slice(0, 10);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/release-notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/release-notes.ts lib/release-notes.test.ts
git commit -m "feat(release-notes): the Release note module and unread rule"
```

---

### Task 5: `User.whatsNewSeenAt` — schema and migration

**Files:**
- Modify: `prisma/schema.prisma:55` (the `User` model's trailing fields)
- Create: `prisma/migrations/20260921120000_user_whats_new_seen_at/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `User.whatsNewSeenAt: DateTime?` on the Prisma client. Tasks 6 and 8 read and write it.

**Do not run any `prisma migrate` command.** Write the files; the operator applies them on deploy.

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, in the `User` model, insert immediately before the `createdAt` line (line 55):

```prisma
  /// When this Traveller last dismissed the What's new card. NULL means they
  /// have never dismissed one, which the app reads as "caught up as of
  /// createdAt" rather than "has seen nothing" — see lib/release-notes.ts and
  /// ADR 0056.
  whatsNewSeenAt DateTime?

```

- [ ] **Step 2: Write the migration**

Create `prisma/migrations/20260921120000_user_whats_new_seen_at/migration.sql`:

```sql
-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- whatsNewSeenAt is nullable, so the still-running old build — which does not
-- write it — cannot violate a NOT NULL constraint during the
-- migrate-then-build window, and its reads are unaffected by a column it
-- never selects. Nothing is renamed, dropped, or newly constrained, so this
-- does not reproduce the share_links_per_audience write-path hazard.
--
-- Deliberately NOT backfilled. NULL is meaningful here rather than missing:
-- it means "this Traveller has never dismissed What's new", which the app
-- reads as caught up as of User.createdAt (lib/release-notes.ts). Backfilling
-- to now() would say almost the same thing for today's two Travellers and the
-- wrong thing for every account created afterwards.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "whatsNewSeenAt" TIMESTAMP(3);
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client". This reads `prisma/schema.prisma` only and touches no database.

- [ ] **Step 4: Verify the types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors referencing `whatsNewSeenAt`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260921120000_user_whats_new_seen_at/migration.sql
git commit -m "feat(db): add User.whatsNewSeenAt (written, not applied)"
```

---

### Task 6: The dismiss action

**Files:**
- Create: `server/actions/release-notes.ts`
- Create: `server/actions/release-notes.test.ts`

**Interfaces:**
- Consumes: `User.whatsNewSeenAt` (Task 5); `requireUser` from `@/lib/guards`; `ok` / `ActionResult` from `@/lib/action-result`.
- Produces: `dismissWhatsNew(): Promise<ActionResult>` from `@/server/actions/release-notes`. Task 7 calls it.

- [ ] **Step 1: Write the failing test**

Create `server/actions/release-notes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { user: { update: vi.fn() } },
}));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { dismissWhatsNew } from "./release-notes";

const mockUpdate = db.user.update as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;

describe("dismissWhatsNew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1", email: "a@b.c" });
    mockUpdate.mockResolvedValue({});
  });

  it("stamps the signed-in Traveller as caught up", async () => {
    const result = await dismissWhatsNew();
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1" });
    expect(arg.data.whatsNewSeenAt).toBeInstanceOf(Date);
  });

  it("writes only to the session's own user, never to an id from the caller", async () => {
    // The action takes no arguments at all — there is no user id on the wire
    // for a caller to tamper with. This test pins that shape.
    expect(dismissWhatsNew.length).toBe(0);
    await dismissWhatsNew();
    expect(mockUpdate.mock.calls[0][0].where).toEqual({ id: "u1" });
  });

  it("identifies the Traveller before it writes", async () => {
    const order: string[] = [];
    mockRequireUser.mockImplementation(async () => {
      order.push("auth");
      return { id: "u1", email: "a@b.c" };
    });
    mockUpdate.mockImplementation(async () => {
      order.push("write");
      return {};
    });
    await dismissWhatsNew();
    expect(order).toEqual(["auth", "write"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/release-notes.test.ts`
Expected: FAIL — `Failed to resolve import "./release-notes"`.

- [ ] **Step 3: Write the implementation**

Create `server/actions/release-notes.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { ok, type ActionResult } from "@/lib/action-result";

/**
 * "I have read this release."
 *
 * Marks every **Release note** published so far as seen by the signed-in
 * **Traveller**, so the What's new card does not return. Marking the *whole*
 * release rather than only the notes the card had room to show is deliberate:
 * news a Traveller chose not to read should not come back to ask again.
 *
 * Takes no arguments on purpose. There is no user id on the wire, so there is
 * nothing for a caller to tamper with — the row written is always the
 * session's own.
 *
 * Offline this simply fails and the card reappears on the next online load.
 * That is the accepted trade (ADR 0056): unlike a **Feedback note**, whose
 * offline queue exists because losing one loses real work, re-showing a card
 * costs a second tap.
 */
export async function dismissWhatsNew(): Promise<ActionResult> {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: { whatsNewSeenAt: new Date() },
  });

  revalidatePath("/trips");
  return ok();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/actions/release-notes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/actions/release-notes.ts server/actions/release-notes.test.ts
git commit -m "feat(whats-new): dismiss action marks the release read"
```

---

### Task 7: The What's new card

**Files:**
- Create: `components/whats-new/whats-new-card.tsx`
- Create: `components/whats-new/whats-new-card.test.tsx`

**Interfaces:**
- Consumes: `ReleaseNote`, `releaseNoteDate` from `@/lib/release-notes` (Task 4); `dismissWhatsNew` from `@/server/actions/release-notes` (Task 6).
- Produces: `WhatsNewCard({ notes, totalUnread }: { notes: ReleaseNote[]; totalUnread: number })` from `@/components/whats-new/whats-new-card`. Task 8 mounts it.

`notes` arrives already filtered to unread and already capped — the card does no filtering of its own.

- [ ] **Step 1: Write the failing test**

Create `components/whats-new/whats-new-card.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/server/actions/release-notes", () => ({
  dismissWhatsNew: vi.fn(async () => ({ success: true })),
}));

import { dismissWhatsNew } from "@/server/actions/release-notes";
import { WhatsNewCard } from "./whats-new-card";

const NOTES = [
  { publishedAt: "2026-09-21T12:00:00Z", text: "Alpha" },
  { publishedAt: "2026-09-21T11:00:00Z", text: "Bravo" },
  { publishedAt: "2026-09-21T10:00:00Z", text: "Charlie" },
];

describe("WhatsNewCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when there is no unread news", () => {
    const { container } = render(<WhatsNewCard notes={[]} totalUnread={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the notes it was given", () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
  });

  it("points at the full list when more went unshown than fitted", () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={7} />);
    const link = screen.getByRole("link", { name: /4 more/i });
    expect(link.getAttribute("href")).toBe("/whats-new");
  });

  it("does not offer an overflow link when everything unread is on the card", () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    expect(screen.queryByRole("link", { name: /more/i })).toBeNull();
  });

  it("dismisses the whole release, not just the notes it showed", async () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={7} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss what's new/i }));
    await waitFor(() => expect(dismissWhatsNew).toHaveBeenCalledTimes(1));
  });

  it("hides immediately on dismiss, without waiting for the server", async () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss what's new/i }));
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
  });

  it("stays hidden when the dismiss fails offline", async () => {
    (dismissWhatsNew as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("offline"),
    );
    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss what's new/i }));
    // It reappears on the next load, not in this render — a rejected promise
    // must not resurrect the card under the Traveller's cursor.
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/whats-new/whats-new-card.test.tsx`
Expected: FAIL — `Failed to resolve import "./whats-new-card"`.

- [ ] **Step 3: Write the implementation**

Create `components/whats-new/whats-new-card.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { dismissWhatsNew } from "@/server/actions/release-notes";
import type { ReleaseNote } from "@/lib/release-notes";

/**
 * The **What's new** card: how a release finds a **Traveller**.
 *
 * Renders in the content flow rather than over it, and only where a Traveller
 * *arrives* — the trips list and a Trip's Home. It is deliberately absent from
 * a Day view or the plan editor, which are places you are using the app rather
 * than returning to it.
 *
 * `notes` arrives already filtered to unread and already capped at
 * WHATS_NEW_CARD_LIMIT; `totalUnread` is how many there really are, so the
 * card can point at the rest. Dismissing marks the whole release read — see
 * dismissWhatsNew.
 */
export function WhatsNewCard({
  notes,
  totalUnread,
}: {
  notes: ReleaseNote[];
  totalUnread: number;
}) {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed || notes.length === 0) return null;

  const overflow = totalUnread - notes.length;

  async function handleDismiss() {
    // Hide first. The write is best-effort: offline it rejects and the card
    // returns on the next online load, which is a second tap rather than lost
    // work. What it must never do is spring back under the cursor.
    setDismissed(true);
    try {
      await dismissWhatsNew();
    } catch {
      // Deliberately swallowed — see above.
    }
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss What's new"
        className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2 pr-10">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold tracking-tight">
          What&apos;s new
        </h2>
      </div>

      <ul className="mt-3 space-y-1.5">
        {notes.map((note) => (
          <li
            key={note.publishedAt}
            className="flex gap-2 text-sm text-muted-foreground"
          >
            <span aria-hidden="true" className="select-none text-primary">
              ·
            </span>
            <span className="text-foreground">{note.text}</span>
          </li>
        ))}
      </ul>

      {overflow > 0 ? (
        <Link
          href="/whats-new"
          className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          and {overflow} more →
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/whats-new/whats-new-card.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add components/whats-new/whats-new-card.tsx components/whats-new/whats-new-card.test.tsx
git commit -m "feat(whats-new): the dismissible card"
```

---

### Task 8: Mount the card on arrival surfaces

A server component resolves who the Traveller is and what they have not read, then hands the client card a plain list. Keeping the query here means neither page has to know the unread rule.

**Files:**
- Create: `components/whats-new/whats-new-banner.tsx`
- Create: `components/whats-new/whats-new-banner.test.tsx`
- Modify: `app/(app)/trips/page.tsx` (imports, and the render at line 102)
- Modify: `app/(app)/trips/[tripId]/page.tsx` (imports, and the render at line 102)

**Interfaces:**
- Consumes: `RELEASE_NOTES`, `WHATS_NEW_CARD_LIMIT`, `unreadReleaseNotes` from `@/lib/release-notes` (Task 4); `WhatsNewCard` (Task 7); `requireUser` from `@/lib/guards`; `db` from `@/lib/db`.
- Produces: `async function WhatsNewBanner(): Promise<React.ReactElement | null>` from `@/components/whats-new/whats-new-banner`.

- [ ] **Step 1: Write the failing test**

Create `components/whats-new/whats-new-banner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("./whats-new-card", () => ({
  WhatsNewCard: (props: { notes: unknown[]; totalUnread: number }) => props,
}));
vi.mock("@/lib/release-notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/release-notes")>();
  return {
    ...actual,
    RELEASE_NOTES: [
      { publishedAt: "2026-09-21T12:00:00Z", text: "One" },
      { publishedAt: "2026-09-21T11:00:00Z", text: "Two" },
      { publishedAt: "2026-09-21T10:00:00Z", text: "Three" },
      { publishedAt: "2026-09-21T09:00:00Z", text: "Four" },
    ],
  };
});

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WhatsNewBanner } from "./whats-new-banner";

const mockFindUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;

describe("WhatsNewBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1" });
  });

  it("caps the card at three but reports the true unread total", async () => {
    mockFindUnique.mockResolvedValue({
      whatsNewSeenAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const el = await WhatsNewBanner();
    expect(el!.props.notes).toHaveLength(3);
    expect(el!.props.totalUnread).toBe(4);
  });

  it("renders nothing when the Traveller is caught up", async () => {
    mockFindUnique.mockResolvedValue({
      whatsNewSeenAt: new Date("2026-09-22T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(await WhatsNewBanner()).toBeNull();
  });

  it("renders nothing rather than throwing when the user row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await WhatsNewBanner()).toBeNull();
  });

  it("treats a brand-new Traveller as caught up", async () => {
    mockFindUnique.mockResolvedValue({
      whatsNewSeenAt: null,
      createdAt: new Date("2026-09-22T00:00:00Z"),
    });
    expect(await WhatsNewBanner()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/whats-new/whats-new-banner.test.tsx`
Expected: FAIL — `Failed to resolve import "./whats-new-banner"`.

- [ ] **Step 3: Write the implementation**

Create `components/whats-new/whats-new-banner.tsx`:

```tsx
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import {
  RELEASE_NOTES,
  WHATS_NEW_CARD_LIMIT,
  unreadReleaseNotes,
} from "@/lib/release-notes";
import { WhatsNewCard } from "./whats-new-card";

/**
 * Resolves what this **Traveller** has not yet read and, if anything,
 * renders the **What's new** card.
 *
 * The unread rule lives here rather than in either page, so the trips list
 * and Trip Home cannot drift apart on what counts as new. Returns `null`
 * when there is nothing to say — including for a Traveller whose row has
 * gone missing, where saying nothing is plainly better than failing a page
 * over release news.
 */
export async function WhatsNewBanner() {
  const user = await requireUser();

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { whatsNewSeenAt: true, createdAt: true },
  });
  if (!row) return null;

  const unread = unreadReleaseNotes(
    RELEASE_NOTES,
    row.whatsNewSeenAt,
    row.createdAt,
  );
  if (unread.length === 0) return null;

  return (
    <WhatsNewCard
      notes={unread.slice(0, WHATS_NEW_CARD_LIMIT)}
      totalUnread={unread.length}
    />
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/whats-new/whats-new-banner.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Mount it on the trips list**

In `app/(app)/trips/page.tsx`, add to the imports:

```tsx
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
```

and replace line 102:

```tsx
    <div className="space-y-8">
      {/* Page header */}
```

with:

```tsx
    <div className="space-y-8">
      <WhatsNewBanner />

      {/* Page header */}
```

- [ ] **Step 6: Mount it on Trip Home**

In `app/(app)/trips/[tripId]/page.tsx`, add to the imports:

```tsx
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
```

and replace the returned fragment (lines 101-108):

```tsx
  return (
    <>
      {cover}
      {phaseEl}
```

with:

```tsx
  return (
    <>
      <WhatsNewBanner />
      {cover}
      {phaseEl}
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. If `app/(app)/trips/[tripId]/page.test.tsx` or a trips-list page test renders these pages without mocking `WhatsNewBanner`, add `vi.mock("@/components/whats-new/whats-new-banner", () => ({ WhatsNewBanner: () => null }))` to that file — the banner is covered by its own test.

- [ ] **Step 8: Commit**

```bash
git add components/whats-new/whats-new-banner.tsx components/whats-new/whats-new-banner.test.tsx "app/(app)/trips/page.tsx" "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat(whats-new): show the card where a Traveller arrives"
```

---

### Task 9: The full What's new list, and the way to it

**Files:**
- Create: `app/(app)/whats-new/page.tsx`
- Create: `app/(app)/whats-new/page.test.tsx`
- Modify: `app/(app)/layout.tsx:145-147` (the avatar dropdown)

**Interfaces:**
- Consumes: `RELEASE_NOTES`, `releaseNoteDate` from `@/lib/release-notes` (Task 4); `requireUser` from `@/lib/guards`.
- Produces: the `/whats-new` route.

The page is **read-only**: visiting it does not mark anything read. Dismissing the card is the only thing that writes, so a server component never performs a side effect on render.

- [ ] **Step 1: Write the failing test**

Create `app/(app)/whats-new/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/release-notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/release-notes")>();
  return {
    ...actual,
    RELEASE_NOTES: [
      { publishedAt: "2026-09-21T12:00:00Z", text: "Newer same day" },
      { publishedAt: "2026-09-21T10:00:00Z", text: "Older same day" },
      { publishedAt: "2026-09-10T10:00:00Z", text: "Earlier release" },
    ],
  };
});

import WhatsNewPage from "./page";

describe("/whats-new", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists every Release note", async () => {
    render(await WhatsNewPage());
    expect(screen.getByText("Newer same day")).toBeTruthy();
    expect(screen.getByText("Older same day")).toBeTruthy();
    expect(screen.getByText("Earlier release")).toBeTruthy();
  });

  it("groups a day's notes under one heading", async () => {
    const { container } = render(await WhatsNewPage());
    const headings = Array.from(container.querySelectorAll("h2")).map(
      (h) => h.textContent,
    );
    expect(headings).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "app/(app)/whats-new/page.test.tsx"`
Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 3: Write the page**

Create `app/(app)/whats-new/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { RELEASE_NOTES, releaseNoteDate } from "@/lib/release-notes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "What's new · TEEPEE" };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The full **What's new** list — every **Release note**, newest first,
 * grouped under the day it shipped.
 *
 * Deliberately read-only: visiting does NOT mark anything read. Dismissing
 * the card is the single write, so rendering this page never has a side
 * effect.
 */
export default async function WhatsNewPage() {
  await requireUser();

  const groups: { date: string; notes: typeof RELEASE_NOTES }[] = [];
  for (const note of RELEASE_NOTES) {
    const date = releaseNoteDate(note);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.notes.push(note);
    else groups.push({ date, notes: [note] });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          What&apos;s new
        </h1>
        <p className="text-sm text-muted-foreground">
          Changes to TEEPEE, newest first.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.date} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {formatDate(group.date)}
              </h2>
              <ul className="space-y-1.5">
                {group.notes.map((note) => (
                  <li key={note.publishedAt} className="flex gap-2 text-sm">
                    <span aria-hidden="true" className="select-none text-primary">
                      ·
                    </span>
                    <span className="text-foreground">{note.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "app/(app)/whats-new/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the dropdown entry**

In `app/(app)/layout.tsx`, replace lines 145-147:

```tsx
                <DropdownMenuItem asChild>
                  <Link href="/help">How to use TEEPEE</Link>
                </DropdownMenuItem>
```

with:

```tsx
                <DropdownMenuItem asChild>
                  <Link href="/help">How to use TEEPEE</Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/whats-new">What&apos;s new</Link>
                </DropdownMenuItem>
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. If `app/(app)/layout.test.tsx` asserts on the exact set of dropdown items, add `What's new` to that expectation — it is a deliberate addition.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/whats-new/page.tsx" "app/(app)/whats-new/page.test.tsx" "app/(app)/layout.tsx"
git commit -m "feat(whats-new): full list at /whats-new, linked from the avatar menu"
```

---

### Task 10: ADR 0056 and the documentation corrections

**Files:**
- Create: `docs/adr/0056-release-notes-ship-with-the-code-read-state-belongs-to-the-person.md`
- Modify: `docs/open-follow-ups.md:470-497` (the migration section) and the *Still genuinely blocked* list at line 617
- Modify: `ONBOARDING.md:88` (add one changelog line above the existing newest entry)

`CONTEXT.md` already carries **Release note** and **What's new** — written during the grilling session. Do not re-add them.

- [ ] **Step 1: Write ADR 0056**

Create `docs/adr/0056-release-notes-ship-with-the-code-read-state-belongs-to-the-person.md`:

```markdown
# 0056 — Release notes ship with the code; read state belongs to the person

## Status
Accepted (2026-09-21)

## Context

TEEPEE had no way to tell a **Traveller** what had changed. `ONBOARDING.md`
carries a changelog, but it is written for engineers ("Adds one column:
`Transport.anchorStopId`"), had not been updated since 2026-08-20, and is not
in the app at all. Meanwhile the **Feedback panel** gives a Traveller a way to
say something *to* the operator, with no matching channel back: Xanthia's
request that attachments open in a new tab was fixed the day after she wrote
it, and nothing in the product would ever have told her so.

Three sources for the content were considered. **Generated from git history**
was rejected outright: commit subjects are written for engineers, and the
audience here is two people who want to read "attachments now open in a new
tab". **An Admin-authored database table** would let news publish without a
deploy, but it means building an authoring surface for an audience of two and
putting the content outside version control, where it is reviewed by nobody.
**Committed entries** won: every Release note is born in the same commit as
the change it describes, gets reviewed in the same diff, and costs no new UI.

The cost of that choice is that a Release note becomes true on **deploy**, not
on commit — several written across a week all land together. That is the right
granularity anyway: a Traveller experiences the release, not the commits.

Read state was the harder question. `localStorage` is free and works offline,
but it is per-*browser*: with two Travellers each running a phone and a laptop,
every release would be dismissed four times. The glossary already draws this
line hard — a **Device** is one browser, and things true of a *person* live on
**Account**, precisely because rendering an account-wide fact per-device is
what let a broken Device hide (ADR 0048). "Have I read this release" is a fact
about the person.

## Decision

1. **Release notes are a typed constant in the bundle** (`lib/release-notes.ts`),
   newest first, each one line. Not markdown loaded at runtime, not a database
   table. Being in the bundle means **What's new** works offline, which a
   fetched document would not.

2. **Each note carries a full ISO timestamp, not a bare date.** Read state is a
   comparison against it, so two releases on the same day must be
   distinguishable — otherwise dismissing the morning's release would silently
   swallow the afternoon's, and a Traveller would never see news that was
   published after they last looked but on a day they had already dismissed.

3. **Read state is one nullable column, `User.whatsNewSeenAt`.** It follows the
   Traveller to every device they sign in on.

4. **`NULL` means *caught up*, not *has seen nothing*** — it falls back to
   `User.createdAt`. This is the decision most likely to look like a bug to a
   future reader, and it is deliberate. Without it, shipping this feature would
   have greeted both existing Travellers with the entire backlog at once, and
   every Traveller who ever joins would meet the app's whole history on their
   first sign-in — when none of it is new to them, it is simply how the app
   works. The column is therefore **not backfilled**: `NULL` carries meaning
   that `now()` would destroy for every account created after the migration.

5. **Dismissing marks the whole release read**, not only the notes the card had
   room to show. News a Traveller chose not to read must not come back to ask
   again; the card's three-note cap is a limit on interruption, not a queue.

6. **The volume control is editorial, not mechanical.** Most of what TEEPEE
   ships earns no Release note at all — only a change a Traveller would notice
   does. The cap on the card is a backstop for a large release, not the
   mechanism that keeps the news short.

7. **Offline dismissal is best-effort.** The card hides immediately and the
   write may fail; it reappears on the next online load. Unlike a **Feedback
   note**, whose offline queue exists because losing one loses real work
   (ADR 0041), re-showing a card costs a second tap.

8. **The full list at `/whats-new` is read-only.** Visiting it marks nothing
   read, so no server component performs a side effect on render.

## Consequences

- Publishing news requires a deploy. For a two-Traveller app deployed from this
  repo that is not a constraint worth engineering around, but it does mean
  there is no way to correct a Release note in production without shipping.
- A Release note is written by whoever writes the change — so the discipline
  ("would a Traveller notice this?") lives with the author, in review, rather
  than with a separate editorial pass. If that discipline slips, **What's new**
  fills with noise and the cap will hide the parts that mattered.
- `whatsNewSeenAt` is the first column on `User` that exists purely for a UI
  affordance. If more accumulate, they should move to a `UserPreference` row
  rather than widening `User` indefinitely.
- The Feedback loop now closes visibly: a Release note that resolves a
  **Feedback note** names the Traveller who raised it. That is a convention,
  not a mechanism — there is no link between the two records, and deliberately
  so, since a Feedback note is private to its author (ADR 0046) and a Release
  note is read by everyone.
```

- [ ] **Step 2: Correct the stale migration section**

In `docs/open-follow-ups.md`, replace the heading and opening paragraph at lines 470-476:

```markdown
## Two migrations written on 2026-09-21 — written, not applied

These two are the only pending database work. They were written on branch
`chore/close-the-open-backlog` alongside the code that reads their columns.
**Neither has been applied**: this sandbox has no Postgres and connecting to
the production database is forbidden, so no `prisma migrate` command was run
against any database. Running them is the operator's call.
```

with:

```markdown
## Two migrations written on 2026-09-21 — applied in production 2026-09-21

**Both were applied to production on 2026-09-21 at 09:53 UTC** and this
section is kept as their record, not as work owing. Verified on 2026-09-21
against the production database by reading `information_schema` directly
rather than trusting the migration ledger: `CronHeartbeat.lastSuccessAt`
exists and is nullable, `FeedbackNote.authorName` exists and is nullable, and
`FeedbackNote_authorId_fkey` is gone. `prisma migrate status` reports "Database
schema is up to date" across all 28 migrations.

They were written on branch `chore/close-the-open-backlog` alongside the code
that reads their columns, and were **not** applied by the agent that wrote
them — that branch had no database access. The descriptions below stand as
written.

> **A third migration is now written and not applied:**
> `20260921120000_user_whats_new_seen_at` (ADR 0056) adds a **nullable**
> `whatsNewSeenAt` to `User`, deliberately un-backfilled because `NULL`
> carries meaning there. Additive on reads and writes per `docs/DEPLOY.md`
> §4b. Applying it is the operator's call.
```

- [ ] **Step 3: Record the iPhone question as settled, not blocked**

**Do NOT add a blocked item for this.** An earlier draft of this plan opened
attachments in a new tab everywhere and owed a device check: whether a
`target="_blank"` from the installed iPhone app would reach the sign-in page,
since a standalone iOS PWA can hold a cookie jar separate from Safari. Task 2's
narrowing of ADR 0043 means the installed app never opens out, so the case
cannot arise and there is nothing to verify. Record that, so a future reader
does not re-raise it as an untested gap.

In `docs/open-follow-ups.md`, in the **Settled — do not re-raise** section, add:

```markdown
### WN-01 · Whether an attachment opened from the installed iPhone PWA would hit the sign-in page

- **Source:** raised 2026-09-21 while planning the attachment new-tab change;
  settled the same day by the amendment to ADR 0043.
- **The observation:** `/api/attachments/:id` is session-authenticated
  (`app/api/attachments/[id]/route.ts:45`), and a standalone iOS PWA can hold
  a cookie jar separate from Safari — so a link opened out of the installed
  app might arrive unauthenticated and bounce to sign-in.
- **Why it is settled rather than owed:** the behaviour that would have caused
  it was never shipped. Attachment links open out **only in an ordinary
  browser tab**; inside the installed PWA they navigate in-app exactly as ADR
  0043 specified. There is no code path from the installed app to a new tab,
  so there is nothing a device pass could observe.
- **What would reopen it:** any change that gives attachment links a
  `target="_blank"` unconditionally, or that removes the `isStandalone()`
  branch in `components/trip/attachment-link.tsx`. If that is ever proposed,
  the fix is already designed — a server action performs the access check and
  returns the **presigned** storage URL (the route already 302s to one,
  `PRESIGN_EXPIRY_SECONDS = 300`), and the client opens *that*, needing no
  session. The tab must be opened synchronously on click and its location set
  when the URL resolves, or the popup blocker eats it.
```

- [ ] **Step 4: Add the ONBOARDING changelog line**

In `ONBOARDING.md`, insert immediately above the existing `- **In-app user guide** (2026-08-20)` bullet at line 88:

```markdown
- **What's new, attachment tabs & cover fill** (2026-09-21) — New **Release note** concept (`CONTEXT.md`, ADR 0056): notes are a typed constant in `lib/release-notes.ts`, surfaced as a dismissible card on the trips list and Trip Home plus a full list at `/whats-new`. Read state is `User.whatsNewSeenAt` (nullable; `NULL` means caught-up-at-`createdAt`, never backfilled) — migration `20260921120000_user_whats_new_seen_at`, **written, applies on deploy**. Attachment links now open out **in an ordinary browser tab only** — `components/trip/attachment-link.tsx` decides in a click handler from `rendersInline(mime)` (`lib/attachment-display.ts`, shared with the serve route's `Content-Disposition` so the two cannot drift) and `isStandalone()` (`lib/standalone.ts`, also now backing `device-state.ts`'s iOS check). Inside the installed PWA links stay in-app, so ADR 0043's offline-ticket guarantee is untouched — see its 2026-09-21 amendment; no `target` attribute is rendered in either context, so ADR 0043's own test still passes verbatim. `TripCover` renders a blurred backdrop of the same image behind the uncropped photo (replacing the flat `bg-muted` letterbox of `274455a`, keeping its no-crop guarantee); card cover `h-28`→`h-36`, Trip Home hero `h-40`→`h-56` on mobile.
```

- [ ] **Step 5: Verify the docs are consistent**

Run: `npm test`
Expected: PASS. `lib/help-guide.test.ts` carries drift tests that fail if a nav label is renamed or a linked route disappears — the new `/whats-new` route is an addition, so it should not trip them. If it does, follow that test's own guidance to register the route.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0056-release-notes-ship-with-the-code-read-state-belongs-to-the-person.md docs/open-follow-ups.md ONBOARDING.md
git commit -m "docs: ADR 0056, correct the applied-migration record, log the release"
```

---

## Verification before hand-back

- [ ] `npm test` — full suite green
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npm run lint` — clean
- [ ] `git log --oneline main..HEAD` — every task committed, nothing on `main`
- [ ] `git status` — clean tree

## Deliberately NOT done (operator's call)

- **Applying `20260921120000_user_whats_new_seen_at`.** Written and committed only.
- **Merging to `main` and deploying.** Sandbox guardrails; hand back for both.
- **`npm run feedback:resolve -- cmub12cdl000004k1yp20uk6u`.** Writes to production, and a Feedback note closes only when the work has actually landed — which means merged and deployed, not committed to a branch.
- **Nothing device-blocked was added by this release.** `WN-01` — the iPhone PWA attachment question — is recorded in *Settled*, not *Blocked*: Task 2's narrowing of ADR 0043 means the installed app never opens a link out, so there is no behaviour for a device pass to observe.
