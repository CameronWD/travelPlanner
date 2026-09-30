# Phase 4: the Share page — before, during and after. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/share/[token]` as the staged public page in `SHARE.md`. **Before** leads with a countdown and the map. **During** leads with Right now and a live map. **After** leads with the Tally and the journal, and ends with **Use this route**. Add two data changes. `ShareLink.showTravellers` (off by default) puts the Travellers on the hero, and a switch in Settings → Share links turns it on. `Trip.sourceShareLinkId` records a **Route copy**. Signed-out visitors reach the invite-only door through the Landing's Request access panel.

**Architecture:** The page stays an async Server Component. The public projection moves into one lookup module, `lib/share-lookup.ts`. The page, the OG image and the route copy all read through it, so all three see the same rows and refuse the same revoked tokens. Pure stage logic lives in `lib/share-view.ts`. Each section is its own file under `app/share/[token]/`. The client pieces are the Day by day fold, stop index and picker, the journal expander, the clock, the countdown and the entrance wrapper. Only these receive props across the server/client boundary, and each gets pre-projected view models, never raw rows. Traveller photos on a link are served by a new link-scoped route, never by `/api/avatars`. "Use this route" links to the Landing with a safe `callbackUrl`. The Landing sends a signed-in visitor straight to `/trips/new?fromShare=…`, where `createTrip` rebuilds the stops server-side from the public projection.

**Tech Stack:** Next.js 16 App Router (**read `node_modules/next/dist/docs/` before touching routing, metadata files or route handlers — this version differs from training data**), Prisma (Postgres), Tailwind v4 tokens, Radix via `components/ui/*`, `motion/react` (already a dependency, `^12.40.0`), lucide-react, Vitest + Testing Library (jsdom; `test/setup.ts` stubs `matchMedia`, **not** `IntersectionObserver`).

**Spec:** `docs/specs/2026-09-30-budget-onboard-plan-share.md` §E and the Phase 4 row. Handoff: `design_handoff/budget-onboard-plan-share/plan-share-audit-handoff/SHARE.md`, `MOTION.md` rows S1–S11, `images/share-*.png`. Decisions: ADR 0051 (read every amendment, especially **2026-09-30**: `showTravellers` defaults **false**, photos only when on, email never), ADR 0057 (invite-only door). Glossary: CONTEXT.md **Share link**, **Route copy**, **Profile photo and display name**. Where the spec and the handoff disagree, the spec wins. So: `@default(false)` (not true); the CTA button is "Request access" (not "Start your own trip"); the body copy says "invite-only for now"; and the clock is a ticking client component (no `revalidate = 300`).

## Global Constraints

- Work only on branch `feat/budget-onboard-plan-share-2026-09-30` (already checked out in /work). Never commit to `main`, never push, never deploy, never run any `feedback:*` script.
- If `node`/`npm` isn't on PATH: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use`.
- Every commit message ends with these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8`
- No `Resolves-Feedback:` trailers (the inbox is empty).
- Tests: `npm test -- <path>` (sets TZ=UTC). Before each commit `npx tsc --noEmit` and `npm run lint` must be clean.
- Tokens only, no raw hex in components; 2px ink borders + hard shadows; `shadow-soft`, `shadow-soft-lg`, `border-border/70`, `bg-card/40` must not appear in any touched file (extend the existing ban assertions to new components). `formatMoney()` for money; `formatDay()/formatRange()/formatDateRange*` for dates, never ISO. Chips/pills `whitespace-nowrap shrink-0`. Touch targets ≥44px on mobile. `tabular-nums` on amounts/times. Respect reduced motion. lucide icons, not unicode glyphs.
- Do not add npm dependencies unless the task says so (check `package.json` — `motion`, dnd-kit, Radix, react-day-picker may already be present; verify).
- Comment only a non-obvious why.
- **Phase-specific:**
  - The handoff's `shadow-N` means this repo's **`shadow-hard-N`** (`--shadow-hard-1…5` in `app/globals.css`). `shadow-cta` and `shadow-pressed` exist under those names.
  - **Share privacy floor (ADR 0051).** No query on the public page may select `reference`, `confirmation`, `notes`, `link`, `booking`, `costMinor`, `currency`, `amountMinor`, `homeCurrency`, `email` or `photoAttachmentId`. Every existing "intentionally omitted" comment in `app/share/[token]/page.tsx` moves with its query and stays word for word. An off dial means that query never runs. `hiddenFromShares` stays in the `where` (Items and Journal) and is never filtered in JS.
  - **Client components on the share page take view models only.** Never pass a Prisma row, a `TravellerLike` with extra fields, or a transport/accommodation row as a prop to a `"use client"` component. RSC serializes those props into the HTML payload.
  - The share page never calls `auth()`. It must stay renderable with no session.
  - `server/actions/copy-route-from-share.ts` has **no** `"use server"` directive. Every export of a `"use server"` module is a public endpoint. Its export is a plain server module function, called only from `createTrip`.
  - Dates are shown only through `lib/dates.ts` formatters (`formatDayLabel`, `formatDateRangeCompact`, `formatLongDate`, plus the `formatDayRange`, `formatMonthSpan` and `formatWeekday` added in Task 3).
  - Migration directories must sort **after every existing directory** in `prisma/migrations/`, including Phase 2's `roughMonth` migration. Before creating them, run `ls prisma/migrations | tail -3`. If a name below doesn't sort last, bump its timestamp.

- **Orchestrator override (2026-09-30), wins over any task text below:** Phase 2 changed `createTrip` to **never redirect**; it returns `ActionResult<{ tripId: string; href: string }>` and the New trip flow navigates to `href` itself (after its create animation). So in Task 7, wherever this plan says `createTrip` "redirects to `tripPath(slug, \"/plan\")`", it instead **returns `href: tripPath(slug, \"/plan\")`** for a Route copy, and the tests assert the returned `href` rather than a `redirect` mock. Read Phase 2's `createTrip` before writing the test.
- **Hero cover:** the route sketch or passport stamp always, never the uploaded photo (no public photo route; confirmed).

## Review Focus

1. **A revoked or rotated token on Use this route.** `revokeShareLink` does `deleteMany`, so the row is gone. `rotateShareLink` replaces `token`, so the old token matches no row. Both must make `routeStopsFromShare` return `null`, make `createTrip` refuse without creating a Trip, and make the `/trips/new?fromShare=` prefill disappear. `sourceShareLinkId` is a plain string with no FK, so it survives a later revoke. (Tests: Task 5 "returns null for an unknown/revoked token", Task 7 "refuses a revoked token without creating a trip".)
2. **`showTravellers` off (every existing link).** Off means the `tripMember` query never runs, there are no hero avatars, and journal avatars show initials. No `<img>` URL for a Traveller appears anywhere, and nothing ever points at `/api/avatars`. With the dial on, photos come only from `/share/<token>/traveller-photo/<userId>`. Email is never selected, and it never renders even when a mocked row carries it. (Tests: Task 15 privacy matrix; Task 4 route 404s when the dial is off.)
3. **The footer says "booking references".** The spec's regression rule, "the HTML never contains `reference`", would fail on the page's own required copy. The privacy test therefore removes the exact `SHARE_FOOTER_COPY` string before scanning for `reference` / `confirmation` / `costMinor`, and also scans for the private *values* (`PNR-ABC123`, `CONF-999`, `12345`, the email). (Test: Task 15 "never renders … in any stage, dial on or off".)
4. **An open redirect through `callbackUrl`.** `/?callbackUrl=//evil.example`, `https://evil.example`, `/\evil.example` and a control character must all be dropped, so a signed-in visitor lands on `/trips`. (Test: Task 6 `safeCallbackPath`.)
5. **A mid-leg or changeover moment during the trip.** When now falls between a transport's `depAt` and `arrAt`, Right now says "Travelling to Rome" with the leg as its first row. On a changeover day the arriving stop is "Here now" and the departing stop is "✓ Been". With `includeTransport` off, the transports query never ran, so the card never says "Travelling". (Tests: Task 3 `currentLeg` and `stopStatuses`, Task 10 "leg in progress".)

---

### Task 1: Migrations — `ShareLink.showTravellers` and `Trip.sourceShareLinkId`

**Files:**
- Modify: `prisma/schema.prisma` (`model ShareLink` ~line 635, `model Trip` ~line 133)
- Create: `prisma/migrations/20260930400000_share_link_show_travellers/migration.sql`
- Create: `prisma/migrations/20260930400001_trip_source_share_link/migration.sql`
- Create: `prisma/share-show-travellers-migration.test.ts`

**Interfaces:**
- Produces: `ShareLink.showTravellers Boolean @default(false)`; `Trip.sourceShareLinkId String?` (plain string, no relation).

- [ ] **Step 1: Write the failing test** (same idiom as `prisma/device-columns-migration.test.ts`)

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA = readFileSync(join(__dirname, "schema.prisma"), "utf8");
const SHOW = readFileSync(
  join(__dirname, "migrations/20260930400000_share_link_show_travellers/migration.sql"),
  "utf8",
);
const SOURCE = readFileSync(
  join(__dirname, "migrations/20260930400001_trip_source_share_link/migration.sql"),
  "utf8",
);

function model(name: string): string {
  const start = SCHEMA.indexOf(`model ${name} {`);
  return SCHEMA.slice(start, SCHEMA.indexOf("\n}", start));
}

describe("showTravellers migration (ADR 0051 amendment 2026-09-30)", () => {
  it("adds the column NOT NULL DEFAULT false, so every existing link stays off", () => {
    expect(SHOW).toMatch(/ALTER TABLE "ShareLink" ADD COLUMN "showTravellers" BOOLEAN NOT NULL DEFAULT false/);
    expect(SHOW).not.toMatch(/DEFAULT true/i);
    expect(SHOW).not.toMatch(/UPDATE\s+"ShareLink"/i);
  });
  it("is reflected in schema.prisma with @default(false)", () => {
    expect(model("ShareLink")).toMatch(/showTravellers\s+Boolean\s+@default\(false\)/);
  });
});

describe("sourceShareLinkId migration (CONTEXT.md Route copy)", () => {
  it("adds a nullable text column with no foreign key, so attribution survives a revoke", () => {
    expect(SOURCE).toMatch(/ALTER TABLE "Trip" ADD COLUMN "sourceShareLinkId" TEXT;/);
    expect(SOURCE).not.toMatch(/FOREIGN KEY|REFERENCES/i);
  });
  it("is a plain String? on Trip, not a relation", () => {
    const trip = model("Trip");
    expect(trip).toMatch(/sourceShareLinkId\s+String\?/);
    expect(trip).not.toMatch(/sourceShareLink\s+ShareLink/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- prisma/share-show-travellers-migration.test.ts`
Expected: FAIL (ENOENT on the migration files).

- [ ] **Step 3: Implement**

`ls prisma/migrations | tail -3` first, and bump the two timestamps if needed (Global Constraints).

`prisma/migrations/20260930400000_share_link_show_travellers/migration.sql`:

```sql
-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- showTravellers is NOT NULL with a DEFAULT, so the still-running old build
-- inserts rows that get `false` for free.
--
-- Backfilled to `false` by the DEFAULT (ADR 0051 amendment 2026-09-30): a
-- link already sitting in a group chat must not start showing who is on the
-- trip until someone turns it on for that audience.

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "showTravellers" BOOLEAN NOT NULL DEFAULT false;
```

`prisma/migrations/20260930400001_trip_source_share_link/migration.sql`:

```sql
-- Route copy attribution (CONTEXT.md "Route copy"). Deliberately no foreign
-- key: revoking a Share link deletes its row, and the copied Trip must keep
-- the attribution anyway.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "sourceShareLinkId" TEXT;
```

`prisma/schema.prisma`: in `model ShareLink`, after `includeJournal Boolean @default(false)`, add

```prisma
  /// Fifth dial (ADR 0051 amendment, 2026-09-30): "Show who's going" — the
  /// Travellers' display names and profile photos on the hero. Off by default
  /// and off on every existing link. Email is never selected on any link.
  showTravellers Boolean @default(false)
```

In `model Trip`, after `roundTrip Boolean @default(true)`, add

```prisma
  // Route copy (CONTEXT.md): the Share link this Trip's rough Stops were
  // copied from. Plain string, no relation — attribution survives revocation.
  sourceShareLinkId String?
```

Then run `npx prisma generate`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- prisma/share-show-travellers-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add prisma/schema.prisma prisma/migrations/20260930400000_share_link_show_travellers prisma/migrations/20260930400001_trip_source_share_link prisma/share-show-travellers-migration.test.ts
git commit -m "feat(share): showTravellers dial (default off) and Trip.sourceShareLinkId

ADR 0051 amendment 2026-09-30; CONTEXT.md Route copy.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 2: Share actions and the Settings "Show who's going" switch

**Files:**
- Modify: `server/actions/share.ts`
- Modify: `server/actions/share.test.ts`
- Modify: `components/trip/settings/share-links-panel.tsx`
- Modify: `components/trip/settings/share-links-panel.test.tsx`

**Interfaces:**
- Consumes: `ShareLink.showTravellers` (Task 1).
- Produces: `ShareLinkView.showTravellers: boolean`; `ShareScopeInput.showTravellers?: boolean`; `createShareLink` defaults it to `false`; `updateShareLink` passes it through `scopeData`.

- [ ] **Step 1: Write the failing tests**

In `server/actions/share.test.ts`, add `showTravellers: false` to the `row()` fixture, then add:

```ts
  it("creates a link with showTravellers off unless asked (ADR 0051 amendment 2026-09-30)", async () => {
    shareCreateMock.mockResolvedValue(row());
    await createShareLink(TRIP_ID, { label: "Group chat" });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showTravellers: false }) }),
    );
  });

  it("honours an explicit showTravellers: true on create and update", async () => {
    shareCreateMock.mockResolvedValue(row({ showTravellers: true }));
    await createShareLink(TRIP_ID, { label: "Mum & Dad", showTravellers: true });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showTravellers: true }) }),
    );
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ showTravellers: true }));
    const result = await updateShareLink(TRIP_ID, LINK_ID, { showTravellers: true });
    expect(shareUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ data: { showTravellers: true } }));
    expect(result.success && result.link.showTravellers).toBe(true);
  });
```

(Use the mock names already declared at the top of `share.test.ts`. If the updateMany mock has a different name, use it; grep `updateMany` in that file.)

In `components/trip/settings/share-links-panel.test.tsx`:
- add `showTravellers: false` to the `link()` fixture;
- add `showTravellers: false` to **every** `toHaveBeenCalledWith(…)` payload that already lists `includeJournal`;
- add:

```ts
  it("offers a 'Show who's going' switch, off by default, with helper copy", async () => {
    createShareLink.mockResolvedValue({ success: true, link: link({ id: "new", label: "Nana", showTravellers: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    const sw = screen.getByRole("switch", { name: /show who's going/i });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Names and photos of everyone on the trip")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(sw);
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(createShareLink).toHaveBeenCalledWith("t", expect.objectContaining({ showTravellers: true }));
  });

  it("saves a showTravellers edit through updateShareLink", async () => {
    updateShareLink.mockResolvedValue({ success: true, link: link({ showTravellers: true }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("switch", { name: /show who's going/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateShareLink).toHaveBeenCalledWith("t", "l1", expect.objectContaining({ showTravellers: true }));
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- server/actions/share.test.ts components/trip/settings/share-links-panel.test.tsx`
Expected: FAIL (the switch is missing; `showTravellers` is not in `data`).

- [ ] **Step 3: Implement**

`server/actions/share.ts`:
- `ShareLinkView`: add `showTravellers: boolean;`.
- `ShareScopeInput`: add `/** "Show who's going" (ADR 0051 amendment 2026-09-30) — off by default. */ showTravellers?: boolean;`.
- `LINK_SELECT`: add `showTravellers: true`. `LinkRow`: add `showTravellers: boolean;`.
- `scopeData`: `if (input.showTravellers !== undefined) data.showTravellers = input.showTravellers;`.
- `createShareLink` `data`: `showTravellers: input.showTravellers ?? false,` with the comment `// Off by default (ADR 0051 amendment 2026-09-30), like includeJournal.`

`components/trip/settings/share-links-panel.tsx`:
- `FULL_SCOPE`: add `showTravellers: false` (the `ScopeState` type picks it up from `ShareScopeInput`).
- `LinkRow` initial `scope`: add `showTravellers: link.showTravellers`.
- Add `TravellersDial`, next to `JournalDial` and matching its markup exactly:

```tsx
function TravellersDial({ checked, onChange, idPrefix }: { checked: boolean; onChange: (next: boolean) => void; idPrefix: string }) {
  const id = `${idPrefix}-showTravellers`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm text-foreground">Show who&apos;s going</label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground">Names and photos of everyone on the trip</p>
    </div>
  );
}
```

- Render `<TravellersDial … />` directly after each of the two `<JournalDial … />` uses (edit form and create form), wired the same way (`setScope({ ...scope, showTravellers: v })` and `setNewScope({ ...newScope, showTravellers: v })`).
- Leave `scopeCaption` unchanged.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- server/actions/share.test.ts components/trip/settings/share-links-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add server/actions/share.ts server/actions/share.test.ts components/trip/settings/share-links-panel.tsx components/trip/settings/share-links-panel.test.tsx
git commit -m "feat(share): Settings → Share links \"Show who's going\" switch

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 3: Pure stage helpers (`lib/share-view.ts`, `lib/dates.ts`, `lib/share-ref.ts`)

**Files:**
- Modify: `lib/share-view.ts`
- Create: `lib/share-view.test.ts` (if it already exists, append to it)
- Modify: `lib/dates.ts`
- Modify: `lib/dates.test.ts` (append; create it if absent)
- Create: `lib/share-ref.ts`
- Create: `lib/share-ref.test.ts`

**Interfaces:**
- Produces (`lib/share-view.ts`):
  - `type ShareStage = "before" | "during" | "after"`; `shareStage(phase: TripPhase): ShareStage`
  - `interface DayIndex { day: number; total: number; fraction: number; nightsLeft: number }`; `dayIndex(i: { startDate: string; endDate: string; today: string }): DayIndex`
  - `currentLeg<T extends { depAt: Date | string | null; arrAt: Date | string | null }>(transports: T[], now: Date): T | null`
  - `type StopStatus = "past" | "current" | "future"`; `stopStatuses(stops: { id: string; arriveDate: string }[], currentStopId: string | null, todayISO: string): Map<string, StopStatus>`
  - `nextStopAfter<S extends { id: string }>(stops: S[], id: string | null): S | null`
  - `shareTally(stops: { country: string | null }[], totalNights: number): { nights: number; stops: number; countries: number }`
  - `travellersLabel(names: string[], opts?: { possessive?: boolean }): string`
  - `polaroidTilt(id: string): number`
  - `isDoneAt(startTime: string | null | undefined, endTime: string | null | undefined, nowHHMM: string): boolean`
  - `groupDaysByStop<D extends { stop: { id: string } | null }>(days: D[], stopIds: string[]): Map<string, D[]>`
  - `type ShareSection = "hero" | "right-now" | "next" | "tally" | "journal" | "map" | "route" | "days" | "cta"`; `shareSections(stage: ShareStage, has: { journal: boolean; days: boolean; next: boolean; map: boolean }): ShareSection[]`
- Produces (`lib/dates.ts`): `formatDayRange(start, end)` ("Fri 4 Dec – Fri 8 Jan"), `formatMonthSpan(start, end)` ("Dec 2026 – Jan 2027"), `formatWeekday(s)` ("Tue").
- Produces (`lib/share-ref.ts`): `shareRefParam(token: string): string` (10 hex chars of sha256); `interface ShareHrefs { requestAccess: string; useRoute: string; fromScratch: string }`; `shareHrefs(token: string): ShareHrefs`.

- [ ] **Step 1: Write the failing tests**

`lib/share-view.test.ts` (append these `describe`s if the file exists):

```ts
import { describe, it, expect } from "vitest";
import {
  shareStage, dayIndex, currentLeg, stopStatuses, nextStopAfter, shareTally,
  travellersLabel, polaroidTilt, isDoneAt, groupDaysByStop, shareSections,
} from "./share-view";

describe("shareStage", () => {
  it("maps every Phase to a stage", () => {
    expect(shareStage("sketching")).toBe("before");
    expect(shareStage("planning")).toBe("before");
    expect(shareStage("final-prep")).toBe("before");
    expect(shareStage("travelling")).toBe("during");
    expect(shareStage("past")).toBe("after");
  });
});

describe("dayIndex", () => {
  it("counts days inclusively, like describePhase, and nights left to the end", () => {
    expect(dayIndex({ startDate: "2026-12-04", endDate: "2027-01-08", today: "2026-12-12" }))
      .toEqual({ day: 9, total: 36, fraction: 9 / 36, nightsLeft: 27 });
  });
  it("clamps to 1..total", () => {
    expect(dayIndex({ startDate: "2026-12-04", endDate: "2026-12-06", today: "2026-12-01" }).day).toBe(1);
    expect(dayIndex({ startDate: "2026-12-04", endDate: "2026-12-06", today: "2026-12-09" }).day).toBe(3);
  });
});

describe("currentLeg", () => {
  const legs = [
    { id: "a", depAt: "2026-12-15T09:05:00.000Z", arrAt: "2026-12-15T11:15:00.000Z" },
    { id: "b", depAt: null, arrAt: "2026-12-16T11:15:00.000Z" },
  ];
  it("finds the leg whose dep <= now < arr", () => {
    expect(currentLeg(legs, new Date("2026-12-15T10:00:00Z"))?.id).toBe("a");
  });
  it("is null at the arrival instant, before departure, and for a leg missing a time", () => {
    expect(currentLeg(legs, new Date("2026-12-15T11:15:00Z"))).toBeNull();
    expect(currentLeg(legs, new Date("2026-12-15T09:00:00Z"))).toBeNull();
    expect(currentLeg(legs, new Date("2026-12-16T10:00:00Z"))).toBeNull();
  });
  it("accepts Date instants", () => {
    const d = [{ depAt: new Date("2026-12-15T09:00:00Z"), arrAt: new Date("2026-12-15T12:00:00Z") }];
    expect(currentLeg(d, new Date("2026-12-15T10:00:00Z"))).toBe(d[0]);
  });
});

describe("stopStatuses", () => {
  const stops = [
    { id: "lon", arriveDate: "2026-12-05" },
    { id: "par", arriveDate: "2026-12-10" },
    { id: "rom", arriveDate: "2026-12-15" },
  ];
  it("marks the current stop, the ones before it past, the ones after future", () => {
    const m = stopStatuses(stops, "par", "2026-12-12");
    expect([...m.values()]).toEqual(["past", "current", "future"]);
  });
  it("on a changeover day the arriving stop is current and the departing one past", () => {
    const m = stopStatuses(stops, "par", "2026-12-10");
    expect(m.get("lon")).toBe("past");
    expect(m.get("par")).toBe("current");
  });
  it("before the trip everything is future; after it everything is past", () => {
    expect([...stopStatuses(stops, null, "2026-11-01").values()]).toEqual(["future", "future", "future"]);
    expect([...stopStatuses(stops, null, "2027-02-01").values()]).toEqual(["past", "past", "past"]);
  });
});

describe("nextStopAfter", () => {
  const s = [{ id: "a" }, { id: "b" }];
  it("returns the following stop, or null at the end / without an id", () => {
    expect(nextStopAfter(s, "a")).toEqual({ id: "b" });
    expect(nextStopAfter(s, "b")).toBeNull();
    expect(nextStopAfter(s, null)).toBeNull();
  });
});

describe("shareTally", () => {
  it("counts nights, stops and distinct countries (nulls ignored)", () => {
    expect(shareTally([{ country: "France" }, { country: "France" }, { country: "Italy" }, { country: null }], 35))
      .toEqual({ nights: 35, stops: 4, countries: 2 });
  });
});

describe("travellersLabel", () => {
  it("reads naturally for 1, 2 and many", () => {
    expect(travellersLabel([])).toBe("");
    expect(travellersLabel(["Cameron"], { possessive: true })).toBe("Cameron's trip");
    expect(travellersLabel(["Cameron", "Sam"], { possessive: true })).toBe("Cameron & Sam's trip");
    expect(travellersLabel(["Cameron", "Sam"])).toBe("Cameron & Sam");
    expect(travellersLabel(["A", "B", "C"], { possessive: true })).toBe("A, B & 1 other");
    expect(travellersLabel(["A", "B", "C", "D"])).toBe("A, B & 2 others");
  });
});

describe("polaroidTilt", () => {
  it("is stable for an id and always within ±2°", () => {
    expect(polaroidTilt("2026-12-05:u1")).toBe(polaroidTilt("2026-12-05:u1"));
    for (const id of ["a", "b", "c", "2026-12-05:u1", "x".repeat(40)]) {
      const t = polaroidTilt(id);
      expect(Math.abs(t)).toBeLessThanOrEqual(2);
      expect(t).not.toBe(0);
    }
  });
});

describe("isDoneAt", () => {
  it("uses the end time, else start + 1h; untimed is never done", () => {
    expect(isDoneAt("08:40", "09:10", "09:10")).toBe(true);
    expect(isDoneAt("08:40", "09:10", "09:09")).toBe(false);
    expect(isDoneAt("13:30", null, "14:29")).toBe(false);
    expect(isDoneAt("13:30", null, "14:30")).toBe(true);
    expect(isDoneAt("23:30", null, "23:59")).toBe(true);
    expect(isDoneAt(null, null, "23:59")).toBe(false);
  });
});

describe("groupDaysByStop", () => {
  it("groups by the day's stop, a gap day joining the stop before it", () => {
    const days = [
      { d: 1, stop: { id: "a" } },
      { d: 2, stop: null },
      { d: 3, stop: { id: "b" } },
    ];
    const g = groupDaysByStop(days, ["a", "b"]);
    expect(g.get("a")!.map((x) => x.d)).toEqual([1, 2]);
    expect(g.get("b")!.map((x) => x.d)).toEqual([3]);
  });
  it("a leading gap day joins the first stop; an unknown stop id is dropped", () => {
    const g = groupDaysByStop([{ stop: null }, { stop: { id: "zz" } }], ["a"]);
    expect(g.get("a")).toHaveLength(1);
  });
});

describe("shareSections (SHARE.md §1 order)", () => {
  const all = { journal: true, days: true, next: true, map: true };
  it("before", () => {
    expect(shareSections("before", all)).toEqual(["hero", "map", "route", "days", "cta"]);
  });
  it("during", () => {
    expect(shareSections("during", all)).toEqual(["hero", "right-now", "next", "journal", "map", "route", "days", "cta"]);
  });
  it("after", () => {
    expect(shareSections("after", all)).toEqual(["hero", "tally", "journal", "route", "map", "days", "cta"]);
  });
  it("skips what the link or the data hides", () => {
    expect(shareSections("during", { journal: false, days: false, next: false, map: false }))
      .toEqual(["hero", "right-now", "route", "cta"]);
  });
});
```

`lib/dates.test.ts` (append):

```ts
import { formatDayRange, formatMonthSpan, formatWeekday } from "./dates";

describe("share date formatters", () => {
  it("formatDayRange: weekday day month on both ends", () => {
    expect(formatDayRange("2026-12-04", "2027-01-08")).toBe("Fri 4 Dec – Fri 8 Jan");
  });
  it("formatMonthSpan collapses what it can", () => {
    expect(formatMonthSpan("2026-12-04", "2027-01-08")).toBe("Dec 2026 – Jan 2027");
    expect(formatMonthSpan("2026-03-28", "2026-04-04")).toBe("Mar – Apr 2026");
    expect(formatMonthSpan("2026-07-03", "2026-07-06")).toBe("Jul 2026");
  });
  it("formatWeekday", () => {
    expect(formatWeekday("2026-12-15")).toBe("Tue");
  });
});
```

`lib/share-ref.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shareRefParam, shareHrefs } from "./share-ref";

describe("shareRefParam", () => {
  it("is a stable 10-char hex prefix that is not the token", () => {
    const t = "0b9f0c3e-8a51-4c43-9d59-8d1e0c6c2a11";
    expect(shareRefParam(t)).toMatch(/^[0-9a-f]{10}$/);
    expect(shareRefParam(t)).toBe(shareRefParam(t));
    expect(t).not.toContain(shareRefParam(t));
  });
});

describe("shareHrefs (ADR 0057 invite-only door)", () => {
  const t = "tok-123";
  const h = shareHrefs(t);
  it("sends Request access to the Landing's request panel with the hashed ref, never the raw token", () => {
    expect(h.requestAccess).toBe(`/?panel=request&ref=share&t=${shareRefParam(t)}`);
    expect(h.requestAccess).not.toContain(t);
  });
  it("sends Use this route through sign-in with a callbackUrl carrying fromShare", () => {
    const u = new URL(h.useRoute, "http://x");
    expect(u.pathname).toBe("/");
    expect(u.searchParams.get("panel")).toBe("sign-in");
    expect(u.searchParams.get("t")).toBe(shareRefParam(t));
    expect(u.searchParams.get("callbackUrl")).toBe("/trips/new?fromShare=tok-123");
  });
  it("start from scratch goes to a blank New trip after sign-in", () => {
    expect(new URL(h.fromScratch, "http://x").searchParams.get("callbackUrl")).toBe("/trips/new");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/share-view.test.ts lib/dates.test.ts lib/share-ref.test.ts`
Expected: FAIL (the exports don't exist).

- [ ] **Step 3: Implement**

Append to `lib/share-view.ts` (keep `ShareScope`, `scopeCaption` and `tonightsStay` unchanged):

```ts
import type { TripPhase } from "@/lib/trip-phase";
import { daysBetween, dayNumberInTrip, nightsBetween } from "@/lib/dates";

export type ShareStage = "before" | "during" | "after";

/** SHARE.md §1: the public page's three stages, read off the Phase. */
export function shareStage(phase: TripPhase): ShareStage {
  if (phase === "travelling") return "during";
  if (phase === "past") return "after";
  return "before";
}

export interface DayIndex {
  day: number;
  total: number;
  fraction: number;
  nightsLeft: number;
}

/** Day N of M on the same inclusive base as describePhase (lib/trip-phase.ts). */
export function dayIndex({ startDate, endDate, today }: { startDate: string; endDate: string; today: string }): DayIndex {
  const total = daysBetween(startDate, endDate) + 1;
  const day = Math.min(total, Math.max(1, dayNumberInTrip(today, startDate)));
  return { day, total, fraction: day / total, nightsLeft: nightsBetween(today, endDate) };
}

/** The transport in progress: departed, not yet arrived. Both instants must be known. */
export function currentLeg<T extends { depAt: Date | string | null; arrAt: Date | string | null }>(
  transports: T[],
  now: Date,
): T | null {
  const t = now.getTime();
  for (const leg of transports) {
    if (!leg.depAt || !leg.arrAt) continue;
    if (new Date(leg.depAt).getTime() <= t && t < new Date(leg.arrAt).getTime()) return leg;
  }
  return null;
}

export type StopStatus = "past" | "current" | "future";

/**
 * `currentStopId` is the itinerary's stop for today (buildItinerary picks the
 * latest-arrived stop, so a changeover day belongs to the arriving stop).
 */
export function stopStatuses(
  stops: { id: string; arriveDate: string }[],
  currentStopId: string | null,
  todayISO: string,
): Map<string, StopStatus> {
  const out = new Map<string, StopStatus>();
  for (const s of stops) {
    if (s.id === currentStopId) out.set(s.id, "current");
    else if (s.arriveDate > todayISO) out.set(s.id, "future");
    else out.set(s.id, "past");
  }
  return out;
}

export function nextStopAfter<S extends { id: string }>(stops: S[], id: string | null): S | null {
  if (!id) return null;
  const i = stops.findIndex((s) => s.id === id);
  return i >= 0 && i + 1 < stops.length ? stops[i + 1] : null;
}

/** SHARE.md §6 — nights, stops, countries. Never distance or spend. */
export function shareTally(stops: { country: string | null }[], totalNights: number) {
  const countries = new Set(stops.map((s) => s.country?.trim()).filter((c): c is string => Boolean(c)));
  return { nights: totalNights, stops: stops.length, countries: countries.size };
}

export function travellersLabel(names: string[], opts: { possessive?: boolean } = {}): string {
  if (names.length === 0) return "";
  const s = opts.possessive ? "'s trip" : "";
  if (names.length === 1) return `${names[0]}${s}`;
  if (names.length === 2) return `${names[0]} & ${names[1]}${s}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} & ${rest} other${rest === 1 ? "" : "s"}`;
}

const TILTS = [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2];

/** Derived from the id, not Math.random(), so server and client agree. */
export function polaroidTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TILTS[Math.abs(h) % TILTS.length];
}

function plusHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** SHARE.md §4: a row is done once its end time (or start + 1h) has passed, local time. */
export function isDoneAt(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  nowHHMM: string,
): boolean {
  const end = endTime ?? (startTime ? plusHour(startTime) : null);
  return end != null && end <= nowHHMM;
}

export function groupDaysByStop<D extends { stop: { id: string } | null }>(
  days: D[],
  stopIds: string[],
): Map<string, D[]> {
  const out = new Map<string, D[]>(stopIds.map((id) => [id, []]));
  let last: string | null = stopIds[0] ?? null;
  for (const day of days) {
    const id = day.stop?.id ?? last;
    if (id && out.has(id)) {
      out.get(id)!.push(day);
      last = id;
    }
  }
  return out;
}

export type ShareSection = "hero" | "right-now" | "next" | "tally" | "journal" | "map" | "route" | "days" | "cta";

const ORDER: Record<ShareStage, ShareSection[]> = {
  before: ["hero", "map", "route", "days", "cta"],
  during: ["hero", "right-now", "next", "journal", "map", "route", "days", "cta"],
  after: ["hero", "tally", "journal", "route", "map", "days", "cta"],
};

/** Mobile DOM order per stage (SHARE.md §1); desktop reorders with lg:order-*. */
export function shareSections(
  stage: ShareStage,
  has: { journal: boolean; days: boolean; next: boolean; map: boolean },
): ShareSection[] {
  return ORDER[stage].filter(
    (s) => (s !== "journal" || has.journal) && (s !== "days" || has.days) && (s !== "next" || has.next) && (s !== "map" || has.map),
  );
}
```

Put the two `import` lines at the top of the file with any existing imports (the file has none today).

Append to `lib/dates.ts`, next to `formatDayLabel` (it reuses the module's `MONTH_SHORT` / `DAY_SHORT`):

```ts
/** "Fri 4 Dec – Fri 8 Jan" — a trip's span with weekdays, no year (the share hero). */
export function formatDayRange(start: string, end: string): string {
  return `${formatDayLabel(start)} – ${formatDayLabel(end)}`;
}

/** "Dec 2026 – Jan 2027", "Mar – Apr 2026", "Jul 2026" — the months a trip spanned. */
export function formatMonthSpan(start: string, end: string): string {
  const s = parseISODate(start);
  const e = parseISODate(end);
  const sm = MONTH_SHORT[s.getUTCMonth()];
  const em = MONTH_SHORT[e.getUTCMonth()];
  const sy = s.getUTCFullYear();
  const ey = e.getUTCFullYear();
  if (sy !== ey) return `${sm} ${sy} – ${em} ${ey}`;
  if (sm !== em) return `${sm} – ${em} ${sy}`;
  return `${sm} ${sy}`;
}

/** "Tue". */
export function formatWeekday(s: string): string {
  return DAY_SHORT[parseISODate(s).getUTCDay()];
}
```

`lib/share-ref.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * Share-page attribution (SHARE.md §2): a hash prefix of the token, so a
 * sign-up can be traced to "a share page" without the raw bearer token ever
 * landing in a URL, a log or an analytics tool.
 */
export function shareRefParam(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 10);
}

export interface ShareHrefs {
  requestAccess: string;
  useRoute: string;
  fromScratch: string;
}

/** The invite-only door (ADR 0057): every CTA goes through the Landing. */
export function shareHrefs(token: string): ShareHrefs {
  const ref = `ref=share&t=${shareRefParam(token)}`;
  const signIn = (callbackUrl: string) =>
    `/?panel=sign-in&${ref}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  return {
    requestAccess: `/?panel=request&${ref}`,
    // Carries the raw token by necessity: New trip needs it to copy the route.
    useRoute: signIn(`/trips/new?fromShare=${encodeURIComponent(token)}`),
    fromScratch: signIn("/trips/new"),
  };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- lib/share-view.test.ts lib/dates.test.ts lib/share-ref.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/share-view.ts lib/share-view.test.ts lib/dates.ts lib/dates.test.ts lib/share-ref.ts lib/share-ref.test.ts
git commit -m "feat(share): stage helpers — shareStage, dayIndex, currentLeg, stop status, tally, CTA hrefs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 4: Share lookup module, Traveller projection and the link-scoped Traveller photo route

**Files:**
- Create: `lib/share-lookup.ts`
- Create: `lib/share-lookup.test.ts`
- Create: `lib/share-traveller.ts`
- Create: `lib/share-traveller.test.ts`
- Create: `lib/avatar-serve.ts` (extracted from `app/api/avatars/[userId]/route.ts`)
- Modify: `app/api/avatars/[userId]/route.ts` (call the extracted helper; its `route.test.ts` must pass unchanged)
- Create: `app/share/[token]/traveller-photo/[userId]/route.ts`
- Create: `app/share/[token]/traveller-photo/[userId]/route.test.ts`
- Modify: `app/share/[token]/page.tsx` (use `findShareLink` / `loadShareStops`; no visible change)
- Modify: `CONTEXT.md` ("Profile photo and display name", line ~246: "never on a **Share link**" → "never on a **Share link** unless that link's *Show who's going* is on (ADR 0051 amendment 2026-09-30)")

**Interfaces:**
- Produces (`lib/share-lookup.ts`):
  - `SHARE_TRIP_SELECT` (id, name, startDate, endDate, homeName, homeLat, homeLng, roundTrip; the `// homeCurrency intentionally omitted — no money on public page` comment moves here)
  - `findShareLink(token: string)`, which resolves to `{ id; includeAccommodation; includeTransport; includeDailyPlans; includeJournal; showTravellers; trip: {…SHARE_TRIP_SELECT} } | null`
  - `interface ShareStop { id: string; name: string; country: string | null; lat: number | null; lng: number | null; timezone: string; arriveDate: string; departDate: string; sortOrder: number }`
  - `loadShareStops(tripId: string): Promise<ShareStop[]>` (dated real-plan stops, `orderPlanStops`-ordered, `timezone ?? "UTC"`)
- Produces (`lib/share-traveller.ts`):
  - `interface ShareTraveller { id: string; name: string; firstName: string; image: string | null; focalX: number | null; focalY: number | null }`
  - `shareTraveller(u: TravellerLike, opts: { token: string; showPhoto: boolean }): ShareTraveller`
  - `avatarInput(t: ShareTraveller): TravellerLike` (feeds `TravellerAvatar`: `photoKey: null`, so `travellerImageUrl` returns the link-scoped `image` and never `/api/avatars`)
- Produces (`lib/avatar-serve.ts`): `serveProfilePhoto(photoKey: string, opts: { cacheControl: string }): Promise<Response>`; `profilePhotoContentType(key: string): string`.
- Produces a route: `GET /share/:token/traveller-photo/:userId`.

- [ ] **Step 1: Write the failing tests**

`lib/share-traveller.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shareTraveller, avatarInput } from "./share-traveller";
import { travellerImageUrl } from "./traveller";

const cam = {
  id: "u1", name: "Cam Williams", displayName: "Cameron", image: "https://lh3.example/cam.png",
  photoKey: "avatars/u1.jpg", photoUpdatedAt: new Date(5000), photoFocalX: 0.3, photoFocalY: 0.6,
  email: "cam@example.com",
};

describe("shareTraveller (ADR 0051 amendment 2026-09-30)", () => {
  it("never carries an email, and names by display name", () => {
    const t = shareTraveller(cam, { token: "tok", showPhoto: true });
    expect(JSON.stringify(t)).not.toContain("cam@example.com");
    expect(t.name).toBe("Cameron");
    expect(t.firstName).toBe("Cameron");
  });
  it("with the dial off there is no photo at all", () => {
    expect(shareTraveller(cam, { token: "tok", showPhoto: false }).image).toBeNull();
  });
  it("an uploaded photo goes through the link-scoped route, never /api/avatars", () => {
    const t = shareTraveller(cam, { token: "tok", showPhoto: true });
    expect(t.image).toBe("/share/tok/traveller-photo/u1?v=5000");
    expect(travellerImageUrl(avatarInput(t))).toBe("/share/tok/traveller-photo/u1?v=5000");
  });
  it("falls back to the provider picture, then nothing", () => {
    expect(shareTraveller({ ...cam, photoKey: null }, { token: "tok", showPhoto: true }).image).toBe("https://lh3.example/cam.png");
    expect(shareTraveller({ ...cam, photoKey: null, image: null }, { token: "tok", showPhoto: true }).image).toBeNull();
  });
  it("never falls back to the email local-part for a name", () => {
    const t = shareTraveller({ id: "u2", name: null, image: null, email: "secret.person@example.com" }, { token: "tok", showPhoto: false });
    expect(t.name).toBe("Traveller");
  });
});
```

`lib/share-lookup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, findMany } = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { shareLink: { findUnique }, stop: { findMany } } }));

import { findShareLink, loadShareStops } from "./share-lookup";

beforeEach(() => vi.clearAllMocks());

describe("findShareLink", () => {
  it("looks the token up and selects the dials, never money", async () => {
    findUnique.mockResolvedValue(null);
    expect(await findShareLink("tok")).toBeNull();
    const arg = findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ token: "tok" });
    expect(Object.keys(arg.select)).toEqual(expect.arrayContaining(["id", "includeJournal", "showTravellers", "trip"]));
    expect(Object.keys(arg.select.trip.select)).not.toContain("homeCurrency");
  });
});

describe("loadShareStops", () => {
  it("reads only dated real-plan stops, never notes, and orders them canonically", async () => {
    findMany.mockResolvedValue([
      { id: "b", name: "B", country: null, lat: 1, lng: 1, timezone: null, arriveDate: "2026-01-05", departDate: "2026-01-06", sortOrder: 0 },
      { id: "a", name: "A", country: "X", lat: 2, lng: 2, timezone: "Europe/Paris", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 1 },
    ]);
    const stops = await loadShareStops("t1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tripId: "t1", forkId: null, arriveDate: { not: null } });
    expect(Object.keys(arg.select)).not.toContain("notes");
    expect(stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(stops[1].timezone).toBe("UTC");
  });
});
```

`app/share/[token]/traveller-photo/[userId]/route.test.ts` (read `app/api/avatars/[userId]/route.test.ts` and `app/share/[token]/journal-photo/[attachmentId]/route.test.ts` first and copy their storage-mock idiom):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { shareFindUnique, memberFindFirst, userFindUnique, serveProfilePhoto } = vi.hoisted(() => ({
  shareFindUnique: vi.fn(),
  memberFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  serveProfilePhoto: vi.fn(async () => new Response("img", { status: 200 })),
}));
vi.mock("@/lib/db", () => ({
  db: { shareLink: { findUnique: shareFindUnique }, tripMember: { findFirst: memberFindFirst }, user: { findUnique: userFindUnique } },
}));
vi.mock("@/lib/avatar-serve", () => ({ serveProfilePhoto }));

import { GET } from "./route";

const call = () =>
  GET(new NextRequest("http://x/share/tok/traveller-photo/u1"), { params: Promise.resolve({ token: "tok", userId: "u1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  shareFindUnique.mockResolvedValue({ tripId: "t1", showTravellers: true });
  memberFindFirst.mockResolvedValue({ id: "m1" });
  userFindUnique.mockResolvedValue({ photoKey: "avatars/u1.jpg" });
});

describe("GET /share/:token/traveller-photo/:userId", () => {
  it("serves a member's photo when the link shows travellers", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(serveProfilePhoto).toHaveBeenCalledWith("avatars/u1.jpg", { cacheControl: "private, max-age=300" });
    expect(memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "t1", userId: "u1" } }));
  });
  it.each([
    ["unknown or revoked token", () => shareFindUnique.mockResolvedValue(null)],
    ["dial off", () => shareFindUnique.mockResolvedValue({ tripId: "t1", showTravellers: false })],
    ["not a member of that trip", () => memberFindFirst.mockResolvedValue(null)],
    ["no uploaded photo", () => userFindUnique.mockResolvedValue({ photoKey: null })],
  ])("404s (no-store) when %s", async (_n, arrange) => {
    arrange();
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(serveProfilePhoto).not.toHaveBeenCalled();
  });
  it("never selects email", async () => {
    await call();
    expect(Object.keys(userFindUnique.mock.calls[0][0].select)).toEqual(["photoKey"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/share-traveller.test.ts lib/share-lookup.test.ts "app/share/[token]/traveller-photo"`
Expected: FAIL (the modules don't exist).

- [ ] **Step 3: Implement**

`lib/share-traveller.ts`:

```ts
import { travellerFirstName, travellerName, type TravellerLike } from "@/lib/traveller";

export interface ShareTraveller {
  id: string;
  name: string;
  firstName: string;
  image: string | null;
  focalX: number | null;
  focalY: number | null;
}

/**
 * A Traveller as a Share link may show them (ADR 0051 amendment 2026-09-30):
 * display name always, photo only when the link's showTravellers is on, and
 * an uploaded photo only via the link-scoped route — /api/avatars needs a
 * session a Share visitor never has. `email` is stripped before naming so
 * travellerName can never fall back to its local-part.
 */
export function shareTraveller(u: TravellerLike, opts: { token: string; showPhoto: boolean }): ShareTraveller {
  const named = { ...u, email: null };
  let image: string | null = null;
  if (opts.showPhoto) {
    if (u.photoKey) {
      const v = u.photoUpdatedAt ? new Date(u.photoUpdatedAt).getTime() : 0;
      image = `/share/${opts.token}/traveller-photo/${u.id}?v=${v}`;
    } else {
      image = u.image ?? null;
    }
  }
  return {
    id: u.id,
    name: travellerName(named),
    firstName: travellerFirstName(named),
    image,
    focalX: u.photoFocalX ?? null,
    focalY: u.photoFocalY ?? null,
  };
}

export function avatarInput(t: ShareTraveller): TravellerLike {
  return { id: t.id, name: t.name, displayName: null, image: t.image, photoKey: null, photoFocalX: t.focalX, photoFocalY: t.focalY };
}
```

`lib/share-lookup.ts`: move the `shareLink.findUnique` (adding `id: true` and `showTravellers: true` to its select) and the `stop.findMany` + `orderPlanStops` mapping **verbatim** out of `app/share/[token]/page.tsx`, keeping every "intentionally omitted" comment. Add a file header:

```ts
/**
 * The Share link's public projection (ADR 0051) — the one lookup the share
 * page, its OG image and Route copy all go through, so all three refuse the
 * same revoked or rotated token and read the same fields. A revoked link's
 * row is deleted (server/actions/share.ts revokeShareLink) and a rotated
 * one's token replaced, so either simply matches nothing here.
 */
```

`findShareLink(token)` returns the `findUnique` result. `loadShareStops(tripId)` runs the stop query `where: { tripId, ...REAL_PLAN, arriveDate: { not: null } }` with the same `select`. It returns `orderPlanStops(rows.map((s) => ({ ...s, timezone: s.timezone ?? "UTC", arriveDate: s.arriveDate!, departDate: s.departDate! })))` typed as `ShareStop[]`.

`app/share/[token]/page.tsx`: replace the two inline queries with `const shareLink = await findShareLink(token);` and `const stops = await loadShareStops(tripId);`. Leave everything else unchanged. The existing `page.test.tsx` must still pass untouched.

`lib/avatar-serve.ts`: move `contentTypeFor` (renamed `profilePhotoContentType` and exported), `PRESIGN_EXPIRY_SECONDS` and steps 3–4 of `app/api/avatars/[userId]/route.ts` (presign → 302 `no-store`; else read bytes → 200 with `Content-Type`, `Content-Disposition`, `Content-Length`, `X-Content-Type-Options: nosniff`, `Cache-Control: opts.cacheControl`; missing bytes → 404 `no-store`) into `serveProfilePhoto(photoKey, { cacheControl })`. Pass `cacheControl` to `presignDownload`. The avatars route calls `serveProfilePhoto(user.photoKey, { cacheControl: "private, max-age=3600" })`, and its existing tests must stay green without edits.

`app/share/[token]/traveller-photo/[userId]/route.ts`: header comment modelled on the journal-photo route. It has no auth and imports no server action. It 404s (`{ error: "Not found" }`, `Cache-Control: no-store`) unless ALL of these hold: (1) `db.shareLink.findUnique({ where: { token }, select: { tripId: true, showTravellers: true } })` exists with `showTravellers`; (2) `db.tripMember.findFirst({ where: { tripId, userId }, select: { id: true } })` exists; (3) `db.user.findUnique({ where: { id: userId }, select: { photoKey: true } })` has a `photoKey`. Then `return serveProfilePhoto(photoKey, { cacheControl: "private, max-age=300" })`.

`CONTEXT.md`: make the one-clause edit listed under Files.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- lib/share-traveller.test.ts lib/share-lookup.test.ts "app/share/[token]" "app/api/avatars"`
Expected: PASS (including the untouched `page.test.tsx` and `app/api/avatars/[userId]/route.test.ts`).

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/share-lookup.ts lib/share-lookup.test.ts lib/share-traveller.ts lib/share-traveller.test.ts lib/avatar-serve.ts "app/api/avatars/[userId]/route.ts" "app/share/[token]/traveller-photo" "app/share/[token]/page.tsx" CONTEXT.md
git commit -m "feat(share): one public lookup; link-scoped Traveller photos behind showTravellers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 5: Route copy — `routeStopsFromShare`

**Files:**
- Create: `server/actions/copy-route-from-share.ts` (**no** `"use server"`)
- Create: `server/actions/copy-route-from-share.test.ts`

**Interfaces:**
- Consumes: `findShareLink`, `loadShareStops` (Task 4); `nightsBetween` (`lib/dates.ts`).
- Produces: `interface SharedRouteStop { name: string; country: string | null; lat: number | null; lng: number | null; nights: number }`; `routeStopsFromShare(token: string): Promise<{ linkId: string; tripName: string; stops: SharedRouteStop[] } | null>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { findShareLink, loadShareStops } = vi.hoisted(() => ({ findShareLink: vi.fn(), loadShareStops: vi.fn() }));
vi.mock("@/lib/share-lookup", () => ({ findShareLink, loadShareStops }));

import { routeStopsFromShare } from "./copy-route-from-share";

const LINK = { id: "link-1", trip: { id: "t1", name: "Christmas in Europe", startDate: "2026-12-04", endDate: "2027-01-08" } };

beforeEach(() => {
  vi.clearAllMocks();
  findShareLink.mockResolvedValue(LINK);
  loadShareStops.mockResolvedValue([
    { id: "s1", name: "London", country: "England", lat: 51.5, lng: -0.1, timezone: "Europe/London", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
    { id: "s2", name: "Paris", country: "France", lat: 48.9, lng: 2.35, timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-15", sortOrder: 1 },
  ]);
});

describe("routeStopsFromShare (CONTEXT.md Route copy)", () => {
  it("copies the public stops as name, country, coords and nights — nothing else", async () => {
    const r = await routeStopsFromShare("tok");
    expect(r).toEqual({
      linkId: "link-1",
      tripName: "Christmas in Europe",
      stops: [
        { name: "London", country: "England", lat: 51.5, lng: -0.1, nights: 5 },
        { name: "Paris", country: "France", lat: 48.9, lng: 2.35, nights: 5 },
      ],
    });
    expect(findShareLink).toHaveBeenCalledWith("tok");
  });
  it("returns null for an unknown/revoked token (a revoked link's row is deleted)", async () => {
    findShareLink.mockResolvedValue(null);
    expect(await routeStopsFromShare("gone")).toBeNull();
    expect(loadShareStops).not.toHaveBeenCalled();
  });
  it("returns null for a date-less trip, exactly as the share page 404s it", async () => {
    findShareLink.mockResolvedValue({ ...LINK, trip: { ...LINK.trip, startDate: null } });
    expect(await routeStopsFromShare("tok")).toBeNull();
  });
  it("is not a server-action module (every export would be a public endpoint)", () => {
    const src = readFileSync(join(__dirname, "copy-route-from-share.ts"), "utf8");
    expect(src).not.toMatch(/^\s*["']use server["']/m);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- server/actions/copy-route-from-share.test.ts`
Expected: FAIL (the module doesn't exist).

- [ ] **Step 3: Implement**

```ts
import { findShareLink, loadShareStops } from "@/lib/share-lookup";
import { nightsBetween } from "@/lib/dates";

// Deliberately NOT "use server": only createTrip calls this, after its own
// requireUser(). As a server action it would be a second, unguarded endpoint.

export interface SharedRouteStop {
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  nights: number;
}

/**
 * Route copy (CONTEXT.md; spec §E.3): the stops a Share link shows, reduced
 * to what a new Trip's rough Stops carry. Through the same lookup as the
 * page, so a revoked or rotated token resolves to nothing and is refused.
 * No dates, Items, stays, transport or Journal.
 */
export async function routeStopsFromShare(
  token: string,
): Promise<{ linkId: string; tripName: string; stops: SharedRouteStop[] } | null> {
  const link = await findShareLink(token);
  if (!link || !link.trip.startDate || !link.trip.endDate) return null;
  const stops = await loadShareStops(link.trip.id);
  return {
    linkId: link.id,
    tripName: link.trip.name,
    stops: stops.map((s) => ({
      name: s.name,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
      nights: nightsBetween(s.arriveDate, s.departDate),
    })),
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- server/actions/copy-route-from-share.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add server/actions/copy-route-from-share.ts server/actions/copy-route-from-share.test.ts
git commit -m "feat(share): routeStopsFromShare — public stops only, refused once revoked

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 6: The Landing honours `?panel=` and a safe `callbackUrl`

**Files:**
- Create: `lib/safe-callback.ts`
- Create: `lib/safe-callback.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/page.test.tsx`
- Modify: `app/landing/landing.tsx`
- Modify: `app/landing/sign-in-panel.tsx`
- Modify: `app/landing/sign-in-controls.tsx`
- Modify: `app/landing/signin-buttons.tsx`
- Modify: `app/landing/sign-in-panel.test.tsx`, `app/landing/sign-in-controls.test.tsx`

**Interfaces:**
- Produces:
  - `safeCallbackPath(raw: string | string[] | undefined): string | null`
  - `panelFromParam(raw: string | string[] | undefined): "sign-in" | "request" | undefined`
  - `Landing({ accessDenied?, initialPanel?: "sign-in" | "request", callbackUrl?: string | null })`
  - `SignInPanelProvider` `initialMode?: "denied" | "sign-in" | "request"`
  - `SignInControls({ …, callbackUrl?: string })`
  - `GoogleSignInButton({ …, callbackUrl?: string })`, `DevSignInButton({ …, callbackUrl?: string })`, both defaulting to `"/trips"`.
- Behaviour: `/` with a session redirects to `safeCallbackPath(callbackUrl) ?? "/trips"`. Without a session, it opens the panel in `panel` mode ("denied" still wins), and the Google/dev buttons sign in with that `callbackUrl`. A refused sign-in comes back as `/?error=AccessDenied` and loses `callbackUrl`. The spec accepts that.

- [ ] **Step 1: Write the failing tests**

`lib/safe-callback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { safeCallbackPath, panelFromParam } from "./safe-callback";

describe("safeCallbackPath", () => {
  it("keeps a same-origin path with its query", () => {
    expect(safeCallbackPath("/trips/new?fromShare=abc")).toBe("/trips/new?fromShare=abc");
    expect(safeCallbackPath(["/trips", "/x"])).toBe("/trips");
  });
  it.each(["//evil.example", "https://evil.example/", "/\\evil.example", "javascript:alert(1)", "trips", "", "/trips\n/x"])(
    "drops %j",
    (raw) => {
      expect(safeCallbackPath(raw)).toBeNull();
    },
  );
  it("drops undefined", () => {
    expect(safeCallbackPath(undefined)).toBeNull();
  });
});

describe("panelFromParam", () => {
  it("reads sign-in or request, ignores anything else", () => {
    expect(panelFromParam("request")).toBe("request");
    expect(panelFromParam(["sign-in"])).toBe("sign-in");
    expect(panelFromParam("denied")).toBeUndefined();
    expect(panelFromParam(undefined)).toBeUndefined();
  });
});
```

In `app/page.test.tsx`, read how it mocks `auth`, `db` and `redirect`, then add:

```ts
  it("sends a signed-in visitor to a safe callbackUrl (Use this route)", async () => {
    // arrange a session + user row exactly as the existing "redirects to /trips" test does
    await expect(RootPage({ searchParams: Promise.resolve({ callbackUrl: "/trips/new?fromShare=tok" }) })).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/trips/new?fromShare=tok");
  });

  it("ignores an off-site callbackUrl", async () => {
    // same arrangement
    await expect(RootPage({ searchParams: Promise.resolve({ callbackUrl: "//evil.example" }) })).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });
```

(Use the file's existing mock names. If `redirect` is mocked not to throw, drop the `rejects` and just `await`.)

In `app/landing/sign-in-panel.test.tsx`, add:

```ts
  it("opens straight into request mode when asked (from a Share page)", () => {
    render(
      <SignInPanelProvider controls={<div>controls</div>} initialMode="request">
        <LandingActions size="md" />
      </SignInPanelProvider>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Ask to join")).toBeInTheDocument();
  });
```

In `app/landing/sign-in-controls.test.tsx`, add a case that stubs `process.env.AUTH_GOOGLE_ID` and `process.env.AUTH_GOOGLE_SECRET` as the existing tests do. It mocks `next-auth/react`'s `signIn`, renders `<SignInControls callbackUrl="/trips/new?fromShare=tok" />`, clicks "Continue with Google", and expects `signIn` to have been called with `("google", { callbackUrl: "/trips/new?fromShare=tok" })`. Add a second case: without the prop, the callbackUrl is `"/trips"`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/safe-callback.test.ts app/page.test.tsx app/landing`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/safe-callback.ts`:

```ts
const BASE = "http://callback.invalid";

/**
 * A post-sign-in destination we are willing to redirect to: a same-origin
 * path only. Anything that could leave the site — "//host", a scheme, a
 * backslash trick, control characters — is dropped, not repaired.
 */
export function safeCallbackPath(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(v)) return null;
  try {
    const u = new URL(v, BASE);
    if (u.origin !== BASE) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

export function panelFromParam(raw: string | string[] | undefined): "sign-in" | "request" | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "sign-in" || v === "request" ? v : undefined;
}
```

`app/page.tsx`: `searchParams` becomes `Promise<{ error?: string | string[]; callbackUrl?: string | string[]; panel?: string | string[] }>`. Read the params **before** the session check. Then `const next = safeCallbackPath(callbackUrl);` and `redirect(next ?? "/trips")` in the signed-in branch. Return `<Landing accessDenied={isAccessDenied(error)} initialPanel={panelFromParam(panel)} callbackUrl={next} />`. Extend the doc comment with one sentence: "`?panel=` and `?callbackUrl=` come from a Share page (spec §E.2); `ref`/`t` ride along for attribution and are not read here."

`app/landing/landing.tsx`: accept `initialPanel` and `callbackUrl`. Pass `initialMode={accessDenied ? "denied" : initialPanel}` and `controls={<SignInControls callbackUrl={callbackUrl ?? undefined} />}`.

`app/landing/sign-in-panel.tsx`: widen the `initialMode` prop type to `Mode`. No other changes: `useState<Mode | null>(initialMode ?? null)` already works.

`app/landing/sign-in-controls.tsx`: add `callbackUrl?: string` to the props and forward it to `GoogleSignInButton` and both `DevSignInButton`s.

`app/landing/signin-buttons.tsx`: add `callbackUrl = "/trips"` to both buttons' props, used in their `signIn(…)` calls.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- lib/safe-callback.test.ts app/page.test.tsx app/landing`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/safe-callback.ts lib/safe-callback.test.ts app/page.tsx app/page.test.tsx app/landing
git commit -m "feat(landing): open the panel from ?panel= and honour a same-origin callbackUrl

For the Share page's invite-only door (ADR 0057, spec §E.2).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 7: `createTrip` copies the route server-side; New trip pre-fills from `?fromShare=`

**Files:**
- Modify: `server/actions/trips.ts` (`createTrip`)
- Modify: `server/actions/trips.test.ts`
- Modify: the New trip page. Find it with `find app -path '*trips/new/page.tsx'`. Phase 2 moved it into a `(focus)` route group, so **read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md` first**.
- Modify: that page's `page.test.tsx`

**Interfaces:**
- Consumes: `routeStopsFromShare` (Task 5). From Phase 2: `createTrip` input `fromShareToken?: string` and `stops?: { name; lat?; lng?; countryCode?; nights? }[]`, created as rough Stops, and the `NewTripFlow` props `initialName?: string` and `fromShareToken?: string`.
- Produces: `createTrip({ …, fromShareToken })`, which resolves the token server-side. An unknown or revoked token returns `fail({ form: ["That share link isn't available any more — start from scratch instead."] })` and creates nothing. Otherwise the derived stops **replace** any client-sent `stops`, `Trip.sourceShareLinkId` is set to the link id, and it redirects to `tripPath(slug, "/plan")`.

- [ ] **Step 1: Read Phase 2's code**

Run `grep -n "stops\|fromShareToken" server/actions/trips.ts lib/validations/trip.ts` and read how Phase 2 writes rough stops (inside the `$transaction`) and what its `redirect` does with stops. If its per-stop write doesn't carry `country`, add an optional `country?: string | null` to the stop input schema and write it through. The copied Stop keeps its country name; `countryCode` stays null until derived, as for any new Stop.

- [ ] **Step 2: Write the failing tests**

In `server/actions/trips.test.ts`, add near the other hoisted mocks:

```ts
const { routeStopsFromShareMock } = vi.hoisted(() => ({ routeStopsFromShareMock: vi.fn() }));
vi.mock("@/server/actions/copy-route-from-share", () => ({ routeStopsFromShare: routeStopsFromShareMock }));
```

Then, in `describe("createTrip")`:

```ts
  it("copies a Share link's route server-side, ignoring any client-sent stops (spec §E.3)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-9", name: "Christmas in Europe (my version)" });
    memberCreateMock.mockResolvedValue({});
    routeStopsFromShareMock.mockResolvedValue({
      linkId: "link-1",
      tripName: "Christmas in Europe",
      stops: [{ name: "London", country: "England", lat: 51.5, lng: -0.1, nights: 5 }],
    });

    await expect(
      createTrip({
        name: "Christmas in Europe (my version)",
        homeCurrency: "AUD",
        fromShareToken: "tok",
        stops: [{ name: "Injected", nights: 99 }],
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(routeStopsFromShareMock).toHaveBeenCalledWith("tok");
    expect(tripCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceShareLinkId: "link-1" }) }),
    );
    // Assert against the mock Phase 2's tests use for the rough-stop write:
    // exactly one stop, "London", nights 5, arriveDate/departDate null — and never "Injected".
    expect(redirectMock).toHaveBeenCalledWith(expect.stringMatching(/\/plan$/));
  });

  it("refuses a revoked token without creating a trip", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    routeStopsFromShareMock.mockResolvedValue(null);
    const result = await createTrip({ name: "X (my version)", homeCurrency: "AUD", fromShareToken: "gone" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.form?.[0]).toMatch(/isn't available any more/);
    expect(tripCreateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("leaves sourceShareLinkId unset without a token", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-123", name: "Japan 2026" });
    memberCreateMock.mockResolvedValue({});
    await expect(createTrip(VALID_INPUT)).rejects.toThrow("NEXT_REDIRECT");
    expect(routeStopsFromShareMock).not.toHaveBeenCalled();
    expect(tripCreateMock.mock.calls[0][0].data.sourceShareLinkId ?? null).toBeNull();
  });
```

Replace the stop assertion comment with the concrete assertion once you've read Phase 2's mock. The existing "creates a Trip…" test compares the exact `data` object. If `sourceShareLinkId: null` breaks it, write the field only when set (`...(sharedRoute ? { sourceShareLinkId: sharedRoute.linkId } : {})`) and keep the third test as written.

New trip `page.test.tsx`: mock `@/server/actions/copy-route-from-share`, then add:

```ts
  it("pre-fills '{name} (my version)' and threads the token when ?fromShare= resolves", async () => {
    routeStopsFromShareMock.mockResolvedValue({ linkId: "l", tripName: "Christmas in Europe", stops: [] });
    render(await NewTripPage({ searchParams: Promise.resolve({ fromShare: "tok" }) }));
    expect(screen.getByDisplayValue("Christmas in Europe (my version)")).toBeInTheDocument();
    // and NewTripFlow received fromShareToken="tok" — assert the way the file's existing tests read props (mock NewTripFlow if they do)
  });

  it("ignores a ?fromShare= that no longer resolves", async () => {
    routeStopsFromShareMock.mockResolvedValue(null);
    render(await NewTripPage({ searchParams: Promise.resolve({ fromShare: "gone" }) }));
    expect(screen.queryByDisplayValue(/my version/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -- server/actions/trips.test.ts "$(dirname "$(find app -path '*trips/new/page.tsx')")"`
Expected: FAIL.

- [ ] **Step 4: Implement**

In `createTrip`, after `parsed.success` and **before** any geocoding or transaction:

```ts
  let sharedRoute: Awaited<ReturnType<typeof routeStopsFromShare>> = null;
  if (parsed.data.fromShareToken) {
    sharedRoute = await routeStopsFromShare(parsed.data.fromShareToken);
    if (!sharedRoute) {
      return fail({ form: ["That share link isn't available any more — start from scratch instead."] });
    }
  }
  // Never trust client-sent stops for a Route copy: rebuild them from the
  // public projection (spec §E.3).
  const stops = sharedRoute
    ? sharedRoute.stops.map((s) => ({ name: s.name, country: s.country, lat: s.lat ?? undefined, lng: s.lng ?? undefined, nights: s.nights }))
    : parsed.data.stops;
```

Use `stops` wherever Phase 2 used `parsed.data.stops`. Add `sourceShareLinkId` to `tx.trip.create`'s data (see the note in Step 2). Redirect: `sharedRoute ? tripPath(slug, "/plan") : <Phase 2's existing target>`. Imports: `fail` from `@/lib/action-result`, and `routeStopsFromShare` from `@/server/actions/copy-route-from-share`.

New trip page: add `fromShare?: string` to its `searchParams` type. When it's present, `const shared = await routeStopsFromShare(fromShare)`. If `shared` is non-null, pass `initialName={`${shared.tripName} (my version)`}` and `fromShareToken={fromShare}` to `NewTripFlow`. Otherwise pass neither. Don't render an error: a dead link simply starts a blank trip.

- [ ] **Step 5: Run them to see them pass**

Run the Step 3 command again. Expected: PASS.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add server/actions/trips.ts server/actions/trips.test.ts lib/validations/trip.ts "$(dirname "$(find app -path '*trips/new/page.tsx')")"
git commit -m "feat(trips): Route copy — createTrip rebuilds stops from the Share link, records sourceShareLinkId

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 8: Top bar, CTA card and footer

**Files:**
- Create: `app/share/[token]/share-top-bar.tsx`
- Create: `app/share/[token]/share-cta.tsx`
- Create: `app/share/[token]/share-chrome.test.tsx`

**Interfaces:**
- Consumes: `ShareHrefs` (Task 3); `Logo` (`components/ui/logo.tsx`); `Button` (`components/ui/button.tsx`, `asChild`); `next/link`.
- Produces: `ShareTopBar({ requestAccessHref }: { requestAccessHref: string })`; `ShareCta({ stage, stopCount, hrefs }: { stage: ShareStage; stopCount: number; hrefs: ShareHrefs })`; `ShareFooter()`; `export const SHARE_FOOTER_COPY = "View only. Costs, notes and booking references stay private to the people on the trip."`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShareTopBar } from "./share-top-bar";
import { ShareCta, ShareFooter, SHARE_FOOTER_COPY } from "./share-cta";

const hrefs = { requestAccess: "/?panel=request&ref=share&t=abc", useRoute: "/?panel=sign-in&callbackUrl=x", fromScratch: "/?panel=sign-in&callbackUrl=y" };

describe("ShareTopBar (SHARE.md §2)", () => {
  it("links both pills to Request access and says it's a shared trip on desktop", () => {
    render(<ShareTopBar requestAccessHref={hrefs.requestAccess} />);
    expect(screen.getByRole("link", { name: "Plan your own trip" })).toHaveAttribute("href", hrefs.requestAccess);
    expect(screen.getByRole("link", { name: "Plan your own" })).toHaveAttribute("href", hrefs.requestAccess);
    expect(screen.getByText("You're viewing a shared trip")).toBeInTheDocument();
  });
});

describe("ShareCta (spec §E.2)", () => {
  it.each(["before", "during"] as const)("%s: invite-only copy and Request access", (stage) => {
    render(<ShareCta stage={stage} stopCount={6} hrefs={hrefs} />);
    expect(screen.getByText(/It's invite-only for now — ask for a spot\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request access" })).toHaveAttribute("href", hrefs.requestAccess);
    expect(screen.queryByText(/free to start/i)).not.toBeInTheDocument();
  });
  it("after: Use this route with the stop count, and start from scratch", () => {
    render(<ShareCta stage="after" stopCount={6} hrefs={hrefs} />);
    expect(screen.getByRole("heading", { name: "Fancy doing this one?" })).toBeInTheDocument();
    expect(screen.getByText("Start a trip with the same 6 stops. You pick the dates.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use this route" })).toHaveAttribute("href", hrefs.useRoute);
    expect(screen.getByRole("link", { name: /start from scratch/ })).toHaveAttribute("href", hrefs.fromScratch);
  });
  it("after with no stops falls back to the Request access card", () => {
    render(<ShareCta stage="after" stopCount={0} hrefs={hrefs} />);
    expect(screen.queryByRole("link", { name: "Use this route" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request access" })).toBeInTheDocument();
  });
  it("is a sun card with a hard shadow, no banned styles", () => {
    const { container } = render(<ShareCta stage="before" stopCount={1} hrefs={hrefs} />);
    const card = container.querySelector("[data-slot='share-cta']")!;
    expect(card.className).toMatch(/\bbg-sun\b/);
    expect(card.className).toMatch(/\bshadow-hard-5\b/);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});

describe("ShareFooter", () => {
  it("is the one closing line; the old Made-with line is gone", () => {
    render(<ShareFooter />);
    expect(screen.getByText(SHARE_FOOTER_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/Made with Teepee/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- "app/share/[token]/share-chrome.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement** (Server Components)

`share-top-bar.tsx` (SHARE.md §2):

```tsx
<header data-slot="share-top-bar" className="flex h-14 items-center justify-between gap-3 bg-background px-4 sm:px-6 lg:h-[76px] lg:border-b-2 lg:border-border lg:bg-sun lg:px-12">
  <Logo size={24} className="lg:hidden" />
  <Logo size={30} className="hidden lg:inline-flex" />
  <div className="flex items-center gap-4">
    <span className="hidden text-sm font-semibold text-on-accent-muted lg:inline">You&apos;re viewing a shared trip</span>
    <Button asChild variant="outline" size="md" className="pressable h-11 lg:hidden"><Link href={requestAccessHref}>Plan your own</Link></Button>
    <Button asChild variant="primary" size="md" className="hidden lg:inline-flex"><Link href={requestAccessHref}>Plan your own trip</Link></Button>
  </div>
</header>
```

(The handoff says a 40px outline pill. It's 44px here for the touch-target rule.)

`share-cta.tsx` (SHARE.md §9, with the spec §E.2 copy):
- Card: `<section data-slot="share-cta" data-share-cta aria-labelledby="share-cta-heading" className="rounded-[22px] border-2 border-border bg-sun p-4 shadow-hard-5 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:rounded-[28px] lg:p-7">`.
- Heading `id="share-cta-heading"`, class `font-display text-2xl font-extrabold leading-tight tracking-[-0.03em] lg:text-4xl`.
  - Before/during: `<span className="lg:hidden">Got a trip of your own?</span><span className="hidden lg:inline">Got a trip of your own coming up?</span>`.
  - After (stopCount > 0): "Fancy doing this one?".
- Body `mt-2 max-w-[560px] text-[15px] font-semibold leading-[1.45] lg:text-[17px]`:
  - Before/during: "Teepee keeps the route, the days and the money in one place, for everyone who's going. It's invite-only for now — ask for a spot."
  - After: `Start a trip with the same ${n} stop${n === 1 ? "" : "s"}. You pick the dates.`
- Buttons: `<Button asChild variant="primary" size="lg" className="mt-4 h-14 w-full px-7 text-base lg:mt-0 lg:w-auto"><Link href=…>Request access</Link></Button>`. After: "Use this route" (`hrefs.useRoute`), then `<p className="mt-2 text-center text-sm font-bold lg:text-left">or <Link href={hrefs.fromScratch} className="text-coral-text underline underline-offset-2">start from scratch</Link></p>`. Wrap the After buttons in `<div className="flex flex-col lg:items-end">`.
- `ShareFooter`: `<footer className="py-4 text-center text-[13px] font-semibold text-muted-foreground">{SHARE_FOOTER_COPY}</footer>`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- "app/share/[token]/share-chrome.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add "app/share/[token]/share-top-bar.tsx" "app/share/[token]/share-cta.tsx" "app/share/[token]/share-chrome.test.tsx"
git commit -m "feat(share): top bar, invite-only CTA card and Use this route, one-line footer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 9: Hero — stage variants, Travellers and the cover polaroid (solid in After)

**Files:**
- Modify: `components/trips/cover-route-sketch.tsx` (add `solid?: boolean`)
- Modify: `components/trips/cover-route-sketch.test.tsx`
- Modify: `components/trips/trip-cover.tsx` (`CoverArt` gains `sketchSolid?: boolean`, forwarded)
- Create: `app/share/[token]/share-hero.tsx`
- Create: `app/share/[token]/share-hero.test.tsx`

**Interfaces:**
- Consumes: `CoverArt` (`components/trips/trip-cover.tsx`); `SketchStop` (`lib/trips/route-sketch.ts`); `TravellerAvatar` (`components/ui/traveller-avatar.tsx`); `ShareTraveller`, `avatarInput` (Task 4); `DayIndex`, `ShareStage`, `travellersLabel` (Task 3); `formatDayRange`, `formatMonthSpan` (Task 3); `noOrphan` (stays exported from `page.tsx`. Move it to `app/share/[token]/no-orphan.ts`, and have `page.tsx` re-export it: `export { noOrphan } from "./no-orphan";` so `page.test.tsx` keeps importing it).
- Produces: `ShareHero(props: ShareHeroProps)`, where

```ts
export interface ShareHeroProps {
  stage: ShareStage;
  name: string;
  startDate: string;
  endDate: string;
  totalNights: number;
  stopCount: number;
  /** Before only: countdownFor(…) when kind === "sleeps". */
  countdown: { n: number; unit: "sleep" | "sleeps" } | null;
  /** During only. */
  progress: DayIndex | null;
  /** [] unless the link's showTravellers is on. */
  travellers: ShareTraveller[];
  coverStops: SketchStop[];
  token: string;
}
```

- [ ] **Step 1: Write the failing tests**

Add to `components/trips/cover-route-sketch.test.tsx` (it already builds a `model`; reuse its fixture):

```ts
  it("draws the polyline solid when asked (Share After: the whole trip has happened)", () => {
    const { container } = render(<CoverRouteSketch model={model} size="hero" hue="sun" solid />);
    expect(container.querySelector("polyline")!.getAttribute("stroke-dasharray")).toBeNull();
  });
  it("is dashed by default", () => {
    const { container } = render(<CoverRouteSketch model={model} size="hero" hue="sun" />);
    expect(container.querySelector("polyline")!.getAttribute("stroke-dasharray")).toBe("3 2.5");
  });
```

`app/share/[token]/share-hero.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/components/ui/traveller-avatar", () => ({
  TravellerAvatar: ({ traveller }: { traveller: { name: string; image: string | null } }) => (
    <span data-testid="avatar" data-image={traveller.image ?? ""}>{traveller.name}</span>
  ),
}));

import { ShareHero, type ShareHeroProps } from "./share-hero";

const base: ShareHeroProps = {
  stage: "before",
  name: "Christmas in Europe",
  startDate: "2026-12-04",
  endDate: "2027-01-08",
  totalNights: 35,
  stopCount: 6,
  countdown: { n: 67, unit: "sleeps" },
  progress: null,
  travellers: [],
  coverStops: [
    { id: "a", name: "London", lat: 51.5, lng: -0.1, nights: 5 },
    { id: "b", name: "Paris", lat: 48.9, lng: 2.35, nights: 5 },
  ],
  token: "tok",
};
const hero = () => screen.getByRole("heading", { level: 1 }).closest("[data-slot='share-hero']") as HTMLElement;

describe("ShareHero (SHARE.md §3)", () => {
  it("is the coral card with the trip name as the only h1", () => {
    render(<ShareHero {...base} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(hero().className).toMatch(/\bbg-coral\b/);
    expect(hero().className).toMatch(/\bshadow-hard-5\b/);
    expect(hero().className).not.toMatch(/shadow-soft/);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-balance");
  });

  it("before: SHARED TRIP / UP NEXT pill, day-range sub line, sleeps countdown", () => {
    render(<ShareHero {...base} />);
    expect(within(hero()).getByText("Shared trip")).toBeInTheDocument();
    expect(within(hero()).getByText("Up next")).toBeInTheDocument();
    expect(within(hero()).getByText("Fri 4 Dec – Fri 8 Jan · 35 nights · 6 stops")).toBeInTheDocument();
    expect(within(hero()).getByText("67")).toBeInTheDocument();
    expect(within(hero()).getByText(/sleeps/)).toBeInTheDocument();
  });

  it("during: live pill with the day count and a progress bar at day/total", () => {
    render(<ShareHero {...base} stage="during" countdown={null} progress={{ day: 9, total: 36, fraction: 0.25, nightsLeft: 27 }} />);
    expect(within(hero()).getByText("On the road · Day 9 of 36")).toBeInTheDocument();
    expect(hero().querySelector("[data-live-dot]")).not.toBeNull();
    const bar = within(hero()).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "9");
    expect(within(hero()).getByText("27 nights to go")).toBeInTheDocument();
  });

  it("after: HOME AGAIN, month span only, no number, polaroid shown on mobile too, sketch solid", () => {
    const { container } = render(<ShareHero {...base} stage="after" countdown={null} />);
    expect(within(hero()).getByText("Home again")).toBeInTheDocument();
    expect(within(hero()).getByText("Dec 2026 – Jan 2027")).toBeInTheDocument();
    expect(within(hero()).queryByText("67")).not.toBeInTheDocument();
    const polaroid = container.querySelector("[data-share-polaroid]")!;
    expect(polaroid.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(polaroid.querySelector("polyline")!.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("before: the polaroid is desktop-only and dashed", () => {
    const { container } = render(<ShareHero {...base} />);
    const polaroid = container.querySelector("[data-share-polaroid]")!;
    expect(polaroid.className).toMatch(/\bhidden\b.*\blg:block\b|\blg:block\b.*\bhidden\b/);
    expect(polaroid.querySelector("polyline")!.getAttribute("stroke-dasharray")).toBe("3 2.5");
  });

  it("shows no travellers unless given some; with them, names and link-scoped photos", () => {
    const { rerender } = render(<ShareHero {...base} />);
    expect(screen.queryByTestId("avatar")).not.toBeInTheDocument();
    rerender(
      <ShareHero
        {...base}
        travellers={[
          { id: "u1", name: "Cameron", firstName: "Cameron", image: "/share/tok/traveller-photo/u1?v=1", focalX: null, focalY: null },
          { id: "u2", name: "Sam", firstName: "Sam", image: null, focalX: null, focalY: null },
        ]}
      />,
    );
    expect(screen.getAllByTestId("avatar")[0]).toHaveAttribute("data-image", "/share/tok/traveller-photo/u1?v=1");
    expect(screen.getByText("Cameron & Sam's trip")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/trips/cover-route-sketch.test.tsx "app/share/[token]/share-hero.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`cover-route-sketch.tsx`: add the prop `solid?: boolean` and put `strokeDasharray={solid ? undefined : "3 2.5"}` on the `<polyline>`. In `trip-cover.tsx`, `CoverArt` takes `sketchSolid?: boolean` and passes `solid={sketchSolid}` to both of its `CoverRouteSketch` renders.

`share-hero.tsx` (Server Component; SHARE.md §3). Structure and exact classes:
- Root: `<section data-slot="share-hero" data-stage={stage} aria-labelledby="share-title" className="relative flex items-start justify-between gap-4 rounded-3xl border-2 border-border bg-coral p-4 text-on-accent shadow-hard-5 sm:p-7 lg:min-h-80 lg:rounded-[28px] lg:p-8">`.
- Left column `<div className="min-w-0 flex-1">`:
  - Pill: `<span data-slot="share-pill" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 py-[3px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">`.
    - Before: `<span className="lg:hidden">Shared trip</span><span className="hidden lg:inline">Up next</span>`.
    - During: `<span data-live-dot aria-hidden="true" className="size-2 shrink-0 rounded-full bg-coral" />On the road · Day {day} of {total}`.
    - After: `Home again`.
    - The text is sentence case in the DOM; `uppercase` does the capitals.
  - `<h1 id="share-title" className={cn("mt-4 break-words text-balance font-display font-extrabold leading-[0.95] tracking-[-0.05em] lg:text-[80px] lg:leading-[0.9]", { before: "text-[44px]", during: "text-[36px]", after: "text-[34px]" }[stage])}>{noOrphan(name)}</h1>`.
  - Sub line: `<p className="mt-2 text-sm font-bold lg:text-[17px]">`.
    - Before/during: `${formatDayRange(startDate, endDate)} · ${totalNights} night${s} · ${stopCount} stop${s}`.
    - After: `formatMonthSpan(startDate, endDate)`.
  - Before, when `countdown` is set: `<div data-slot="share-countdown" className="mt-4 flex items-end gap-3"><span data-countdown-number className="font-display text-[64px] font-extrabold leading-[0.85] tracking-[-0.06em] tabular-nums lg:text-[84px]">{n}</span><span className="pb-1 text-[15px] font-extrabold leading-[1.02] lg:text-lg">{unit}<br />to go</span></div>`.
  - During, when `progress` is set: `<div className="mt-4 lg:hidden">`:
    - `<div role="progressbar" aria-label={`Day ${day} of ${total}`} aria-valuemin={1} aria-valuemax={total} aria-valuenow={day} className="h-4 overflow-hidden rounded-full border-2 border-border bg-card"><div data-slot="share-progress-fill" className="h-full origin-left bg-foreground" style={{ transform: `scaleX(${fraction})` }} /></div>`.
    - Then `<div className="mt-1.5 flex justify-between gap-3 text-[13px] font-bold"><span className="min-w-0 truncate">{travellersLabel(names)}</span><span className="shrink-0 whitespace-nowrap tabular-nums">{nightsLeft} night{s} to go</span></div>`.
  - Travellers, when `travellers.length > 0`: `<div data-slot="share-travellers" className={cn("mt-5 items-center gap-2.5", stage === "during" ? "hidden lg:flex" : "flex")}>`.
    - Inside it: `<div className="flex pl-2.5">{travellers.slice(0, 4).map((t) => <TravellerAvatar key={t.id} traveller={avatarInput(t)} size={32} ring className="-ml-2.5 size-7 ring-border lg:size-[34px]" />)}</div>`.
    - Then `<span className="min-w-0 truncate text-sm font-bold">{travellersLabel(travellers.map((t) => t.firstName), { possessive: true })}</span>`.
- Polaroid (right): `<div data-share-polaroid className={cn("w-[96px] shrink-0 rotate-[4deg] rounded-[10px] border-2 border-border bg-card p-[6px] pb-[16px] shadow-hard-2 lg:w-[190px] lg:p-[9px] lg:pb-[28px]", stage === "after" ? "block" : "hidden lg:block")}>`.
  - Inside: `<div className="relative aspect-[3/4] overflow-hidden rounded-[4px] border-2 border-border bg-background"><CoverArt tripId="share" name={name} hue="sun" photo={null} stops={coverStops} startDate={startDate} canEdit={false} size="hero" sketchSolid={stage === "after"} /></div>`.
  - The cover **photo** is not shown on a Share link (see the orchestrator note at the end of this plan). The sketch or stamp is always drawn.
- The `token` prop is unused until Task 16's countdown. Name it `_token` there, or leave it out of the destructure until Task 16. Don't leave an unused variable that trips lint.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- components/trips "app/share/[token]/share-hero.test.tsx"`
Expected: PASS (every existing `components/trips` test still green).

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trips/cover-route-sketch.tsx components/trips/cover-route-sketch.test.tsx components/trips/trip-cover.tsx "app/share/[token]/share-hero.tsx" "app/share/[token]/share-hero.test.tsx" "app/share/[token]/no-orphan.ts" "app/share/[token]/page.tsx"
git commit -m "feat(share): staged hero — countdown, live day count, Home again, travellers, cover polaroid

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 10: Share rows, Right now card, the local clock and the Next row

**Files:**
- Create: `app/share/[token]/share-rows.tsx` (a pure row builder + a row renderer; no `"use client"`)
- Create: `app/share/[token]/share-rows.test.tsx`
- Create: `app/share/[token]/local-clock.tsx` (`"use client"`)
- Create: `app/share/[token]/right-now-card.tsx`
- Create: `app/share/[token]/right-now-card.test.tsx`

**Interfaces:**
- Consumes: `orderDayEntries`, `OrderedDay`, `DayPlan` (`lib/itinerary.ts`); `isDoneAt` (Task 3); `categoryDotClass` (`components/trip/category-dot.ts`); `instantToZonedTime` (`lib/tz.ts`); `tzAbbrev`, `formatDayLabel` (`lib/dates.ts`).
- Produces (`share-rows.tsx`):

```ts
export const MODE_LABELS: Record<string, string>; // FLIGHT Flight, TRAIN Train, BUS Bus, CAR Car, FERRY Ferry, OTHER Transport
export const MODE_ICONS: Record<string, LucideIcon>; // Plane, TrainFront, Bus, Car, Ship, OTHER → ArrowRight
export interface ShareRowModel {
  key: string;
  time: string | null;
  title: string;
  sub: string | null;          // an item's or a check-in's address (day by day only)
  kind: "item" | "transport" | "stay";
  category: string | null;     // kind "item"
  mode: string | null;         // kind "transport"
  done: boolean;
}
export function buildShareRows(day: DayPlan, opts: { nowHHMM: string | null; withAddress: boolean }): ShareRowModel[];
export function ShareRow({ row, dense }: { row: ShareRowModel; dense?: boolean }): JSX.Element;
```

- Produces (`right-now-card.tsx`):

```ts
export type RightNowPlace =
  | { kind: "stop"; name: string; country: string | null; night: number; nights: number; dayTitle: string | null; next: { name: string; weekday: string } | null }
  | { kind: "leg"; toName: string; mode: string; landsAt: string | null }
  | { kind: "none" };
export interface RightNowProps {
  timeZone: string;
  localDateISO: string;
  nowHHMM: string;
  place: RightNowPlace;
  /** null when includeDailyPlans is off (the list is skipped entirely). */
  rows: ShareRowModel[] | null;
  dayTitle: string | null;
  tonight: string | null;
}
export function RightNowCard(p: RightNowProps): JSX.Element;
export function NextRow({ next }: { next: { name: string; dotClass: string; right: { mode: string | null; label: string } } }): JSX.Element;
```

- Produces (`local-clock.tsx`): `LocalClock({ timeZone, initial }: { timeZone: string; initial: string })`. It renders `initial` on the server and first client paint, then re-reads `instantToZonedTime(new Date(), timeZone)` on a timer aligned to the next minute, every 60s. It clears the timer on unmount.

- [ ] **Step 1: Write the failing tests**

`share-rows.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DayPlan } from "@/lib/itinerary";
import { buildShareRows, ShareRow } from "./share-rows";

const day = {
  dateISO: "2026-12-12",
  stop: null,
  timedItems: [
    { kind: "item", item: { id: "i1", title: "RER to Versailles", category: "GETTING_AROUND", startTime: "08:40", endTime: "09:10", address: null } },
    { kind: "item", item: { id: "i2", title: "Palace + gardens", category: "SIGHTSEEING", startTime: "09:30", endTime: null, address: "Place d'Armes" } },
  ],
  untimedItems: [{ kind: "item", item: { id: "i3", title: "Free wander", category: "OTHER", startTime: null, endTime: null } }],
  transportEntries: [
    { kind: "transport-departure", transport: { id: "t1", mode: "FLIGHT", depPlace: "CDG", arrPlace: "FCO", reference: "PNR-ABC123" }, arrivesSameDay: true, depTimeLabel: "10:05", arrTimeLabel: "12:15" },
  ],
  accommodationEntries: [
    { kind: "accommodation-checkin", accommodation: { id: "a1", stopId: "s", name: "Hôtel Grands Boulevards", checkIn: "2026-12-12", checkOut: "2026-12-15", checkInTime: "15:00", address: "17 Bd Poissonnière", confirmation: "CONF-999" } },
  ],
} as unknown as DayPlan;

describe("buildShareRows", () => {
  it("interleaves items, transport and stays in orderDayEntries order, anytime last", () => {
    const rows = buildShareRows(day, { nowHHMM: null, withAddress: true });
    expect(rows.map((r) => r.title)).toEqual([
      "RER to Versailles", "Palace + gardens", "Flight to FCO", "Check in, Hôtel Grands Boulevards", "Free wander",
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["item", "item", "transport", "stay", "item"]);
  });
  it("marks rows done against the local clock", () => {
    const rows = buildShareRows(day, { nowHHMM: "09:20", withAddress: false });
    expect(rows.find((r) => r.title === "RER to Versailles")!.done).toBe(true);
    expect(rows.find((r) => r.title === "Palace + gardens")!.done).toBe(false);
    expect(rows.find((r) => r.title === "Free wander")!.done).toBe(false);
  });
  it("carries addresses only when asked, and never a reference or confirmation", () => {
    expect(buildShareRows(day, { nowHHMM: null, withAddress: false }).every((r) => r.sub === null)).toBe(true);
    const json = JSON.stringify(buildShareRows(day, { nowHHMM: null, withAddress: true }));
    expect(json).toContain("17 Bd Poissonnière");
    expect(json).not.toMatch(/PNR-ABC123|CONF-999|reference|confirmation/);
  });
});

describe("ShareRow", () => {
  it("strikes a done row and uses a mode icon for transport", () => {
    const rows = buildShareRows(day, { nowHHMM: "09:20", withAddress: false });
    const { container, rerender } = render(<ShareRow row={rows[0]} />);
    expect(screen.getByText("RER to Versailles").className).toMatch(/line-through/);
    expect(container.textContent).toContain("08:40");
    rerender(<ShareRow row={rows[2]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
```

`right-now-card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RightNowCard, NextRow, type RightNowProps } from "./right-now-card";

const base: RightNowProps = {
  timeZone: "Europe/Paris",
  localDateISO: "2026-12-12",
  nowHHMM: "14:20",
  place: { kind: "stop", name: "Paris", country: "France", night: 3, nights: 5, dayTitle: "Versailles day", next: { name: "Rome", weekday: "Tue" } },
  rows: [
    { key: "a", time: "08:40", title: "RER to Versailles", sub: null, kind: "item", category: "GETTING_AROUND", mode: null, done: true },
    { key: "b", time: "09:30", title: "Palace + gardens", sub: null, kind: "item", category: "SIGHTSEEING", mode: null, done: false },
  ],
  dayTitle: "Versailles day",
  tonight: "Hôtel Grands Boulevards",
};

describe("RightNowCard (SHARE.md §4)", () => {
  it("heads with RIGHT NOW and the local time, then the place and sub line", () => {
    render(<RightNowCard {...base} />);
    expect(screen.getByText("Right now")).toBeInTheDocument();
    expect(screen.getByText("14:20")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In Paris" })).toBeInTheDocument();
    expect(screen.getByText("France · Night 3 of 5 · then Rome on Tue")).toBeInTheDocument();
  });
  it("lists today with done rows struck, and tonight's stay without an address", () => {
    const { container } = render(<RightNowCard {...base} />);
    expect(screen.getByText("RER to Versailles").className).toMatch(/line-through/);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.getByText("Hôtel Grands Boulevards")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='right-now']")!.className).toMatch(/\bshadow-hard-5\b/);
  });
  it("caps the list at 5 rows and says how many more", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ ...base.rows![1], key: `r${i}`, title: `Thing ${i}` }));
    render(<RightNowCard {...base} rows={rows} />);
    expect(screen.getByText("Thing 4")).toBeInTheDocument();
    expect(screen.queryByText("Thing 5")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });
  it("skips the list entirely when daily plans are off", () => {
    render(<RightNowCard {...base} rows={null} />);
    expect(screen.queryByText("RER to Versailles")).not.toBeInTheDocument();
  });
  it("leg in progress: Travelling to …, lands at local time", () => {
    render(<RightNowCard {...base} place={{ kind: "leg", toName: "Rome", mode: "FLIGHT", landsAt: "12:15" }} />);
    expect(screen.getByRole("heading", { name: "Travelling to Rome" })).toBeInTheDocument();
    expect(screen.getByText("Flight · lands 12:15 local")).toBeInTheDocument();
  });
});

describe("NextRow", () => {
  it("shows NEXT, the stop and the outgoing leg", () => {
    render(<NextRow next={{ name: "Rome", dotClass: "bg-hue-coral", right: { mode: "FLIGHT", label: "Tue 15 Dec · 10:05" } }} />);
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Rome")).toBeInTheDocument();
    expect(screen.getByText("Tue 15 Dec · 10:05")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- "app/share/[token]/share-rows.test.tsx" "app/share/[token]/right-now-card.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`buildShareRows(day, { nowHHMM, withAddress })`: `const { entries, anytime } = orderDayEntries(day)`, then map each entry.
- `item`: `{ time: item.startTime ?? null, title: item.title, sub: withAddress ? item.address ?? null : null, kind: "item", category: item.category, done: nowHHMM ? isDoneAt(item.startTime, item.endTime, nowHHMM) : false }`.
- `transport-departure`: `{ time: depTimeLabel ?? null, title: `${MODE_LABELS[mode] ?? "Transport"}${arrPlace ? ` to ${arrPlace}` : ""}`, kind: "transport", mode, done: nowHHMM && depTimeLabel ? isDoneAt(depTimeLabel, arrivesSameDay ? arrTimeLabel ?? null : null, nowHHMM) : false }`.
- `transport-arrival`: `{ time: arrTimeLabel ?? null, title: `${MODE_LABELS[mode]} arrives${arrPlace ? ` at ${arrPlace}` : ""}`, kind: "transport", done: nowHHMM && arrTimeLabel ? arrTimeLabel <= nowHHMM : false }`.
- `accommodation-checkin`: `{ time: checkInTime ?? null, title: `Check in, ${name}`, sub: withAddress ? address ?? null : null, kind: "stay" }`.
- `accommodation-checkout`: `{ time: checkOutTime ?? null, title: `Check out, ${name}`, kind: "stay" }`.
- Then the `anytime` items, as items with `time: null`.
- Keys: `${kind}-${id}`. Read **only** the fields listed. Never spread an entry.

`ShareRow`: `<div className={cn("grid grid-cols-[44px_12px_minmax(0,1fr)] items-baseline gap-2.5", dense ? "py-1.5" : "py-1")}>`.
- Time cell: `<span className="text-[13px] font-bold tabular-nums text-muted-foreground">{time}</span>`.
- Marker: item → `<span aria-hidden className={cn("size-3 translate-y-0.5 rounded-full", categoryDotClass(category))} />`; transport → `<Icon aria-hidden className="size-3" />` from `MODE_ICONS`; stay → `<BedDouble aria-hidden className="size-3" />`.
- Title: `<span className={cn("text-[15px] font-bold", done && "line-through text-muted-foreground")} data-done={done || undefined}>{title}</span>`.
- Sub line when present: `<span className="col-start-3 break-words text-[13px] font-medium text-muted-foreground">{sub}</span>` (LA-012: addresses wrap, never `truncate`).

`RightNowCard` (Server Component):
- Root: `<section data-slot="right-now" aria-labelledby="right-now-heading" className="rounded-3xl border-2 border-border bg-card p-5 shadow-hard-5 lg:rounded-[28px] lg:p-6">`.
- Head row: `flex items-baseline justify-between gap-3`.
  - Left: `<p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">Right now</p>`.
  - Right: `<p className="whitespace-nowrap text-[13px] font-bold tabular-nums"><span>{formatWeekday(localDateISO)}</span><span className="hidden lg:inline">{` ${formatDayLabel(localDateISO).split(" ").slice(1).join(" ")}`}</span> · <LocalClock timeZone={timeZone} initial={nowHHMM} /> {tzAbbrev(timeZone, localDateISO)}</p>`. That renders "Sat 14:20 CET" on mobile and "Sat 12 Dec · 14:20 CET" on desktop.
- Place `<h2 id="right-now-heading" className="mt-2 font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] lg:text-[40px]">`:
  - stop: `In {name}`;
  - leg: `Travelling to {toName}`;
  - none: `On the move`.
- Sub line `mt-1 text-sm font-semibold text-muted-foreground`:
  - stop, desktop (`hidden lg:block`): `[country, `Night ${night} of ${nights}`, next ? `then ${next.name} on ${next.weekday}` : null].filter(Boolean).join(" · ")`;
  - stop, mobile (`lg:hidden`): `[`Night ${night} of ${nights}`, dayTitle].filter(Boolean).join(" · ")`;
  - leg: `<Plane/>`-style mode icon + `${MODE_LABELS[mode]} · lands ${landsAt} local` (when `landsAt` is null, just the mode label).
- The test's `getByText` targets the desktop string.
- Today box, when `rows` is non-null and has rows: `<div className="mt-4 rounded-2xl border-2 border-border bg-background p-3">`. It holds `dayTitle` (`font-display text-base font-extrabold`) when set, then `rows.slice(0, 5)` as `<ShareRow dense />`, then `+{rows.length - 5} more` (`text-[13px] font-bold text-muted-foreground`) when needed.
- When `rows` is non-null and empty: "Nothing planned today." (`text-[13px] font-medium text-muted-foreground`).
- Tonight, when `tonight` is set: `<div className="mt-3 flex items-center gap-2.5 rounded-[14px] border-2 border-border bg-sun px-3.5 py-2.5"><Moon aria-hidden className="size-4 shrink-0" /><div className="min-w-0"><p className="text-xs font-semibold">Tonight</p><p className="truncate text-sm font-extrabold">{tonight}</p></div></div>`. No address.

`NextRow`: `<div data-slot="share-next" className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-border bg-card px-4 py-3">`.
- Left: `<span className="shrink-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em]">Next</span>` + `<span aria-hidden className={cn("size-3 rounded-full border-2 border-border", dotClass)} />` + `<span className="truncate font-display text-base font-extrabold">{name}</span>`.
- Right: `<span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold tabular-nums">{mode icon when mode}{label}</span>`.

`LocalClock`: a client component using `useState(initial)` and `useEffect`. The first timeout waits `60_000 - (Date.now() % 60_000)`, then a 60s interval runs `setNow(instantToZonedTime(new Date(), timeZone))`. Render `<time className="tabular-nums" suppressHydrationWarning>{now}</time>`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- "app/share/[token]/share-rows.test.tsx" "app/share/[token]/right-now-card.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add "app/share/[token]/share-rows.tsx" "app/share/[token]/share-rows.test.tsx" "app/share/[token]/local-clock.tsx" "app/share/[token]/right-now-card.tsx" "app/share/[token]/right-now-card.test.tsx"
git commit -m "feat(share): Right now card with ticking local clock, done strikes, tonight, Next row

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 11: Route list and Tally

**Files:**
- Create: `app/share/[token]/share-route-list.tsx`
- Create: `app/share/[token]/share-tally.tsx`
- Create: `app/share/[token]/share-route-list.test.tsx`

**Interfaces:**
- Consumes: `StopStatus`, `ShareStage`, `shareTally` (Task 3); `stopDotClass` (`lib/stop-colours.ts`); `formatDateRangeCompact`, `formatNights` (`lib/dates.ts`); `EmptyState` (`components/ui/empty-state.tsx`, as the page uses it today).
- Produces:

```ts
export interface RouteListStop { id: string; name: string; country: string | null; sortOrder: number; arriveDate: string; departDate: string; nights: number; status: StopStatus }
export function ShareRouteList({ stage, stops }: { stage: ShareStage; stops: RouteListStop[] }): JSX.Element;
export function ShareTally({ nights, stops, countries }: { nights: number; stops: number; countries: number }): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ShareRouteList, type RouteListStop } from "./share-route-list";
import { ShareTally } from "./share-tally";

const stops: RouteListStop[] = [
  { id: "a", name: "London", country: "England", sortOrder: 0, arriveDate: "2026-12-05", departDate: "2026-12-10", nights: 5, status: "past" },
  { id: "b", name: "Paris", country: "France", sortOrder: 1, arriveDate: "2026-12-10", departDate: "2026-12-15", nights: 5, status: "current" },
  { id: "c", name: "Rome", country: "Italy", sortOrder: 2, arriveDate: "2026-12-15", departDate: "2026-12-22", nights: 7, status: "future" },
];
const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("ShareRouteList (SHARE.md §5)", () => {
  it("before: compact dates, no count", () => {
    render(<ShareRouteList stage="before" stops={stops.map((s) => ({ ...s, status: "future" }))} />);
    expect(screen.getByRole("heading", { name: "The route" })).toBeInTheDocument();
    expect(within(row("Rome")).getByText("15–22 Dec")).toBeInTheDocument();
    expect(screen.queryByText(/done/)).not.toBeInTheDocument();
  });
  it("during: Been, Here now (highlighted), dates, and a done count", () => {
    render(<ShareRouteList stage="during" stops={stops} />);
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(within(row("London")).getByText("Been")).toBeInTheDocument();
    expect(within(row("Paris")).getByText("Here now")).toBeInTheDocument();
    expect(row("Paris").className).toMatch(/bg-coral\/20/);
    expect(within(row("Paris")).getByText("France · 5 nights")).toBeInTheDocument();
  });
  it("after: nights tags and All N", () => {
    render(<ShareRouteList stage="after" stops={stops.map((s) => ({ ...s, status: "past" }))} />);
    expect(screen.getByText("All 3")).toBeInTheDocument();
    expect(within(row("Rome")).getByText("7 nights")).toBeInTheDocument();
  });
  it("no longer lists transport or accommodation", () => {
    const { container } = render(<ShareRouteList stage="during" stops={stops} />);
    expect(container.textContent).not.toMatch(/Flight|Hotel|→/);
  });
  it("shows the empty state with no stops", () => {
    render(<ShareRouteList stage="before" stops={[]} />);
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
  });
});

describe("ShareTally (SHARE.md §6)", () => {
  it("three cells — nights, stops, countries — and never money", () => {
    const { container } = render(<ShareTally nights={35} stops={6} countries={4} />);
    for (const [n, l] of [["35", "nights"], ["6", "stops"], ["4", "countries"]]) {
      expect(screen.getByText(n)).toBeInTheDocument();
      expect(screen.getByText(l)).toBeInTheDocument();
    }
    expect(container.textContent).not.toMatch(/[$€£]|km|spent/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- "app/share/[token]/share-route-list.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement** (Server Components)

`ShareRouteList`:
- Root `<section data-slot="share-route" aria-labelledby="route-heading" className="min-w-0 rounded-3xl border-2 border-border bg-card p-5 shadow-hard-4">`.
- Head: `flex items-baseline justify-between gap-3`, with `<h2 id="route-heading" className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em]">The route</h2>` and a count `<span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums">`:
  - during: `{past} of {n} done`;
  - after: `<span className="inline-flex items-center gap-1 text-teal-text">All {n}<Check aria-hidden className="size-3.5" /></span>`;
  - before: nothing.
- Empty: the existing `EmptyState` (`icon={Route}` from lucide, `tone="teal"`, title "No stops yet", description "The route shows here once the trip has dated stops.").
- `<ol className="mt-3 flex flex-col">` rows: `<li className={cn("flex min-h-[50px] items-center gap-3 border-b-2 border-muted py-2 last:border-b-0", stage === "during" && status === "current" && "rounded-xl border-transparent bg-coral/20 px-2")}>`.
  - A 28px numbered dot: `<span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-xs font-extrabold tabular-nums", stopDotClass(sortOrder))}>{i + 1}</span>`. `stopDotClass` already includes a border class; `cn` dedupes it.
  - Name block `min-w-0 flex-1`: `<p className="truncate font-display text-base font-extrabold">{name}</p><p className="truncate text-xs font-semibold text-muted-foreground">{[country, formatNights(nights)].filter(Boolean).join(" · ")}</p>`.
  - Tag `shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums`:
    - before: `formatDateRangeCompact(arriveDate, departDate)`;
    - during past: `<span className="inline-flex items-center gap-1 text-teal-text"><Check className="size-3.5" aria-hidden />Been</span>`;
    - during current: `<span className="text-coral-text">Here now</span>`;
    - during future: dates;
    - after: `formatNights(nights)`.

`ShareTally`: `<section data-slot="share-tally" aria-label="Trip tally" className="grid grid-cols-3 divide-x-2 divide-border overflow-hidden rounded-2xl border-2 border-border bg-card shadow-hard-4">`. Each cell is `<div className="px-3 py-3"><p className="font-display text-[30px] font-extrabold leading-none tabular-nums">{n}</p><p className="mt-1 text-xs font-bold">{label}</p></div>`, with the labels "nights" / "stops" / "countries" (singular when 1).

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- "app/share/[token]/share-route-list.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add "app/share/[token]/share-route-list.tsx" "app/share/[token]/share-tally.tsx" "app/share/[token]/share-route-list.test.tsx"
git commit -m "feat(share): route list with Been / Here now tags, and the After tally

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 12: RouteMap — travelled legs solid, the current pin haloed with "They're here"

**Files:**
- Modify: `components/trip/route-map.tsx`
- Modify: `components/trip/route-map.test.tsx`

**Interfaces:**
- Produces, as new optional `RouteMapProps` (existing callers are unchanged):
  - `progress?: RouteProgress`, where `export type RouteProgress = { stage: "before" } | { stage: "during"; currentStopId: string | null } | { stage: "after" }`;
  - `frameClassName?: string`. When set, it replaces the default `rounded-lg shadow-hard-2` frame **and** the inline `height` (the caller supplies the height classes, e.g. `h-[200px] lg:h-[400px]`).
  - `export function travelledLegCount(stopIds: string[], progress: RouteProgress | undefined): number`. Leg *i* (stop i → i+1) is solid iff `i < count`.

- [ ] **Step 1: Write the failing tests** (append to `route-map.test.tsx`, reusing `STOPS` and the leaflet mock)

```ts
import { travelledLegCount } from "./route-map";

describe("travelledLegCount (SHARE.md §5)", () => {
  const ids = ["a", "b", "c", "d"];
  it("before (or no progress): nothing travelled", () => {
    expect(travelledLegCount(ids, undefined)).toBe(0);
    expect(travelledLegCount(ids, { stage: "before" })).toBe(0);
  });
  it("during: legs into the current stop are travelled", () => {
    expect(travelledLegCount(ids, { stage: "during", currentStopId: "c" })).toBe(2);
    expect(travelledLegCount(ids, { stage: "during", currentStopId: null })).toBe(0);
  });
  it("after: every leg", () => {
    expect(travelledLegCount(ids, { stage: "after" })).toBe(3);
  });
});

const THREE = [
  ...STOPS,
  { id: "s3", name: "Osaka", lat: 34.69, lng: 135.5, arriveDate: "2026-01-07", departDate: "2026-01-09", sortOrder: 2 },
];

it("draws travelled legs solid and the rest dashed during the trip", async () => {
  render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
  await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThanOrEqual(2));
  const [first, second] = hoisted.leaflet!.polylines;
  expect(first.options.dashArray).toBeUndefined();
  expect(second.options.dashArray).toBe("6 4");
});

it("marks the current stop with a bigger haloed pin and a They're here tag", async () => {
  render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
  await waitFor(() => expect(hoisted.leaflet!.markers.length).toBe(3));
  const htmls = hoisted.leaflet!.divIcon.mock.calls.map((c) => (c[0] as { html: string }).html);
  expect(htmls.filter((h) => h.includes("They're here"))).toHaveLength(1);
  expect(htmls.find((h) => h.includes("They're here"))).toContain("shadow-[0_0_0_6px_hsl(var(--coral)/0.35)]");
});

it("draws every leg solid after the trip, with no tag", async () => {
  render(<RouteMap stops={THREE} progress={{ stage: "after" }} />);
  await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThanOrEqual(2));
  expect(hoisted.leaflet!.polylines.every((p) => p.options.dashArray === undefined)).toBe(true);
  const htmls = hoisted.leaflet!.divIcon.mock.calls.map((c) => (c[0] as { html: string }).html);
  expect(htmls.some((h) => h.includes("They're here"))).toBe(false);
});

it("frameClassName replaces the default frame and the fixed height", async () => {
  render(<RouteMap stops={STOPS} frameClassName="h-[200px] lg:h-[400px] rounded-3xl shadow-hard-4" />);
  const frame = await screen.findByLabelText("Trip route map");
  expect(frame.className).toMatch(/rounded-3xl/);
  expect(frame.className).not.toMatch(/rounded-lg|shadow-hard-2|shadow-soft/);
  expect(frame.getAttribute("style") ?? "").not.toMatch(/height/);
});
```

(Check `test/leaflet-mock.ts` for the fake polyline's `options` field name, and adapt the accessor if it differs.)

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/trip/route-map.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Add `RouteProgress` and `travelledLegCount`:

```ts
export function travelledLegCount(stopIds: string[], progress: RouteProgress | undefined): number {
  if (!progress || progress.stage === "before") return 0;
  if (progress.stage === "after") return Math.max(0, stopIds.length - 1);
  const i = progress.currentStopId ? stopIds.indexOf(progress.currentStopId) : -1;
  return Math.max(0, i);
}
```

- In the effect, compute `const travelled = travelledLegCount(coordStops.map((s) => s.id), progress)`. A leg `i` is built with `{ color, weight: 3, opacity: i < travelled ? 0.9 : 0.7, ...(i < travelled ? {} : { dashArray: "6 4" }) }`.
- The current pin applies when `progress?.stage === "during"` and `stop.id === progress.currentStopId`. Use a `hereIcon(L, n, sortOrder, dark, desktop)`, where `desktop = window.matchMedia("(min-width: 1024px)").matches`, `size = desktop ? 40 : 32`, and `html` is:

```ts
`<div class="relative"><span class="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-border bg-coral px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-on-accent" data-here-tag>They're here</span><div class="rounded-full shadow-[0_0_0_6px_hsl(var(--coral)/0.35)]">${pinHtml({ variant: "stop", fill: stopFill(sortOrder, dark), label: String(n), dark, size })}</div></div>`
```

  The `iconSize` is `[size, size]`, anchored at the centre. Store `here: true` on that entry in `stopMarkers`, so the theme-flip effect re-applies `hereIcon` instead of `stopIcon`.
- Container: `style={frameClassName ? undefined : aspect ? { aspectRatio: … } : { height }}` and `className={cn("tp-map w-full overflow-hidden border-2 border-border", frameClassName ?? "rounded-lg shadow-hard-2")}`.
- Add `progress?.stage` and `progress && "currentStopId" in progress ? progress.currentStopId : ""` to the effect's dependency signature.
- Home legs are untouched (`homeMapPoint`, `showReturn`).

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- components/trip/route-map.test.tsx components/trip/home`
Expected: PASS (existing callers unchanged).

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/route-map.tsx components/trip/route-map.test.tsx
git commit -m "feat(map): share progress — travelled legs solid, current pin haloed with They're here

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 13: Day by day — stop index, folded and open stop blocks, leg lines, mobile picker

**Files:**
- Create: `app/share/[token]/day-by-day.tsx` (Server Component)
- Create: `app/share/[token]/day-by-day-client.tsx` (`"use client"`)
- Create: `app/share/[token]/day-by-day.test.tsx`

**Interfaces:**
- Consumes: `ShareRowModel`, `ShareRow`, `MODE_ICONS`, `MODE_LABELS` (Task 10); `StopStatus` (Task 3); `stopDotClass`, `stopHue` (`lib/stop-colours.ts`); `HUE_CLASSES` (`lib/hues.ts`, the `fill` class for the head band); `formatDayLabel`, `formatDateRangeCompact`, `formatNights` (`lib/dates.ts`); `scrollToId` (Phase 3, `lib/scroll-to.ts`); `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (`components/ui/dropdown-menu.tsx`); `motion`, `AnimatePresence`, `useReducedMotion` (`motion/react`).
- Produces:

```ts
export interface DayByDayDay { dateISO: string; isToday: boolean; title: string | null; rows: ShareRowModel[] }
export interface DayByDayStop {
  id: string; name: string; number: number; sortOrder: number;
  arriveDate: string; departDate: string; nights: number; status: StopStatus;
  days: DayByDayDay[];
  /** Transport from this stop to the next; null when includeTransport is off or none. */
  legAfter: { mode: string; label: string; line: string } | null;
}
export function DayByDay({ stops, initialOpenId }: { stops: DayByDayStop[]; initialOpenId: string | null }): JSX.Element;
// client:
export function DayByDayProvider({ initialOpenId, children }: { initialOpenId: string | null; children: React.ReactNode }): JSX.Element;
export function StopBlock({ stopId, name, folded, open }: { stopId: string; name: string; folded: React.ReactNode; open: React.ReactNode }): JSX.Element;
export function StopIndex({ stops, className }: { stops: { id: string; name: string; dotClass: string; dates: string }[]; className?: string }): JSX.Element;
export function StopPicker({ stops, className }: { stops: { id: string; name: string }[]; className?: string }): JSX.Element;
```

- Behaviour: one stop open at a time, at every width (`openId: string | null`). "Show" on a folded stop opens it; "Hide" folds it. Clicking a stop-index row or picking in the mobile picker opens that stop and calls `scrollToId(`share-stop-${id}`, { reduced })`. Only the open stop's day rows are in the DOM.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { scrollToId } = vi.hoisted(() => ({ scrollToId: vi.fn() }));
vi.mock("@/lib/scroll-to", () => ({ scrollToId }));

import { DayByDay, type DayByDayStop } from "./day-by-day";

const row = (title: string) => ({ key: title, time: "10:00", title, sub: null, kind: "item" as const, category: "SIGHTSEEING", mode: null, done: false });
const stops: DayByDayStop[] = [
  { id: "lon", name: "London", number: 1, sortOrder: 0, arriveDate: "2026-12-05", departDate: "2026-12-10", nights: 5, status: "past",
    days: [{ dateISO: "2026-12-05", isToday: false, title: null, rows: [row("Borough Market")] }],
    legAfter: { mode: "TRAIN", label: "Train to Paris", line: "Thu 10 Dec · St Pancras 09:31 → Gare du Nord 12:47" } },
  { id: "par", name: "Paris", number: 2, sortOrder: 1, arriveDate: "2026-12-10", departDate: "2026-12-15", nights: 5, status: "current",
    days: [
      { dateISO: "2026-12-11", isToday: false, title: null, rows: [row("Louvre")] },
      { dateISO: "2026-12-12", isToday: true, title: "Versailles day", rows: [row("Palace + gardens")] },
    ],
    legAfter: null },
];

describe("DayByDay (SHARE.md §7)", () => {
  it("opens the initial stop with its head band and day rows; others are folded", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(screen.getByRole("heading", { name: "Day by day" })).toBeInTheDocument();
    expect(screen.getAllByTestId("share-day")).toHaveLength(2);
    expect(screen.getByText("Versailles day")).toBeInTheDocument();
    expect(screen.queryByText("Borough Market")).not.toBeInTheDocument();
    expect(screen.getByText("London · 1 day")).toBeInTheDocument();
  });

  it("marks today with aria-current, a TODAY pill and a sun tint", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    const today = screen.getAllByTestId("share-day").find((d) => d.getAttribute("aria-current") === "date")!;
    expect(within(today).getByText("Today")).toBeInTheDocument();
    expect(today.className).toMatch(/bg-sun\/15/);
  });

  it("past folded stops are dashed and say Done", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    const folded = container.querySelector("[data-stop-folded='lon']")!;
    expect(folded.className).toMatch(/border-dashed/);
    expect(within(folded as HTMLElement).getByText("Done")).toBeInTheDocument();
  });

  it("Show opens a folded stop and folds the open one", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(within(screen.getByText("London · 1 day").closest("[data-stop-folded]") as HTMLElement).getByRole("button", { name: /show/i }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    expect(screen.queryByText("Louvre")).not.toBeInTheDocument();
  });

  it("the stop index opens and scrolls to a stop", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    const index = screen.getByRole("navigation", { name: "Stops" });
    await userEvent.click(within(index).getByRole("button", { name: /London/ }));
    expect(scrollToId).toHaveBeenCalledWith("share-stop-lon", expect.objectContaining({ reduced: expect.any(Boolean) }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
  });

  it("draws the leg line with no booking reference", () => {
    render(<DayByDay stops={stops} initialOpenId={null} />);
    expect(screen.getByText("Train to Paris")).toBeInTheDocument();
    expect(screen.getByText("Thu 10 Dec · St Pancras 09:31 → Gare du Nord 12:47")).toBeInTheDocument();
  });

  it("with nothing open (After), every stop is folded", () => {
    render(<DayByDay stops={stops} initialOpenId={null} />);
    expect(screen.queryAllByTestId("share-day")).toHaveLength(0);
  });

  it("uses no banned styles", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- "app/share/[token]/day-by-day.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`day-by-day.tsx` (Server Component) returns:

```tsx
<section data-share-section-inner="days" aria-labelledby="days-heading">
  <DayByDayProvider initialOpenId={initialOpenId}>
    <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="days-heading" className="font-display text-2xl font-extrabold tracking-[-0.03em] lg:text-[28px]">Day by day</h2>
          <StopPicker className="lg:hidden" stops={…} />
        </div>
        <StopIndex className="mt-3 hidden lg:flex" stops={…} />
      </div>
      <ol className="mt-3 flex flex-col gap-3 lg:mt-0">
        {stops.map((s) => (
          <li key={s.id} id={`share-stop-${s.id}`} data-share-stop={s.id} className="scroll-mt-6">
            <StopBlock stopId={s.id} name={s.name} folded={<FoldedStop s={s} />} open={<OpenStop s={s} />} />
            {s.legAfter && <LegLine leg={s.legAfter} />}
          </li>
        ))}
      </ol>
    </div>
  </DayByDayProvider>
</section>
```

- `FoldedStop` (server) is the content only. `StopBlock` supplies the frame and the toggle.
  - Content: `<span aria-hidden className={cn("size-3.5 shrink-0 rounded-full border-2 border-border", stopDotClass(sortOrder))} />`, then `<span className="min-w-0 flex-1 truncate font-display text-[17px] font-extrabold">{name} · {days.length} day{s}</span>`.
  - Status: past → `<span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-teal-text"><Check aria-hidden className="size-3.5" />Done</span>`; otherwise `<span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums">{formatDateRangeCompact(arriveDate, departDate)}</span>`.
- `OpenStop` (server): the head band + the day rows.
  - Head: `<div className={cn("flex items-center gap-3 border-b-2 border-border px-4 py-3", HUE_CLASSES[stopHue(sortOrder)].fill)}>`. Inside: `<span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-xs font-extrabold">{number}</span><h3 className="min-w-0 flex-1 truncate font-display text-[22px] font-extrabold">{name}</h3><span className="hidden shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums sm:inline">{formatDayLabel(arriveDate)} – {formatDayLabel(departDate)} · {formatNights(nights)}</span>`. `StopBlock` injects the Hide button after this.
  - Day rows: `<ol>{days.map(d => <li data-testid="share-day" aria-current={d.isToday ? "date" : undefined} className={cn("grid gap-1 border-b-2 border-muted px-4 py-3 last:border-b-0 lg:grid-cols-[110px_minmax(0,1fr)] lg:gap-4", d.isToday && "bg-sun/15")}>`.
  - Each day row holds `<div><p className="text-base font-extrabold">{formatDayLabel(d.dateISO)}</p>{d.isToday && <span className="mt-1 inline-flex shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-coral px-2 py-px text-[10px] font-extrabold uppercase tracking-[0.08em] text-on-accent">Today</span>}</div><div>{d.title && <p className="font-display text-[17px] font-extrabold">{d.title}</p>}{d.rows.length ? d.rows.map(r => <ShareRow key={r.key} row={r} />) : <p className="text-sm font-medium text-muted-foreground">Free day</p>}</div>`.
- `LegLine` (server): `<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm"><Icon aria-hidden className="size-4 shrink-0" /><span className="font-bold">{label}</span><span className="text-[13px] font-medium tabular-nums text-muted-foreground">{line}</span></div>`.

`day-by-day-client.tsx`:
- `DayByDayProvider` holds `openId` / `setOpenId` and `activeId` / `setActiveId` in a context.
- `StopBlock`:
  - When `openId === stopId`: `<div data-stop-open={stopId} className="overflow-hidden rounded-[22px] border-2 border-border bg-card shadow-hard-4">{open}</div>`. The **Hide** control is a small absolutely-positioned button top-right of the head band: `aria-expanded="true"`, label "Hide", `ChevronUp`, `className="pressable absolute right-3 top-3 inline-flex h-9 items-center gap-1 rounded-full border-2 border-border bg-card px-3 text-[13px] font-bold tap-target"`. Make the wrapper `relative`.
  - Otherwise: `<div data-stop-folded={stopId} className={cn("flex items-center gap-3 rounded-[18px] border-2 border-border bg-card px-4 py-3", status==="past" && "border-dashed")}>{folded}<button type="button" aria-expanded="false" onClick={() => setOpenId(stopId)} className="pressable inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-bold tap-target">Show<ChevronDown aria-hidden className="size-4" /></button></div>`.
  - The dashed state needs `status`, so add a `dashed: boolean` prop to `StopBlock` and pass `s.status === "past"` from the server. Update the Interfaces signature to match.
  - Motion comes in Task 16. Here, swap plainly.
- `StopIndex`: `<nav aria-label="Stops" className={cn("flex-col gap-1", className)}>`. It renders one `<button type="button" className={cn("pressable flex h-10 items-center gap-2.5 rounded-xl border-2 px-3 text-left text-sm font-bold", isActive ? "border-border bg-teal/15" : "border-transparent")}>` per stop, with the dot, a truncated name, and the dates (`ml-auto shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground`).
  - Active = `activeId ?? openId`. Update `activeId` with an `IntersectionObserver` over `[data-share-stop]` (guard `typeof IntersectionObserver === "undefined"`; `rootMargin: "-30% 0px -60% 0px"`).
  - Click: `setOpenId(id); scrollToId(`share-stop-${id}`, { reduced: !!reduced })`, where `const reduced = useReducedMotion()`.
- `StopPicker`: a `DropdownMenu`. The trigger is a pill `<button className="pressable inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-card px-4 text-sm font-bold">{openName ?? "Stops"}<ChevronDown aria-hidden className="size-4" /></button>`. There's one item per stop; choosing one runs `setOpenId(id); scrollToId(...)`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- "app/share/[token]/day-by-day.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add "app/share/[token]/day-by-day.tsx" "app/share/[token]/day-by-day-client.tsx" "app/share/[token]/day-by-day.test.tsx"
git commit -m "feat(share): Day by day — sticky stop index, one open stop, leg lines, mobile picker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 14: Journal polaroids (replaces `journal-section.tsx`)

**Files:**
- Create: `app/share/[token]/journal-polaroids.tsx` (Server Component; moves `buildJournalDays` and its types in from `journal-section.tsx`)
- Create: `app/share/[token]/journal-expand.tsx` (`"use client"`)
- Create: `app/share/[token]/journal-polaroids.test.tsx` (move every `buildJournalDays` test from `journal-section.test.tsx` here unchanged, then add the ones below)
- Delete: `app/share/[token]/journal-section.tsx`, `app/share/[token]/journal-section.test.tsx` (the page switches to the new component in Task 15. **Until then, keep `journal-section.tsx` re-exporting from the new file:** `export { buildJournalDays, JournalPolaroids as JournalSection } from "./journal-polaroids";`. Task 15 deletes it.)

**Interfaces:**
- Consumes: `ShareTraveller`, `shareTraveller`, `avatarInput` (Task 4); `polaroidTilt` (Task 3); `TravellerAvatar`; `formatDayLabel`.
- Produces:

```ts
export interface JournalPolaroidsProps {
  token: string;
  dates: string[];
  entries: ShareJournalEntryRow[];   // unchanged types, moved here
  photos: ShareJournalPhotoRow[];
  stage: ShareStage;
  stopNameByDate: Record<string, string>;
  showTravellers: boolean;
}
export interface JournalCard { key: string; dateISO: string; place: string | null; author: ShareTraveller; body: string; photoUrl: string | null; tilt: number }
export function buildJournalCards(p: JournalPolaroidsProps): JournalCard[]; // newest day first, then entries in buildJournalDays order
export function JournalPolaroids(p: JournalPolaroidsProps): JSX.Element | null;
export function JournalExpand({ heading, count, mobileLimit, mobileLayout, items }: { heading: React.ReactNode; count: number; mobileLimit: number; mobileLayout: "scroller" | "grid"; items: React.ReactNode[] }): JSX.Element;
```

- `JournalDayEntryView` gains `author: ShareTraveller`, from `shareTraveller(entry.author, { token, showPhoto })`. `buildJournalDays` takes an optional fifth argument, `opts: { showPhoto: boolean } = { showPhoto: false }`. `authorFirstName` stays, as `author.firstName`, so the moved tests pass unchanged.

- [ ] **Step 1: Write the failing tests** (added to the moved `buildJournalDays` tests)

```tsx
import { vi } from "vitest";
vi.mock("@/components/ui/traveller-avatar", () => ({
  TravellerAvatar: ({ traveller }: { traveller: { name: string; image: string | null } }) => (
    <span data-testid="avatar" data-image={traveller.image ?? ""} />
  ),
}));
import { JournalPolaroids, buildJournalCards, type JournalPolaroidsProps } from "./journal-polaroids";

const cam = { id: "u1", name: "Cam Williams", displayName: null, image: "https://lh3.example/cam.png", photoKey: null, photoUpdatedAt: null, email: "cam@example.com" };
const props = (over: Partial<JournalPolaroidsProps> = {}): JournalPolaroidsProps => ({
  token: "tok",
  dates: ["2026-12-05", "2026-12-06", "2026-12-07"],
  entries: [
    { date: "2026-12-05", authorId: "u1", body: "Made it.", author: cam },
    { date: "2026-12-07", authorId: "u1", body: "Hamilton", author: cam },
  ],
  photos: [{ id: "p1", targetId: "2026-12-07", uploadedById: "u1", uploadedBy: cam }],
  stage: "during",
  stopNameByDate: { "2026-12-05": "London", "2026-12-07": "London" },
  showTravellers: false,
  ...over,
});

describe("JournalPolaroids (SHARE.md §8)", () => {
  it("heads How it's going during and How it went after", () => {
    const { rerender } = render(<JournalPolaroids {...props()} />);
    expect(screen.getByRole("heading", { name: "How it's going" })).toBeInTheDocument();
    rerender(<JournalPolaroids {...props({ stage: "after" })} />);
    expect(screen.getByRole("heading", { name: "How it went" })).toBeInTheDocument();
  });

  it("one polaroid per entry, newest first, with date · place and the photo via the link route", () => {
    const { container } = render(<JournalPolaroids {...props()} />);
    const cards = container.querySelectorAll("[data-slot='share-polaroid']");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Mon 7 Dec · London");
    expect(cards[0].querySelector("img")).toHaveAttribute("src", "/share/tok/journal-photo/p1");
  });

  it("tilts each card by its id, stably, within ±2°", () => {
    const cards = buildJournalCards(props());
    expect(cards.map((c) => c.tilt)).toEqual(buildJournalCards(props()).map((c) => c.tilt));
    expect(cards.every((c) => Math.abs(c.tilt) <= 2)).toBe(true);
  });

  it("attributes by first name; avatars show initials unless showTravellers is on", () => {
    const { rerender } = render(<JournalPolaroids {...props()} />);
    expect(screen.getAllByText("Cam")[0]).toBeInTheDocument();
    expect(screen.getAllByTestId("avatar").every((a) => a.getAttribute("data-image") === "")).toBe(true);
    rerender(<JournalPolaroids {...props({ showTravellers: true })} />);
    expect(screen.getAllByTestId("avatar")[0]).toHaveAttribute("data-image", "https://lh3.example/cam.png");
  });

  it("never carries an email", () => {
    const { container } = render(<JournalPolaroids {...props({ showTravellers: true })} />);
    expect(container.innerHTML).not.toContain("cam@example.com");
    expect(JSON.stringify(buildJournalCards(props({ showTravellers: true })))).not.toContain("cam@example.com");
  });

  it("on mobile shows the latest 2 during and offers the rest", async () => {
    const many = props({
      dates: ["2026-12-01", "2026-12-02", "2026-12-03"],
      entries: ["01", "02", "03"].map((d) => ({ date: `2026-12-${d}`, authorId: "u1", body: `Day ${d}`, author: cam })),
      photos: [],
    });
    render(<JournalPolaroids {...many} />);
    const more = screen.getByRole("button", { name: "3 entries" });
    expect(screen.getByText("Day 01").closest("li")!.className).toMatch(/max-lg:hidden/);
    await userEvent.click(more);
    expect(screen.getByText("Day 01").closest("li")!.className).not.toMatch(/max-lg:hidden/);
  });

  it("renders nothing with no entries", () => {
    const { container } = render(<JournalPolaroids {...props({ entries: [], photos: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

(Import `render`, `screen` and `userEvent` at the top as the moved tests do. Also delete the moved test "never renders an avatar image — only the photo, when present": with `TravellerAvatar` mocked, avatars are asserted through `data-image` instead.)

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- "app/share/[token]/journal-polaroids.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `buildJournalCards(p)`: `buildJournalDays(p.token, p.dates, p.entries, p.photos, { showPhoto: p.showTravellers })` flattened. Each card is `key = `${dateISO}:${authorId}``, `place = p.stopNameByDate[dateISO] ?? null`, `tilt = polaroidTilt(key)`.
- `JournalPolaroids`: return `null` when there are no cards.
  - Heading: `<h2 id="journal-heading" className="font-display text-2xl font-extrabold tracking-[-0.03em] lg:text-[28px]">{stage === "after" ? "How it went" : "How it's going"}</h2>`, then `<span className="hidden text-sm font-semibold text-muted-foreground lg:inline">From their journal</span>`.
  - Wrap it: `<section aria-labelledby="journal-heading" data-testid="share-journal"><JournalExpand heading={…} count={cards.length} mobileLimit={stage === "after" ? 4 : 2} mobileLayout={stage === "after" ? "grid" : "scroller"} items={cards.map(renderCard)} /></section>`.
- Card:

```tsx
<article data-slot="share-polaroid" style={{ rotate: `${tilt}deg` }} className="rounded-xl border-2 border-border bg-card p-[9px] pb-[14px] shadow-hard-4">
  {photoUrl && (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl} alt={`Photo from ${author.firstName}`} className={cn("w-full rounded-[5px] border-2 border-border object-cover", stage === "after" ? "aspect-square lg:aspect-[4/3]" : "aspect-[4/3]")} />
  )}
  <div className="mt-2 flex items-center gap-1.5">
    <TravellerAvatar traveller={avatarInput(author)} size={24} className="size-[22px]" />
    <span className="sr-only">{author.firstName}</span>
    <p className="min-w-0 truncate text-xs font-extrabold">{formatDayLabel(dateISO)}{place ? ` · ${place}` : ""}</p>
  </div>
  {body && <p className={cn("mt-1 line-clamp-3 whitespace-pre-wrap font-medium leading-[1.4]", photoUrl ? "text-sm" : "text-base")}>{body}</p>}
</article>
```

- `JournalExpand` (client): `const [expanded, setExpanded] = useState(false)`. Render `<div className="flex items-baseline justify-between gap-3">{heading}{count > mobileLimit && <button type="button" onClick={() => setExpanded(v => !v)} className="inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-bold lg:hidden">{expanded ? "Show fewer" : `${count} entries`}<ChevronRight aria-hidden className="size-4" /></button>}</div>`.
  - Then the list: `<ul className={cn("mt-3", mobileLayout === "grid" ? "grid grid-cols-2 gap-3" : "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2", "lg:flex lg:snap-x lg:gap-6 lg:overflow-x-auto lg:pb-3")}>`.
  - Each item: `<li className={cn(mobileLayout === "scroller" ? "w-[200px] shrink-0 snap-start" : "", "lg:w-[250px] lg:shrink-0 lg:snap-start", !expanded && i >= mobileLimit && "max-lg:hidden")}>`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- "app/share/[token]"`
Expected: PASS (the page still renders through the re-export shim).

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add -A "app/share/[token]"
git commit -m "feat(share): journal as tilted polaroids; avatars follow showTravellers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 15: Assemble the page — stage switch, section order, Travellers query, privacy matrix, OG image

**Files:**
- Modify: `app/share/[token]/page.tsx`
- Rewrite: `app/share/[token]/page.test.tsx`
- Create: `app/share/[token]/share-style-bans.test.ts`
- Delete: `app/share/[token]/share-today-card.tsx`, `app/share/[token]/share-today-card.test.tsx`, `app/share/[token]/journal-section.tsx` (the shim)
- Create: `app/share/[token]/opengraph-image.tsx` (**first read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`**: `params` is a Promise in v16)
- Modify: `lib/og-card.tsx` (add `ShareOgCard`), `lib/og-card.test.ts`
- Create: `lib/share-og.ts`, `lib/share-og.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–14.
- Produces:
  - `ShareOgCard({ name, subLine, sketch }: { name: string; subLine: string; sketch: { points: { x: number; y: number }[]; vbH: number; solid: boolean } | null })` in `lib/og-card.tsx` (the hex file ADR 0060 sanctions);
  - `shareOgModel({ trip, stops, today }): { name: string; subLine: string; sketch: … | null }` in `lib/share-og.ts`, pure.

- [ ] **Step 1: Write the failing tests**

`app/share/[token]/page.test.tsx` gets a full rewrite. Keep the whole existing mock header (`vi.hoisted` db mocks, `next/navigation`, `route-map-loader`, `@/server/actions/items`, `day-entry-link`, `@/lib/weather`). Keep the `PRIVATE` fixtures and `beforeEach` rows. Keep every `describe` block that still applies:
- "public guarantees": robots, single h1, never-selects-private-fields (extended below), `hiddenFromShares`;
- the whole Journal block, with "Cam" now found via the sr-only name;
- Day titles, with the expectation now that the title shows on the open stop, so `initialOpenId` must include its day;
- `noOrphan`;
- the empty route state.

Delete the tests for the removed kit pieces: the lilac Money card, "Shared trip · view only", `→ Flight` chip, `Platzl Hotel` in the route card, `[data-timeline-row]`, `lg:grid-cols-2` and "Made with Teepee". Then add:

```tsx
vi.mock("@/components/ui/traveller-avatar", () => ({
  TravellerAvatar: ({ traveller }: { traveller: { name: string; image: string | null } }) => (
    <span data-testid="avatar" data-image={traveller.image ?? ""}>{traveller.name}</span>
  ),
}));
vi.mock("@/lib/scroll-to", () => ({ scrollToId: vi.fn() }));
// add to the hoisted block and the db mock:
//   tripMemberFindManyMock: vi.fn().mockResolvedValue([]),   db.tripMember = { findMany: tripMemberFindManyMock }

import { SHARE_FOOTER_COPY } from "./share-cta";

const EMAIL = "cam@example.com";
const MEMBER = { user: { id: "u1", name: "Cam Williams", displayName: "Cameron", image: "https://lh3.example/cam.png", photoKey: "k.jpg", photoUpdatedAt: new Date(7), photoFocalX: null, photoFocalY: null, email: EMAIL } };

/** Three trips with the same shape, one per stage, pinned against the real clock. */
const STAGE_TRIPS = {
  before: { startDate: "2099-12-06", endDate: "2099-12-09", stops: shift(STOPS, "2099") },
  during: { startDate: "2000-01-01", endDate: "2099-12-31", stops: [
    { ...STOPS[0], arriveDate: "2000-01-01", departDate: todayUTC() },
    { ...STOPS[1], arriveDate: todayUTC(), departDate: "2099-12-31" },
  ] },
  after: { startDate: "2020-12-06", endDate: "2020-12-09", stops: STOPS },
} as const;

function todayUTC() { return new Date().toISOString().slice(0, 10); }
function shift(stops: typeof STOPS, year: string) {
  return stops.map((s) => ({ ...s, arriveDate: year + s.arriveDate.slice(4), departDate: year + s.departDate.slice(4) }));
}

async function renderStage(stage: keyof typeof STAGE_TRIPS, over: Record<string, unknown> = {}) {
  const t = STAGE_TRIPS[stage];
  shareFindUniqueMock.mockResolvedValue({ ...share({ startDate: t.startDate, endDate: t.endDate }), id: "link-1", includeJournal: true, showTravellers: false, ...over });
  stopFindManyMock.mockResolvedValue(t.stops);
  journalEntryFindManyMock.mockImplementation((a: { where: { hiddenFromShares?: boolean } }) =>
    Promise.resolve(a.where.hiddenFromShares ? [] : [{ date: t.stops[0].arriveDate, authorId: "u1", body: "Great day", author: MEMBER.user }]),
  );
  return renderPage();
}

const sectionOrder = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("[data-share-section]")).map((el) => el.getAttribute("data-share-section"));

describe("SharePage — stages (SHARE.md §1)", () => {
  it("before: hero → map → route → days → cta", async () => {
    const { container } = await renderStage("before");
    expect(sectionOrder(container)).toEqual(["hero", "map", "route", "days", "cta"]);
    expect(container.querySelector("[data-slot='share-hero']")!.getAttribute("data-stage")).toBe("before");
  });
  it("during: hero → right-now → next → journal → map → route → days → cta", async () => {
    const { container } = await renderStage("during");
    expect(sectionOrder(container)).toEqual(["hero", "right-now", "next", "journal", "map", "route", "days", "cta"]);
    expect(screen.getByText("Right now")).toBeInTheDocument();
  });
  it("after: hero → tally → journal → route → map → days → cta, with Use this route", async () => {
    const { container } = await renderStage("after");
    expect(sectionOrder(container)).toEqual(["hero", "tally", "journal", "route", "map", "days", "cta"]);
    expect(screen.getByRole("link", { name: "Use this route" }).getAttribute("href")).toContain(encodeURIComponent("/trips/new?fromShare=tok"));
  });
  it("hides Day by day when all three itinerary dials are off", async () => {
    const { container } = await renderStage("before", { includeAccommodation: false, includeTransport: false, includeDailyPlans: false });
    expect(sectionOrder(container)).not.toContain("days");
  });
  it("the top bar's Plan your own trip goes to Request access with a hashed ref, never the token", async () => {
    await renderStage("before");
    const href = screen.getByRole("link", { name: "Plan your own trip" }).getAttribute("href")!;
    expect(href).toMatch(/^\/\?panel=request&ref=share&t=[0-9a-f]{10}$/);
    expect(href).not.toContain("tok");
  });
});

describe("SharePage — Show who's going (ADR 0051 amendment 2026-09-30)", () => {
  it("off: never queries members, no hero avatars, journal avatars without photos", async () => {
    await renderStage("after");
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(document.querySelector("[data-slot='share-travellers']")).toBeNull();
    expect(screen.getAllByTestId("avatar").every((a) => a.getAttribute("data-image") === "")).toBe(true);
  });
  it("on: selects TRAVELLER_SELECT only (no email) and shows link-scoped photos", async () => {
    tripMemberFindManyMock.mockResolvedValue([MEMBER]);
    await renderStage("before", { showTravellers: true });
    const select = tripMemberFindManyMock.mock.calls[0][0].select.user.select;
    expect(Object.keys(select)).not.toContain("email");
    expect(screen.getByText("Cameron's trip")).toBeInTheDocument();
    expect(screen.getAllByTestId("avatar")[0]).toHaveAttribute("data-image", "/share/tok/traveller-photo/u1?v=7");
  });
});

describe("SharePage — privacy regression (spec verification)", () => {
  const SECRET_VALUES = ["PNR-ABC123", "CONF-999", "BOOK-777", "secret", "private.example", "12345", "123.45", EMAIL, "/api/avatars"];
  for (const stage of ["before", "during", "after"] as const) {
    for (const showTravellers of [false, true]) {
      it(`never renders reference, confirmation, costMinor or an email — ${stage}, showTravellers ${showTravellers ? "on" : "off"}`, async () => {
        tripMemberFindManyMock.mockResolvedValue([MEMBER]);
        const { container } = await renderStage(stage, { showTravellers });
        const html = container.innerHTML.replace(SHARE_FOOTER_COPY, "");
        for (const word of ["reference", "confirmation", "costMinor"]) expect(html).not.toContain(word);
        for (const v of SECRET_VALUES) expect(container.innerHTML).not.toContain(v);
        expect(container.textContent ?? "").not.toMatch(/[$€£¥]\s?\d|per person|each owes|split/i);
      });
    }
  }
});
```

Extend "never selects private fields from the database". Add `"email"` to `FORBIDDEN`. Add `tripMemberFindManyMock` to the loop when it was called: its `select.user.select` keys must equal `Object.keys(TRAVELLER_SELECT)`, imported from `@/lib/traveller`.

The existing fixture's `TRIP` is in 2020, so "past" means After. The first test group's old expectations of `renderPage()` now render the After stage. Update any assertion that depended on the old layout accordingly.

`app/share/[token]/share-style-bans.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const DIR = join(process.cwd(), "app/share/[token]");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe("share page style bans (README ground rules)", () => {
  it.each(files(DIR))("%s has no banned classes and no raw hex", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
```

`lib/share-og.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shareOgModel } from "./share-og";

const trip = { name: "Christmas in Europe", startDate: "2026-12-04", endDate: "2027-01-08" };
const stops = [
  { id: "a", name: "London", lat: 51.5, lng: -0.1, arriveDate: "2026-12-05", departDate: "2026-12-10" },
  { id: "b", name: "Paris", lat: 48.9, lng: 2.35, arriveDate: "2026-12-10", departDate: "2026-12-15" },
];

describe("shareOgModel (SHARE.md §3: OG = hero at 1200×630)", () => {
  it("before: day-range sub line and a dashed sketch", () => {
    const m = shareOgModel({ trip, stops, today: "2026-10-01" });
    expect(m.subLine).toBe("Fri 4 Dec – Fri 8 Jan · 35 nights · 2 stops");
    expect(m.sketch?.solid).toBe(false);
    expect(m.sketch!.points.length).toBeGreaterThanOrEqual(2);
  });
  it("after: month span and a solid sketch", () => {
    const m = shareOgModel({ trip, stops, today: "2027-02-01" });
    expect(m.subLine).toBe("Dec 2026 – Jan 2027");
    expect(m.sketch?.solid).toBe(true);
  });
  it("no sketch without two located stops", () => {
    expect(shareOgModel({ trip, stops: [stops[0]], today: "2026-10-01" }).sketch).toBeNull();
  });
});
```

Add to `lib/og-card.test.ts`:

```ts
import { renderToStaticMarkup } from "react-dom/server";
import { ShareOgCard } from "./og-card";

describe("ShareOgCard", () => {
  it("draws the coral hero with the name, sub line and a polaroid polyline", () => {
    const html = renderToStaticMarkup(
      ShareOgCard({ name: "Christmas in Europe", subLine: "Dec 2026 – Jan 2027", sketch: { points: [{ x: 10, y: 10 }, { x: 90, y: 120 }], vbH: 133, solid: true } }),
    );
    expect(html).toContain("Christmas in Europe");
    expect(html).toContain("Dec 2026 – Jan 2027");
    expect(html).toContain("<polyline");
    expect(html).not.toContain("stroke-dasharray");
    expect(html.toLowerCase()).toContain(OG_COLOURS.coral.toLowerCase());
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- "app/share/[token]" lib/share-og.test.ts lib/og-card.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `page.tsx`**

Keep `metadata` (title + `robots: { index: false, follow: false }`) and the `noOrphan` re-export. Keep every query, its `select`, its dial gate and its "intentionally omitted" comment exactly as they are today: transports, accommodations, items (`hiddenFromShares: false`), day titles, and the three journal queries. Keep `REAL_PLAN` and the comment that the page ignores `?plan=`. Then:

```tsx
const shareLink = await findShareLink(token);
if (!shareLink) notFound();
const trip = shareLink.trip;
if (!trip.startDate || !trip.endDate) notFound();
const stops = await loadShareStops(trip.id);
// … existing transports / accommodations / items / itinerary / dayTitles / journal queries, unchanged …

// "Show who's going" (ADR 0051 amendment 2026-09-30): off means this query
// never runs. TRAVELLER_SELECT carries no email; never add it here.
const members = shareLink.showTravellers
  ? await db.tripMember.findMany({ where: { tripId }, orderBy: { createdAt: "asc" }, select: { user: { select: TRAVELLER_SELECT } } })
  : [];
const travellers = members.map((m) => shareTraveller(m.user, { token, showPhoto: true }));

const phaseDesc = describePhase({ startDate: trip.startDate, endDate: trip.endDate, today: todayISO });
const stage = shareStage(phaseDesc.phase);
const now = new Date();
const todayPlan = stage === "during" ? itinerary.find((d) => d.dateISO === todayISO) ?? null : null;
const currentStopId = todayPlan?.stop?.id ?? null;
const statuses = stopStatuses(stops, currentStopId, todayISO);
const leg = stage === "during" ? currentLeg(transports, now) : null;   // [] when includeTransport is off
const currentStop = stops.find((s) => s.id === currentStopId) ?? null;
const zone = currentStop?.timezone ?? timeZone;
const localDateISO = todayISOInZone(zone);
const nowHHMM = instantToZonedTime(now, zone);
const next = nextStopAfter(stops, currentStopId ?? (leg?.toStopId ?? null));
const hrefs = shareHrefs(token);
const stayTonight = stage === "during" ? tonightsStay(accommodations, todayISO) : null;
```

Build the view models:
- **Right now `place`:**
  - With `leg`: `{ kind: "leg", toName: stops.find((s) => s.id === leg.toStopId)?.name ?? leg.arrPlace ?? "the next stop", mode: leg.mode, landsAt: leg.arrAt ? instantToZonedTime(leg.arrAt, stops.find((s) => s.id === leg.toStopId)?.timezone ?? zone) : null }`.
  - Otherwise with `currentStop`: `{ kind: "stop", name, country, night: nightsBetween(currentStop.arriveDate, todayISO) + 1, nights: nightsBetween(currentStop.arriveDate, currentStop.departDate), dayTitle, next: next ? { name: next.name, weekday: formatWeekday(next.arriveDate) } : null }`.
  - Otherwise `{ kind: "none" }`.
- **Right now `rows`:** `scope.includeDailyPlans && todayPlan ? buildShareRows(todayPlan, { nowHHMM, withAddress: false }) : null`. When `leg` is set and its departure isn't already a row, prepend a transport row built from the leg.
- **Next row:** when `next`, the outgoing transport from `currentStopId` (`transports.find((t) => t.fromStopId === currentStopId)`) gives `right = { mode: t.mode, label: t.depAt ? `${formatDayLabel(instantToZonedDateISO(t.depAt, zone))} · ${instantToZonedTime(t.depAt, zone)}` : formatDayLabel(next.arriveDate) }`. Otherwise `{ mode: null, label: formatDayLabel(next.arriveDate) }`.
- **Day by day stops:** `groupDaysByStop(itinerary, stops.map((s) => s.id))`. Each day becomes `{ dateISO, isToday: stage === "during" && day.dateISO === todayISO, title: scope.includeDailyPlans ? dayTitles.get(day.dateISO)?.title ?? null : null, rows: buildShareRows(day, { nowHHMM: day.dateISO === localDateISO ? nowHHMM : null, withAddress: true }) }`.
  - `legAfter`: from `transports.find((t) => t.fromStopId === s.id && t.toStopId === stops[i + 1]?.id)`. `label` is `${MODE_LABELS[t.mode]} to ${stops[i + 1].name}`. `line` is `[depDateLabel, [t.depPlace, depTime].filter(Boolean).join(" "), "→", [t.arrPlace, arrTime].filter(Boolean).join(" ")]` joined into "Tue 15 Dec · CDG 10:05 → FCO 12:15". Use the from/to stop zones, and drop empty parts.
  - `initialOpenId`: before → `stops[0]?.id ?? null`; during → `currentStopId ?? next?.id ?? null`; after → `null`.
- **Journal:** `stopNameByDate = Object.fromEntries(itinerary.filter((d) => d.stop).map((d) => [d.dateISO, d.stop!.name]))`.
- **Hero:** `countdown` = `countdownFor(...)` (`lib/countdown.ts`) when `kind === "sleeps"`; `progress` = `dayIndex(...)` during; `coverStops` = located stops mapped to `SketchStop` (`nights` from `nightsBetween`).
- **Sections:** `const sections = shareSections(stage, { journal: shareLink.includeJournal && journalHasCards, days: scope.includeAccommodation || scope.includeTransport || scope.includeDailyPlans, next: stage === "during" && next != null, map: mapStops.length > 0 })`. `journalHasCards` = `buildJournalCards(journalProps).length > 0`.

Render:

```tsx
<div className="min-h-screen bg-background">
  <ShareTopBar requestAccessHref={hrefs.requestAccess} />
  <main className="mx-auto w-full max-w-page-wide px-4 pb-5 pt-2 sm:px-6 lg:px-12 lg:pt-8">
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[7fr_5fr] lg:gap-6">
      {sections.map((key) => (
        <div key={key} data-share-section={key} className={cn("min-w-0", PLACEMENT[stage][key])}>
          {render(key)}
        </div>
      ))}
    </div>
    <ShareFooter />
  </main>
</div>
```

`PLACEMENT` (a module constant in `page.tsx`):

```ts
const PLACEMENT: Record<ShareStage, Partial<Record<ShareSection, string>>> = {
  before: { hero: "lg:order-1", route: "lg:order-2", map: "lg:order-3 lg:col-span-2", days: "lg:order-4 lg:col-span-2", cta: "lg:order-5 lg:col-span-2" },
  during: { hero: "lg:order-1", "right-now": "lg:order-2", next: "lg:hidden", map: "lg:order-3", route: "lg:order-4", days: "lg:order-5 lg:col-span-2", journal: "lg:order-6 lg:col-span-2", cta: "lg:order-7 lg:col-span-2" },
  after: { hero: "lg:order-1", tally: "lg:order-2 lg:self-start", journal: "lg:order-3 lg:col-span-2", map: "hidden lg:order-4 lg:block", route: "lg:order-5", days: "lg:order-6 lg:col-span-2", cta: "lg:order-7 lg:col-span-2" },
};
```

`render(key)` returns:
- hero → `<ShareHero …/>`;
- right-now → `<RightNowCard …/>`;
- next → `<NextRow …/>`;
- tally → `<ShareTally {...shareTally(stops, totalNights)} />`;
- journal → `<JournalPolaroids …/>`;
- map → `<section aria-label="Route map"><RouteMap stops={mapStops} home={homeMapPoint(trip)} showReturn={trip.roundTrip ?? false} progress={stage === "during" ? { stage, currentStopId } : { stage }} frameClassName={cn("rounded-3xl shadow-hard-4 lg:h-[400px]", stage === "during" ? "h-[180px]" : "h-[200px]")} /></section>`;
- route → `<ShareRouteList stage={stage} stops={…statuses} />`;
- days → `<DayByDay …/>`;
- cta → `<ShareCta stage={stage} stopCount={stops.length} hrefs={hrefs} />`.

Delete `share-today-card.tsx` and its test, the `journal-section.tsx` shim, and now-unused imports (`Card`, `Badge`, `Timeline`, `Home`, `formatLongDate`, `getDayWeather` usage). Remove the `@/lib/weather` mock from the page test only if nothing still imports it.

- [ ] **Step 4: Implement the OG image**

`lib/share-og.ts`: build `{ name: trip.name, subLine, sketch }`.
- `stage = shareStage(computeTripPhase({ startDate, endDate, today }))`.
- `subLine`: after → `formatMonthSpan`; else `${formatDayRange} · ${nightsBetween(start, end)} nights · ${stops.length} stops`, singular when 1.
- `model = sketchModel(located stops as SketchStop with nights, { w: 100, h: 133, pad: 0.12 })`.
- `sketch = model ? { points: model.points, vbH: 133, solid: stage === "after" } : null`.

`lib/og-card.tsx` `ShareOgCard`: a 1200×630 `OG_COLOURS.coral` ground, padding 64.
- Left column: a pill "SHARED TRIP" (card fill, 3px ink border, Jakarta 22px), the name in Bricolage 96px, lineHeight 0.9, letterSpacing -0.05em, maxWidth 680, then `subLine` in Jakarta 34px, weight 700.
- Right: a polaroid, `position: absolute`, right 90, top 90, `transform: rotate(4deg)`. It has a white card, 4px ink border, radius 16, padding 14px 14px 40px, and a `12px 12px 0` ink shadow. The inner box is 280×373 on `OG_COLOURS.paper`, with a 3px border. It holds `<svg viewBox={`0 0 100 ${vbH}`} width={280} height={373}><polyline points=… fill="none" stroke={OG_COLOURS.ink} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" {...(solid ? {} : { strokeDasharray: "3 2.5" })} /></svg>`, or the `Mark` at 160px when `sketch` is null.
- Every `div` with more than one child gets `display: "flex"` (Satori).

`app/share/[token]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { DefaultOgCard, OG_SIZE, ShareOgCard, ogFonts } from "@/lib/og-card";
import { findShareLink, loadShareStops } from "@/lib/share-lookup";
import { shareOgModel } from "@/lib/share-og";
import { currentTripTimezone, todayISOInZone } from "@/lib/tz";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A shared trip on Teepee";

/** Same public projection as the page; a revoked link gets the site card, not a 404 that confirms it existed. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fonts = await ogFonts();
  const link = await findShareLink(token);
  if (!link || !link.trip.startDate || !link.trip.endDate) {
    return new ImageResponse(<DefaultOgCard />, { ...size, fonts });
  }
  const stops = await loadShareStops(link.trip.id);
  const today = todayISOInZone(currentTripTimezone(stops));
  const model = shareOgModel({ trip: { name: link.trip.name, startDate: link.trip.startDate, endDate: link.trip.endDate }, stops, today });
  return new ImageResponse(<ShareOgCard {...model} />, { ...size, fonts });
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- "app/share/[token]" lib/share-og.test.ts lib/og-card.test.ts lib/share-view.test.ts`
Expected: PASS.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add -A "app/share/[token]" lib/og-card.tsx lib/og-card.test.ts lib/share-og.ts lib/share-og.test.ts
git commit -m "feat(share): staged page — before/during/after section order, Travellers dial, OG hero card

Privacy regression matrix across every stage with showTravellers on and off;
style bans scanned across app/share/[token].

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 16: Motion — MOTION.md S1–S11

**Files:**
- Modify: `app/globals.css` (Motion section, next to `tp-card-in`)
- Create: `app/share/[token]/share-reveal.tsx` (`"use client"`)
- Create: `app/share/[token]/share-countdown.tsx` (`"use client"`)
- Create: `app/share/[token]/pending-link.tsx` (`"use client"`)
- Create: `app/share/[token]/share-motion.test.tsx`
- Create: `app/globals.share-motion.test.ts`
- Modify: `share-hero.tsx`, `right-now-card.tsx` / `share-rows.tsx`, `day-by-day-client.tsx`, `journal-polaroids.tsx`, `share-cta.tsx`, `page.tsx`, `components/trip/route-map.tsx`

**Interfaces:**
- Produces:
  - `ShareReveal({ children, className, index }: { children: React.ReactNode; className?: string; index?: number })`. It adds `data-revealed` once, when intersecting (or immediately without `IntersectionObserver`). The CSS runs `tp-rise-in` with `animation-delay: calc(var(--tp-i) * 60ms)`.
  - `ShareCountdown({ value, token, className })`. It counts 0 → value over 600ms (pop) once per session per token (`sessionStorage["tp-share-count:" + shareRefParamClient]`). The key is the `ref` string passed down from the server, never the raw token. Under reduced motion it shows the value at once.
  - `PendingLink({ href, children, className })`. On click it shows the button's `loading` state (S11), then follows the link.
- CSS utilities: `tp-share-hero-in`, `tp-share-polaroid-in`, `tp-live-ring`, `tp-progress-fill`, `tp-strike`, `tp-reveal`.

- [ ] **Step 1: Write the failing tests**

`app/globals.share-motion.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

describe("share motion (MOTION.md S1–S10)", () => {
  it.each(["tp-share-hero-in", "tp-share-polaroid-in", "tp-live-ring", "tp-progress-fill", "tp-strike", "tp-reveal"])("defines %s", (name) => {
    expect(css).toContain(name);
  });
  it("only the live ring loops (S2)", () => {
    const infinite = css.match(/animation:[^;]*infinite[^;]*;/g) ?? [];
    const shareInfinite = infinite.filter((a) => /tp-(share|live|progress|strike|reveal)/.test(a));
    expect(shareInfinite).toHaveLength(1);
    expect(shareInfinite[0]).toContain("tp-live-ring");
  });
  it("hero drop-in is 420ms bounce; progress fill is 700ms pop after 200ms", () => {
    expect(css).toMatch(/tp-share-hero-in[^;]*420ms var\(--ease-bounce\)/);
    expect(css).toMatch(/tp-progress-fill[^;]*700ms var\(--ease-pop\) 200ms/);
  });
  it("reduced motion settles the delayed share entrances and stops the ring", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*\{[^}]*tp-live-ring[^}]*animation: none/);
    expect(reduced.length).toBeGreaterThan(0);
  });
});
```

`app/share/[token]/share-motion.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareReveal } from "./share-reveal";
import { ShareCountdown } from "./share-countdown";
import { PendingLink } from "./pending-link";

beforeEach(() => sessionStorage.clear());

describe("ShareReveal (S1)", () => {
  it("reveals at once without IntersectionObserver (jsdom), carrying its stagger index", () => {
    render(<ShareReveal index={2}><p>Section</p></ShareReveal>);
    const el = screen.getByText("Section").parentElement!;
    expect(el).toHaveAttribute("data-revealed");
    expect(el.style.getPropertyValue("--tp-i")).toBe("2");
  });
});

describe("ShareCountdown (S4)", () => {
  it("always labels the final value and records that it played for this link", async () => {
    render(<ShareCountdown value={67} refKey="abc123" />);
    expect(screen.getByLabelText("67")).toBeInTheDocument();
    await act(async () => {});
    expect(sessionStorage.getItem("tp-share-count:abc123")).toBe("1");
  });
  it("shows the value straight away when it has already played this session", () => {
    sessionStorage.setItem("tp-share-count:abc123", "1");
    render(<ShareCountdown value={67} refKey="abc123" />);
    expect(screen.getByText("67")).toBeInTheDocument();
  });
});

describe("PendingLink (S11)", () => {
  it("shows a loading state on click", async () => {
    render(<PendingLink href="/x">Use this route</PendingLink>);
    const link = screen.getByRole("link", { name: "Use this route" });
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(link).toHaveAttribute("aria-busy", "true");
  });
});
```

`ShareCountdown` takes `refKey` (the hashed ref from `shareRefParam`), not `token`. Update the Interfaces bullet and the hero prop: replace `token` in `ShareHeroProps` with `refKey: string`, passed from the page as `shareRefParam(token)`. Adjust `share-hero.test.tsx`'s fixture to `refKey: "abc"`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- app/globals.share-motion.test.ts "app/share/[token]/share-motion.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement the CSS** (in the Motion section of `app/globals.css`, after the `tp-card-in` block)

```css
/* Share page (MOTION.md S1–S10). Nothing here loops except the live ring (S2). */
@keyframes tp-share-hero-in { from { opacity: 0; transform: translateY(16px) rotate(-1deg); } }
@keyframes tp-share-polaroid-in { from { rotate: 10deg; } to { rotate: 4deg; } }
@keyframes tp-live-ring { from { box-shadow: 0 0 0 0 hsl(var(--coral) / 0.35); } to { box-shadow: 0 0 0 6px hsl(var(--coral) / 0); } }
@keyframes tp-progress-fill { from { transform: scaleX(0); } }
@keyframes tp-strike { from { background-size: 0% 2px; } }
@utility tp-share-hero-in { animation: tp-share-hero-in 420ms var(--ease-bounce) backwards; }
@utility tp-share-polaroid-in { animation: tp-share-polaroid-in 420ms var(--ease-bounce) 120ms backwards; }
@utility tp-live-ring { animation: tp-live-ring 1.8s ease-out infinite; }
@utility tp-progress-fill { animation: tp-progress-fill 700ms var(--ease-pop) 200ms backwards; }
/* Done rows draw their strike left to right (S6): a 2px ink gradient in place of text-decoration. */
@utility tp-strike {
  text-decoration: none;
  background: linear-gradient(currentColor, currentColor) no-repeat 0 55% / 100% 2px;
  animation: tp-strike var(--dur-base) var(--ease-pop) backwards;
  animation-delay: calc(var(--tp-i, 0) * 60ms);
}
.tp-reveal { opacity: 0; }
.tp-reveal[data-revealed] { opacity: 1; animation: tp-rise-in var(--dur-slow) var(--ease-pop) backwards; animation-delay: calc(var(--tp-i, 0) * 60ms); }
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  [data-slot="share-polaroid"] { transition: transform var(--dur-base) var(--ease-bounce), box-shadow var(--dur-base) var(--ease-bounce); }
  [data-slot="share-polaroid"]:hover { transform: translateY(-4px); rotate: 0deg; box-shadow: var(--shadow-5); }
}
@media (prefers-reduced-motion: reduce) {
  .tp-live-ring { animation: none !important; }
  .tp-share-polaroid-in, .tp-progress-fill, .tp-strike, .tp-reveal[data-revealed] { animation-delay: 0s !important; }
  .tp-reveal { opacity: 1; }
}
```

The polaroid hover sets `rotate: 0deg` directly, overriding the inline `rotate` style. For that to work, the card's inline `style={{ rotate }}` must move to a CSS variable: `style={{ "--tp-tilt": `${tilt}deg` } as React.CSSProperties}` with the class `[rotate:var(--tp-tilt)]`. Update the journal card that way, and the Task 14 test that reads the tilt keeps passing through `buildJournalCards`.

- [ ] **Step 4: Implement the components and wire them in**

- **S1.**
  - Hero root: add `tp-share-hero-in`.
  - Polaroid: add `tp-share-polaroid-in`.
  - `page.tsx`: wrap each non-hero section's content in `<ShareReveal index={i % 2}>`. Index 0/1 staggers the two columns of a desktop row.
  - `ShareReveal`: `"use client"`. It renders `<div className={cn("tp-reveal", className)} data-revealed={shown || undefined} style={{ "--tp-i": String(index ?? 0) } as React.CSSProperties}>`.
  - `shown` starts `false`. A `useEffect` sets it to `true` right away when `typeof IntersectionObserver === "undefined"`. Otherwise it observes once, disconnecting on the first intersection with `threshold: 0.15`.
  - So that no-JS/SSR HTML isn't invisible, add `<noscript><style>{".tp-reveal{opacity:1}"}</style></noscript>` once in `page.tsx`.
- **S2.** The hero's `[data-live-dot]` gets `tp-live-ring`.
- **S3.** The hero's `[data-slot="share-progress-fill"]` gets `tp-progress-fill`. Its inline `transform: scaleX(fraction)` stays, and the keyframe animates from `scaleX(0)` to it.
- **S4.** Replace the hero's countdown number span with `<ShareCountdown value={n} refKey={refKey} className="…same classes…" />`. It's built on `components/ui/animated-number.tsx`'s pattern:
  - initial state `value` (so SSR and hydration match);
  - a `useLayoutEffect` that, if not reduced and `sessionStorage` has no `tp-share-count:${refKey}`, sets the display to 0, runs `animate(0, value, { duration: 0.6, ease: [0.2, 0.8, 0.2, 1], onUpdate })`, and sets the key to `"1"`;
  - `aria-label={String(value)}`, with the digits `aria-hidden` and `suppressHydrationWarning`;
  - every `sessionStorage` access wrapped in try/catch.
- **S5.** In `route-map.tsx`, when `progress.stage === "during"`:
  - The here-pin's inner wrapper gets the class `tp-pop-in`; the MOTION.md 0.6 → 1.1 → 1 bounce is close enough to `tp-zoom-in` with bounce. Use `tp-pop-in`.
  - The tag gets `tp-rise-in [animation-delay:200ms] [animation-fill-mode:backwards]`.
  - Travelled solid legs get a `className: "tp-leg-draw"` Leaflet path option, and add CSS `@keyframes tp-leg-draw { from { stroke-dashoffset: 1000; } } .tp-leg-draw { stroke-dasharray: 1000; animation: tp-leg-draw 700ms var(--ease-pop) backwards; }`, with `.tp-leg-draw { animation: none; stroke-dasharray: none; }` under reduced motion. When the animation ends, the line must render solid: set `animation-fill-mode: backwards` and add `.tp-leg-draw` `animationend` → `stroke-dasharray: none` via CSS: `@keyframes tp-leg-draw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }` keeps a 1000-length dash, which is longer than any leg on screen and so reads as solid.
  - Add a `route-map.test.tsx` assertion that a travelled leg's options include `className: "tp-leg-draw"`.
- **S6.** In `ShareRow`, a done row's title uses `tp-strike text-muted-foreground` instead of `line-through`, with `style={{ "--tp-i": String(doneIndex) }}`. Pass `doneIndex` from the list. Update the Task 10 tests' `line-through` expectations to `tp-strike`, and keep `data-done`.
- **S7 / S8.** In `day-by-day-client.tsx`:
  - Wrap each `StopBlock` body in `<AnimatePresence initial={false} mode="popLayout">`. The open card is a `motion.div` with `key="open"`, `initial={{ height: 0, opacity: 0 }}`, `animate={{ height: "auto", opacity: 1, transition: { height: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }, opacity: { delay: 0.06, duration: 0.18 } } }}`, `exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}` and `style={{ overflow: "hidden" }}`.
  - The folded row is the same with `key="folded"`.
  - Wrap the `<ol>` items in `motion.li layout` (180ms).
  - The chevron rotates via `motion.span animate={{ rotate: open ? 180 : 0 }}`.
  - In `StopIndex`, the active row's background is a `motion.span layoutId="share-stop-index-active" className="absolute inset-0 rounded-xl border-2 border-border bg-teal/15"` (180ms), with the button made `relative`. Drop the static `bg-teal/15` from the button.
  - `MotionConfig reducedMotion="user"` is already applied app-wide by `components/ui/motion-provider.tsx`.
- **S9.** Handled by the CSS above. The journal `ul`s already have `snap-x`.
- **S10.** Wrap the CTA's primary button in a `ShareReveal`-like one-shot: give `share-cta.tsx`'s button wrapper `<ShareReveal className="[&[data-revealed]>*]:tp-pop">`. If Tailwind rejects the `tp-pop` utility in a variant, add `.tp-reveal[data-revealed] [data-cta-button] { animation: tp-pop var(--dur-slow) var(--ease-bounce) 1; }` and mark the button `data-cta-button`.
- **S11.** Replace the After CTA's "Use this route" and "Request access" `Link`s with `<PendingLink>`. It's `"use client"`: it renders `<Button asChild variant="primary" size="lg" loading={pending} className=…><Link href={href} aria-busy={pending || undefined} onClick={() => setPending(true)}>{children}</Link></Button>`. First check that `Button`'s `loading` works with `asChild`, by reading `components/ui/button.tsx`. If it doesn't, render the spinner inline.

- [ ] **Step 5: Run everything touched**

Run: `npm test -- app/globals.share-motion.test.ts "app/share/[token]" components/trip/route-map.test.tsx`
Expected: PASS (including the Task 15 page tests and the style-ban scan).

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add app/globals.css app/globals.share-motion.test.ts "app/share/[token]" components/trip/route-map.tsx components/trip/route-map.test.tsx
git commit -m "feat(share): motion — hero drop-in, live ring, progress fill, countdown, reveals, strikes, folds

MOTION.md S1–S11; reduced motion settles everything, only S2 loops.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 17: Phase gate

**Files:** none (verification + tag).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all green. Fix anything that fails, root cause first (superpowers:systematic-debugging), and commit each fix separately.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Build**

Run: `npx next build`
Expected: success. The build lists `/share/[token]/opengraph-image` as a dynamic route, and there are no "Dynamic server usage" errors on `/share/[token]`.

- [ ] **Step 4: Grep guards**

```bash
grep -rn "shadow-soft\|border-border/70\|bg-card/40" "app/share/[token]" components/trip/route-map.tsx components/trips/cover-route-sketch.tsx components/trip/settings/share-links-panel.tsx app/landing lib/share-*.ts
grep -rn "use server" server/actions/copy-route-from-share.ts
grep -rn "api/avatars" "app/share"
grep -rn "email" lib/share-lookup.ts "app/share/[token]/page.tsx"
```

Expected: all four print nothing. (For the last, the page may mention "email" only in a comment that says it is never selected. If so, confirm that by reading it.)

- [ ] **Step 5: Tag**

```bash
git tag phase-4-share
git log --oneline -1 --decorate
```

Expected: the latest commit carries `tag: phase-4-share`. Do not push.

---

## Orchestrator notes (spec gaps and decisions taken in this plan)

1. **Cover photo on the Share hero.** SHARE.md §3 wants "the photo if there is one". But Trip cover photos have no public, link-scoped serve route, and §10 says the listed changes are the only data changes. This plan always draws the route sketch or passport stamp. Adding the photo would need a `/share/[token]/cover` route and an ADR 0051 note.
2. **"Never contains `reference`" vs the required footer "booking references".** The privacy test removes `SHARE_FOOTER_COPY` before scanning for the words. It also scans for private values in the full HTML.
3. **`?ref=share&t=` is carried, not counted.** Nothing in the repo records it: no analytics, and the Access request stores nothing about it. Recording it on `AccessRequest` would be a new decision.
4. **CONTEXT.md "Profile photo … never on a Share link"** contradicts the ADR 0051 2026-09-30 amendment. Task 4 edits that one clause.
5. **Use this route carries the raw token** inside `callbackUrl`, which is unavoidable because New trip needs it. Only the tracking `t=` is hashed.
6. **One open stop at every width** in Day by day. SHARE.md requires this only on mobile. It keeps one state model and matches the desktop mock.
7. The spec calls the action `copyRouteFromShare(token)`. The cross-phase contract names it `routeStopsFromShare`, in `server/actions/copy-route-from-share.ts` and called from `createTrip`. This plan uses the contract name.
