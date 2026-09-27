# Beta feedback lot 2026-09-27 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 10 open beta Feedback notes of 2026-09-27 and ship the new desktop Home + sidebar shell, per the agreed spec, on one branch.

**Architecture:** 24 tasks in dependency order. Data/model tasks first (profile, day titles, item photo, journal rules, cover aspect), each with an additive Prisma migration and colocated vitest tests (db always mocked — the sandbox has no Postgres). Then the shell (sidebar ≥1280px, Dock 768–1279px, no top bar ≥768px), inline search, then the desktop Home rebuilt tile by tile, then plan-editor, trips-list and share-page surfaces, then Your travels, then docs/release notes and a verification pass. Phone layouts (<768px) are untouched except where the spec says (card spacing; Today's journal card last).

**Tech Stack:** Next.js App Router (this version differs from training data — read the relevant guide in `node_modules/next/dist/docs/` before touching any Next API), React 19, TypeScript, Tailwind v4 tokens (`app/globals.css`), Prisma 7 (schema + SQL migrations; never applied here), Radix, Leaflet, lucide-react, `motion`, vitest + Testing Library + jsdom.

**Spec:** `docs/specs/2026-09-27-beta-feedback.md` (binding; sections A–M referenced below) and `docs/specs/2026-09-27-desktop-home.md` (visual detail; the beta-feedback spec's amendments override it). Glossary: `CONTEXT.md` (already updated: Day title, Item photo, Profile photo / display name, Journal, Your travels). ADR 0051 already amended.

## Global Constraints

- Branch `feat/beta-feedback-2026-09-27`. Never commit to `beta`/`main`/`master`; never deploy; never run `npm run feedback:pull` or `feedback:resolve`; never touch production env files.
- Breakpoints: full sidebar at `xl` (≥1280px); Dock at `md`–`xl` (768–1279px); **no top app bar at `md` and up**; phone (<768px) header + tab bar unchanged. New desktop Home grid at `lg`+ (narrower 1024–1279, full at `xl`); below `lg` the existing phone Home stays.
- Playground system (ADR 0060/0061): paper and ink, 2px `border-border`, hard shadows (`shadow-hard-*` utilities), `lib/hues.ts` ramp, `Card` tones. **No hex in components** — hex only in `lib/map-palette.ts`. Text on coloured fills is ink. Contrast must be measured, not assumed (ADR 0061).
- Vocabulary from `CONTEXT.md`. UI copy never says "activity" (for an Item), "event", "hotel", "city", "place" for a Stop (button reads "+ Add a stop"), "chapter" for a geographic cluster, "Profile" for the Account page.
- Migrations: `prisma/migrations/2026092710000N_<slug>/migration.sql`, additive only (nullable or defaulted columns / new tables; no renames/drops/new constraints on existing columns), each with the DEPLOY.md §4b comment header in the style of `20260927000005_trip_cover_focal`. After a schema edit: `npx prisma validate && npx prisma generate`. Not applied by this work.
- Dates shown to people via `formatDayLabel` (`lib/dates.ts`) → "Sat 12 Dec"; never ISO.
- Money: `lib/money.ts` helpers; unabbreviated amounts always 2 decimals.
- Reduced motion respected (`useReducedMotion` / `MotionConfig reducedMotion="user"`); no animated rotation.
- Accessibility: one `h1` per page; tiles use `h2`; 44px touch targets; global focus ring; `aria-current` on active nav.
- Commit trailers: a closing commit ends with a blank line, then `Resolves-Feedback: <id>` line(s), then the Co-Authored-By line the harness mandates. Stage only files you changed.
- Before each commit: that task's test files, `npx tsc --noEmit`. Task 24 runs the full suite, lint and build.
- Feedback ids: shell `cmuhvq385000504jq9szohz3s`; search `cmuhvu6z7000a04la34e6shtu`; card spacing `cmuhvvx2a000b04la44421ltj`; portrait cover `cmuj4l1d9000004l0osapqw3r`; stops list `cmuhvbi4h000004jq6q93wyfx`; day titles `cmuhvc6jn000204la2yw7zxlh`; item photo `cmuhv7doa000104lahz1feyf1`; profile `cmuhvqysk000604jq8inrb96b`; journal `cmuhvsabe000704jq5oy7qj30`; travels `cmuhw0f0w000a04jqh2r161a9`.

## Review Focus

- **A Traveller with no display name, no photo and no provider image** (dev-login, or an email-only account) must render initials everywhere — never a broken `<img>` or "undefined". Test in Task 1 (`travellerAvatar` resolution) and Task 2 (component).
- **A Stop shortened after a Day title was set on its last day, then lengthened again** — the title disappears and returns; nothing throws when `dayIndex ≥ nights+1`. Test in Task 4.
- **A Journal write for a future date or before the Trip starts, sent straight to the server action** (bypassing the UI) must be refused; a date on the Trip's last day in the Trip's timezone while it is still "yesterday" in UTC must be accepted. Tests in Task 6.
- **A Share link with `includeJournal` on, requested for a non-Journal attachment id (a ticket PDF)** must 404; so must a Journal photo whose author kept that day off Share links. Test in Task 20.
- **A Trip with a single Stop, or all Stops in one country, or Stops with no coordinates** on the Home route map and the Travel map — no NaN bounds, no crash, sensible chip label (country name; "Whole trip" still works). Tests in Task 14 (`clusterStops`) and Task 22.

---

### Task 1: Profile data — display name, profile photo, resolution helpers, Account card

**Files:**
- Modify: `prisma/schema.prisma` (model `User`)
- Create: `prisma/migrations/20260927100001_user_profile/migration.sql`
- Create: `lib/traveller.ts`, `lib/traveller.test.ts`
- Create: `server/actions/profile.ts`, `server/actions/profile.test.ts`
- Create: `app/api/avatars/[userId]/route.ts`, `app/api/avatars/[userId]/route.test.ts`
- Create: `components/account/profile-card.tsx`, `components/account/profile-card.test.tsx`
- Modify: `app/(app)/account/page.tsx` (render `ProfileCard` first)

**Interfaces:**
- Schema: `User.displayName String?`, `User.photoKey String?`, `User.photoUpdatedAt DateTime?` (cache-buster). Provider fields `name`/`image` untouched (the adapter owns them).
- Produces (`lib/traveller.ts`):
  ```ts
  export interface TravellerLike { id: string; name: string | null; image: string | null; displayName?: string | null; photoKey?: string | null; photoUpdatedAt?: Date | null; email?: string | null }
  export const TRAVELLER_SELECT = { id: true, name: true, image: true, displayName: true, photoKey: true, photoUpdatedAt: true } as const;
  export function travellerName(u: TravellerLike): string;            // displayName → name → email local-part → "Traveller"
  export function travellerFirstName(u: TravellerLike): string;       // first word of travellerName
  export function travellerImageUrl(u: TravellerLike): string | null; // photoKey → `/api/avatars/${id}?v=${photoUpdatedAt ms}`; else image; else null
  export function travellerInitials(u: TravellerLike): string;        // up to 2 letters of travellerName; "?" if none
  ```
- Produces (`server/actions/profile.ts`, all return the unified `ActionResult` of ADR 0027 — see `lib/action-result.ts` or the shape used in `server/actions/share.ts`):
  `setDisplayName(name: string)` (trim, 1–60 chars; empty string clears to null), `setProfilePhoto(formData: FormData)` (field `file`; image only; `validateUpload`; key via `generateKey({ user: id }, uuid, "avatar.<ext>")` — extend `generateKey` if it has no user scope; old key → `scheduleBlobDeletion`), `removeProfilePhoto()`. Each calls `revalidatePath("/", "layout")`.
- Route `GET /api/avatars/[userId]`: 200 (presigned redirect like `app/api/attachments/[id]/route.ts`) only if requester is that user, or shares a `TripMember` trip or `GlobeMember` globe with them; else 404. Never reachable without a session.

- [ ] **Step 1: Failing tests.** `lib/traveller.test.ts`:
  ```ts
  import { travellerName, travellerFirstName, travellerImageUrl, travellerInitials } from "./traveller";
  const base = { id: "u1", name: null, image: null };
  it("prefers displayName, then provider name, then email local part", () => {
    expect(travellerName({ ...base, displayName: "Cam", name: "Cameron Williams" })).toBe("Cam");
    expect(travellerName({ ...base, name: "Cameron Williams" })).toBe("Cameron Williams");
    expect(travellerName({ ...base, email: "xanthia@example.com" })).toBe("xanthia");
    expect(travellerName(base)).toBe("Traveller");
  });
  it("first name is the first word", () => expect(travellerFirstName({ ...base, name: "Cameron Williams" })).toBe("Cameron"));
  it("uploaded photo wins over provider image, with a cache-buster", () => {
    expect(travellerImageUrl({ ...base, image: "https://g/x.png", photoKey: "k", photoUpdatedAt: new Date(5) })).toBe("/api/avatars/u1?v=5");
    expect(travellerImageUrl({ ...base, image: "https://g/x.png" })).toBe("https://g/x.png");
    expect(travellerImageUrl(base)).toBeNull();
  });
  it("initials never empty", () => {
    expect(travellerInitials({ ...base, name: "cameron williams" })).toBe("CW");
    expect(travellerInitials(base)).toBe("T");
  });
  ```
  `server/actions/profile.test.ts` (mock `@/lib/auth`, `@/lib/db`, `@/lib/storage`): `setDisplayName("  ")` stores `null`; a 61-char name fails with an error; `setProfilePhoto` with a PDF is refused; with a PNG it saves to storage then updates `photoKey` + `photoUpdatedAt` and schedules the old key for deletion. Route test: requester not sharing any Trip/Globe → 404; sharing a trip → redirect.
  `profile-card.test.tsx`: renders current name in an input labelled "Display name", a "Remove photo" button only when a photo is set, and calls `setDisplayName` on save.
- [ ] **Step 2: Run** `npx vitest run lib/traveller.test.ts server/actions/profile.test.ts app/api/avatars components/account/profile-card.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Schema + migration (`ALTER TABLE "User" ADD COLUMN "displayName" TEXT, ADD COLUMN "photoKey" TEXT, ADD COLUMN "photoUpdatedAt" TIMESTAMP(3);` with §4b header). Helpers, actions, route, card. The card: circular preview (`TravellerAvatar` is Task 2 — use a plain `Avatar` here), file input (`accept="image/*"`, compress via `compressImage` from `lib/image-compress.ts`), square centre-crop in the browser to 512×512 via a canvas before upload (a simple helper `cropSquare(file): Promise<File>` in `lib/crop-square.ts`, unit-tested for output dimensions with a mocked canvas is optional — keep it small), display-name input + Save. Place at the top of `/account`.
- [ ] **Step 4: Run** tests + `npx prisma validate && npx prisma generate && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(account): profile photo and display name` with trailer `Resolves-Feedback: cmuhvqysk000604jq8inrb96b`.

---

### Task 2: One `TravellerAvatar` everywhere

**Files:**
- Create: `components/ui/traveller-avatar.tsx`, `components/ui/traveller-avatar.test.tsx`
- Modify (replace local `initials()` + `Avatar` markup, and select `TRAVELLER_SELECT` instead of `{ id, name, image }` in the owning query): `app/(app)/layout.tsx`, `app/(app)/trips/[tripId]/layout.tsx`, `app/(app)/trips/[tripId]/journal/page.tsx`, `app/(app)/admin/access-requests.tsx` (access requests are not Users — keep their own fallback, just use `TravellerAvatar` with a synthetic `{id,name,image}`), `components/trip/vote-control.tsx`, `components/trip/notification-bell.tsx`, `components/trip/journal-entry-view.tsx`, `components/trip/note-thread.tsx`, `components/trip/checklist.tsx`, `components/trip/invite-panel.tsx`, plus their server loaders that select user fields (grep `select: { id: true, name: true, image: true }` and `user: { select:`).
- Modify: `lib/auth.ts` is **not** changed; the shell reads the signed-in user from the DB (`db.user.findUnique({ where: { id: session.user.id }, select: TRAVELLER_SELECT })`) so a change shows immediately.

**Interfaces:**
- Consumes: `lib/traveller.ts` (Task 1).
- Produces: `<TravellerAvatar traveller={TravellerLike} size={24|32|36|40} className? ring? />` — renders `AvatarImage` when `travellerImageUrl` is non-null, `AvatarFallback` with `travellerInitials` always, `title`/`alt` = `travellerName`.

- [ ] **Step 1: Failing tests.** `traveller-avatar.test.tsx`: with `photoKey` renders an img whose src starts `/api/avatars/u1`; with nothing renders initials "T" and no img. Add one assertion per migrated surface that already has a test file (e.g. `journal-entry-view.test.tsx`: an author with `displayName: "Cam"` shows "Cam"; `notification-bell.test.tsx` likewise). Add a repo guard test `lib/no-local-initials.test.ts` that reads the modified files with `fs` and asserts none define `function initials(`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the component and migrate every site; journal page must now render the image (it only rendered fallback).
- [ ] **Step 4: Run** the touched test files + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `refactor(avatars): one TravellerAvatar with profile photo and display name` (trailer `Resolves-Feedback: cmuhvqysk000604jq8inrb96b`).

---

### Task 3: Storage copy + image size reader

**Files:**
- Modify: `lib/storage.ts` (add `copy(srcKey: string, destKey: string): Promise<void>` to the `Storage` interface and both implementations — S3 via `CopyObjectCommand`, local via `fs.copyFile`)
- Create: `lib/image-size.ts`, `lib/image-size.test.ts`
- Modify: `lib/storage.test.ts` (or create if absent)

**Interfaces:**
- Produces: `storage.copy(src, dest)`; `readImageSize(bytes: Uint8Array): { width: number; height: number } | null` supporting PNG (IHDR), JPEG (SOFn markers), GIF (logical screen), WebP (VP8 / VP8L / VP8X). Returns null on anything else or truncated input.

- [ ] **Step 1: Failing tests.** Build minimal byte fixtures in the test: PNG header with IHDR width 300 height 400 → `{300,400}`; GIF89a 10×20; WebP VP8X canvas 1200×1600 (24-bit little-endian width-1/height-1 at bytes 24–29); JPEG with an APP0 segment then SOF0 (height 480, width 640) → `{640,480}`; random bytes → null; truncated PNG → null. Storage: local impl `copy` produces a readable file with identical bytes (use a tmp dir).
- [ ] **Step 2: Run** `npx vitest run lib/image-size.test.ts lib/storage.test.ts` → FAIL.
- [ ] **Step 3: Implement** `readImageSize` as a pure byte parser (DataView, bounds-checked) and `copy` in both storages.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(storage): copy objects; read image dimensions from headers`.

---

### Task 4: Day titles — model and actions

**Files:**
- Modify: `prisma/schema.prisma` (new model `DayTitle`; relation on `Stop`)
- Create: `prisma/migrations/20260927100002_day_title/migration.sql`
- Create: `lib/day-titles.ts`, `lib/day-titles.test.ts`
- Create: `server/actions/day-titles.ts`, `server/actions/day-titles.test.ts`
- Modify: `server/actions/forks.ts` (`createFork` copies titles for copied Stops using its stop id map; promote needs nothing — titles hang off Stops that are retagged)
- Modify: `lib/activity*.ts` entity types if `recordPlanActivity` requires a known entity type (add `DAY_TITLE` label "Day title")

**Interfaces:**
- Schema:
  ```prisma
  model DayTitle {
    id       String @id @default(cuid())
    stopId   String
    dayIndex Int    // 0-based offset from the owning Stop's arriveDate (CONTEXT.md "Day title")
    title    String
    stop     Stop   @relation(fields: [stopId], references: [id], onDelete: Cascade)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    @@unique([stopId, dayIndex])
  }
  ```
  The Plan is the Stop's plan; no `forkId`/`tripId` columns (a Stop never changes plan except by promote retagging, which carries titles for free).
- Produces (`lib/day-titles.ts`, pure):
  ```ts
  export interface DayTitleRow { stopId: string; dayIndex: number; title: string }
  export interface StopSpan { id: string; arriveDate: string | null; departDate: string | null }
  /** Map dateISO → { title, ownerStopId } for every title whose day exists in its Stop's stay (arrive..depart inclusive). Hidden (out-of-stay) titles are omitted. If two Stops title the same date (changeover), the earlier-arriving Stop wins. */
  export function titlesByDate(stops: StopSpan[], titles: DayTitleRow[]): Map<string, { title: string; stopId: string }>;
  /** dayIndex of dateISO within the Stop's stay, or null if outside / Stop rough. */
  export function dayIndexFor(stop: StopSpan, dateISO: string): number | null;
  ```
- Produces (`server/actions/day-titles.ts`): `setDayTitle({ stopId, date, title }): Promise<ActionResult>` — `requireStopAccess`; computes `dayIndex` via `dayIndexFor` (refuse if null or Stop rough); if the date is a changeover day and the *other* Stop already owns a title for it, updates that row instead (so one date carries one title); empty/whitespace title deletes; max 80 chars; records Activity; revalidates plan, calendar, day and Home paths.

- [ ] **Step 1: Failing tests.** `lib/day-titles.test.ts`:
  ```ts
  const lisbon = { id: "s1", arriveDate: "2026-12-10", departDate: "2026-12-13" };
  const porto  = { id: "s2", arriveDate: "2026-12-13", departDate: "2026-12-15" };
  it("places a title on arrive + dayIndex", () => {
    expect(titlesByDate([lisbon], [{ stopId: "s1", dayIndex: 1, title: "Sintra day trip" }]).get("2026-12-11")).toEqual({ title: "Sintra day trip", stopId: "s1" });
  });
  it("rides with the Stop when re-dated", () => {
    const moved = { ...lisbon, arriveDate: "2026-12-17", departDate: "2026-12-20" };
    expect(titlesByDate([moved], [{ stopId: "s1", dayIndex: 1, title: "X" }]).has("2026-12-18")).toBe(true);
  });
  it("hides a title beyond a shortened stay and shows it again when lengthened", () => {
    const short = { ...lisbon, departDate: "2026-12-11" };
    const t = [{ stopId: "s1", dayIndex: 3, title: "Last day" }];
    expect(titlesByDate([short], t).size).toBe(0);
    expect(titlesByDate([lisbon], t).get("2026-12-13")?.title).toBe("Last day");
  });
  it("a changeover day carries one title", () => {
    const m = titlesByDate([lisbon, porto], [{ stopId: "s1", dayIndex: 3, title: "Train day" }]);
    expect(m.get("2026-12-13")).toEqual({ title: "Train day", stopId: "s1" });
  });
  it("rough stops have no days", () => expect(dayIndexFor({ id: "r", arriveDate: null, departDate: null }, "2026-12-10")).toBeNull());
  ```
  Action test (mock db): setting on Porto's first day when Lisbon owns `dayIndex 3` updates Lisbon's row; `""` deletes; a date outside the stay returns an error.
  Fork test (extend `server/actions/forks.test.ts`): `createFork` copies `DayTitle` rows onto the new Stop ids.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** schema, migration (`CREATE TABLE "DayTitle" ...; CREATE UNIQUE INDEX ...; ALTER TABLE ... FOREIGN KEY ... ON DELETE CASCADE`), pure lib, action, fork copy. `Duplicate` (`server/actions/trips.ts`) copies nothing — assert in an existing duplicate test that `dayTitle` is never written.
- [ ] **Step 4: Run** tests + prisma validate/generate + tsc → PASS.
- [ ] **Step 5: Commit** `feat(plan): Day titles ride with their Stop` (trailer `Resolves-Feedback: cmuhvc6jn000204la2yw7zxlh`).

---

### Task 5: Day titles — every surface

**Files:**
- Modify: `components/trip/stop-day-list.tsx` (day row header: inline editable title — a button showing the title or muted "Name this day" that becomes an `<input>`; Enter/blur saves via `setDayTitle`, Esc cancels), test `components/trip/stop-day-list.test.tsx`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` + `components/trip/itinerary-manager.tsx` (load `DayTitle` rows for the plan's Stops; pass `titlesByDate` result down to `StopDayList`)
- Modify: day page `app/(app)/trips/[tripId]/day/[date]/page.tsx` (title as heading line above the date), calendar agenda `components/trip/agenda-view.tsx` and month grid `components/trip/calendar-views.tsx` (title under the date, truncated), Home Today (Travelling Today tile — Task 17 consumes a `dayTitle?: string` prop; add the data load here in `phase-travelling.tsx`), share page `app/share/[token]/page.tsx` day-by-day (only when `includeDailyPlans`)
- Tests: each modified component's colocated test gets one assertion that a title renders.

**Interfaces:**
- Consumes: `titlesByDate`, `setDayTitle` (Task 4).
- Produces: loaders return `dayTitles: Record<string /*dateISO*/, { title: string; stopId: string }>` (plain object so it serialises to client components).

- [ ] **Step 1: Failing tests.** `stop-day-list.test.tsx`: a day with a title shows it; clicking "Name this day", typing "Sintra day trip" + Enter calls `setDayTitle({ stopId, date, title: "Sintra day trip" })`; a changeover day row under the non-owning Stop shows the title too. Agenda/month/day/share: title text present for a titled date and absent otherwise. Calendar feed test (`lib/ics*.test.ts`): unchanged output (no title) — assert it does not include the title string.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** touched tests + tsc → PASS.
- [ ] **Step 5: Commit** `feat(plan): show and edit Day titles across the plan, Days, day view and share page` (trailer `Resolves-Feedback: cmuhvc6jn000204la2yw7zxlh`).

---

### Task 6: Journal rules — window, one note + one photo, keep off Share links

**Files:**
- Modify: `prisma/schema.prisma` (`JournalEntry.hiddenFromShares Boolean @default(false)`), create `prisma/migrations/20260927100003_journal_hidden_from_shares/migration.sql`
- Create: `lib/journal-window.ts`, `lib/journal-window.test.ts`
- Modify: `lib/validations/journal.ts` (+ test) — body max 500 **for new or changed text**
- Modify: `server/actions/journal.ts` (+ `journal.test.ts`) — window check, length rule, `setJournalShareHidden`
- Modify: `server/actions/attachments.ts` (+ test) — JOURNAL uploads: window check; per author per date at most one photo — uploading when the author already has one **replaces** it (delete old attachment + schedule blob) only when `formData.get("replace") === "1"`, else returns `{ success:false, error:"You already have a photo for this day.", code:"JOURNAL_PHOTO_EXISTS" }`

**Interfaces:**
- Produces (`lib/journal-window.ts`):
  ```ts
  /** Trip days a Traveller may write for: start..min(today, end), inclusive, in the Trip's local "today". Empty before day 1 or for a date-less Trip. */
  export function journalWritableDates(input: { startDate: string | null; endDate: string | null; today: string }): string[];
  export function canWriteJournal(input: { startDate: string | null; endDate: string | null; today: string; date: string }): boolean;
  export const JOURNAL_NOTE_MAX = 500;
  ```
  `today` is computed by callers with `todayISOInZone(currentTripTimezone(orderPlanStops(stops)))` — the same as the Home page.
- `saveJournalEntry(tripId, date, body, opts?)`: refuse when `!canWriteJournal`; refuse `body.length > 500` **unless** the existing row's body is unchanged (legacy long entries stay editable only by shortening: if the new body differs and is >500, refuse). Empty body deletes only when `hiddenFromShares` is false; if true, keeps the row with `body: ""`.
- `setJournalShareHidden(tripId, date, hidden: boolean)`: upserts the author's row (`body` defaults `""`).

- [ ] **Step 1: Failing tests.**
  ```ts
  import { journalWritableDates, canWriteJournal } from "./journal-window";
  it("opens on day 1 and never runs ahead of today", () => {
    expect(journalWritableDates({ startDate: "2026-12-04", endDate: "2027-01-08", today: "2026-12-01" })).toEqual([]);
    expect(journalWritableDates({ startDate: "2026-12-04", endDate: "2027-01-08", today: "2026-12-06" })).toEqual(["2026-12-04", "2026-12-05", "2026-12-06"]);
  });
  it("stays open after the Trip ends", () => {
    expect(canWriteJournal({ startDate: "2026-12-04", endDate: "2026-12-06", today: "2027-02-01", date: "2026-12-05" })).toBe(true);
    expect(canWriteJournal({ startDate: "2026-12-04", endDate: "2026-12-06", today: "2027-02-01", date: "2026-12-07" })).toBe(false);
  });
  it("date-less trips have no Journal days", () => expect(journalWritableDates({ startDate: null, endDate: null, today: "2026-12-06" })).toEqual([]));
  ```
  Action tests: future date refused; 501 new chars refused; an existing 900-char entry saved unchanged is accepted; second photo without `replace` returns `JOURNAL_PHOTO_EXISTS`; with `replace=1` deletes the old attachment; `setJournalShareHidden(true)` creates a row with empty body; a trip-local "today" that is UTC-yesterday is accepted (mock `todayISOInZone`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + prisma validate/generate + tsc → PASS.
- [ ] **Step 5: Commit** `feat(journal): opens on day 1; one note and one photo per Traveller per day` (trailer `Resolves-Feedback: cmuhvsabe000704jq5oy7qj30`).

---

### Task 7: Journal surfaces — timeline page, editor, Today's journal

**Files:**
- Modify: `components/trip/journal-editor.tsx` (+ test): 500-char counter ("123 / 500", `aria-live="polite"`), one photo slot with Replace (confirm dialog) / Remove, "Keep off Share links" switch; legacy >500 notes show the full text with a note "Shorten to under 500 to edit" (editing allowed; save refuses if still over)
- Modify: `app/(app)/trips/[tripId]/journal/page.tsx` (+ test): timeline, newest arrived day first; each day shows every Traveller's note + photo side by side (`TravellerAvatar`, display name); your own card is editable in place (reuse `JournalEditor`); before day 1: an empty state "Opens on day 1 — {formatDayLabel(start)}"
- Create: `components/trip/todays-journal.tsx` (+ test): server-fed props `{ tripId, date, mine, others }` — your editor + co-Travellers' read-only entries for today
- Modify: `components/trip/home/phase-travelling.tsx` (+ test): render `TodaysJournal` as the **last** card on phone (desktop placement is Task 17)
- Day view keeps its entries (just make it respect the window: no editor for future dates)

**Interfaces:**
- Consumes: `canWriteJournal`, `journalWritableDates`, `JOURNAL_NOTE_MAX`, `setJournalShareHidden` (Task 6); `TravellerAvatar` (Task 2).
- Produces: `<TodaysJournal tripId date mine={JournalEntryView|null} minePhoto={AttachmentView|null} others={Array<{ traveller: TravellerLike; body: string; photo: AttachmentView|null }>} />` exported from `components/trip/todays-journal.tsx`, plus `loadTodaysJournal(tripId, today, userId)` in `lib/journal-loader.ts` returning those props (Task 17 reuses it).

- [ ] **Step 1: Failing tests.** Counter updates as you type and turns destructive-text at >500 with Save disabled; Replace asks for confirmation before calling upload with `replace=1`; journal page before day 1 shows "Opens on day 1"; Travelling phone Home renders `data-testid="todays-journal"` as the last child of the phone column.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + tsc → PASS.
- [ ] **Step 5: Commit** `feat(journal): timeline page, Today's journal card, counter and photo slot` (trailer `Resolves-Feedback: cmuhvsabe000704jq5oy7qj30`).

---

### Task 8: Item photo — model and actions

**Files:**
- Modify: `prisma/schema.prisma` (`Item.photoAttachmentId String?` — no FK, resolved leniently), create `prisma/migrations/20260927100004_item_photo/migration.sql`
- Create: `server/actions/item-photo.ts`, `server/actions/item-photo.test.ts`
- Modify: `server/actions/items.ts` (`scheduleItem` copy-in: if the source idea has a photo, `storage.copy` its object to a new key and create a new ITEM `Attachment` for the placed copy, set its `photoAttachmentId`; `deleteItem` already deletes item attachments — verify the photo is among them), `server/actions/forks.ts` (`createFork` item copy does the same), tests alongside
- Create: `lib/item-photo.ts` (`itemPhotoUrl(item, attachmentsById): string | null`)

**Interfaces:**
- `setItemPhoto(formData)` fields `itemId`, `file` (image only, compressed client-side): uploads through the same path as `uploadAttachment` (reuse its internals — extract a helper `createAttachmentFromFile({ tripId, targetType, targetId, file, userId })` in `server/actions/attachments.ts` if needed), then sets `photoAttachmentId`; an existing photo is deleted first. `removeItemPhoto(itemId)` deletes the attachment and nulls the column.
- Share page never selects `photoAttachmentId` (floor).

- [ ] **Step 1: Failing tests.** `setItemPhoto` on a PDF refused; on PNG creates attachment + sets column; second call deletes the first. `scheduleItem` of an idea with a photo calls `storage.copy(srcKey, newKey)` and the new Item's `photoAttachmentId` differs from the source's. `removeItemPhoto` nulls the column. A share-page query test asserts the Item select has no `photoAttachmentId`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + prisma validate/generate + tsc → PASS.
- [ ] **Step 5: Commit** `feat(items): one photo per Item, copied on scheduling and forking` (trailer `Resolves-Feedback: cmuhv7doa000104lahz1feyf1`).

---

### Task 9: Item photo — thumbnails and dialog

**Files:**
- Create: `components/trip/item-photo-thumb.tsx` (+ test): 40px rounded square `<img>` with 2px ink border, button opening a full-size lightbox (`Dialog`) with the image and alt = Item title
- Modify: `components/trip/item-form-dialog.tsx` (+ test): "Photo" field at the top — drop zone / file button, preview, Replace, Remove; uses `setItemPhoto`/`removeItemPhoto`
- Modify: plan-editor rows (`components/trip/stop-card.tsx` things-to-do rows, `components/trip/stop-day-list.tsx` `DayItemRow`), `components/trip/item-card.tsx` (Wishlist), `components/trip/timeline.tsx` (Day view rows, larger 64px) — show the thumb when present; loaders pass `photoUrl` per Item (plan page already loads ITEM attachments into `attachmentsByItemId` — derive from it)

**Interfaces:**
- Consumes: `itemPhotoUrl` (Task 8).
- Produces: every Item view-model gains `photoUrl: string | null`.

- [ ] **Step 1: Failing tests.** Thumb renders img and opens dialog on click; dialog Photo field calls `setItemPhoto` with the file; stop-card thing row with `photoUrl` shows `data-testid="item-photo-thumb"`; without, none.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** + tsc → PASS.
- [ ] **Step 5: Commit** `feat(items): photo thumbnails on plan, day and Wishlist rows` (trailer `Resolves-Feedback: cmuhv7doa000104lahz1feyf1`).

---

### Task 10: Cover aspect + portrait trips-list cards

**Files:**
- Modify: `prisma/schema.prisma` (`Trip.coverAspect Float?` — width/height), create `prisma/migrations/20260927100005_trip_cover_aspect/migration.sql`
- Modify: `server/actions/cover.ts` (+ test): after reading bytes, `readImageSize` → store `coverAspect` (null if unreadable); `removeTripCover` nulls it
- Create: `scripts/backfill-cover-aspect.ts` + `package.json` script `backfill:cover-aspect` (reads each Trip with `coverImageKey` and null `coverAspect`, fetches the first 64KB via storage, `readImageSize`, updates; `--dry-run` flag; operator-run only — do not run it)
- Modify: `components/trip/trip-card.tsx` (+ test), `app/(app)/trips/page.tsx` (select `coverAspect`)

**Interfaces:**
- Consumes: `readImageSize` (Task 3).
- Produces: `isPortrait(aspect: number | null | undefined): boolean` in `lib/cover.ts` (aspect < 0.9). `TripCard` prop `coverAspect?: number | null`. Home countdown (Task 12) reads `coverAspect` too.
- Card layout when portrait and a photo exists: `lg:flex-row`; cover box `lg:w-2/5 lg:aspect-[3/4] lg:h-auto` showing the whole image (`object-contain` on a paper-ink frame, no blur); details `lg:flex-1`. Landscape/route-render/monogram and all phone classes unchanged — export the class strings and assert them.

- [ ] **Step 1: Failing tests.** `setTripCover` with a 300×400 PNG stores `coverAspect: 0.75`; `isPortrait(0.75) === true`, `isPortrait(1.5) === false`, `isPortrait(null) === false`; trip card with `coverAspect: 0.75` + cover has `data-portrait="true"` and the exported `PORTRAIT_CARD_CLASS`; landscape card keeps `CARD_CLASS` exactly.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** + prisma + tsc → PASS.
- [ ] **Step 5: Commit** `feat(trips): portrait covers sit beside the details on desktop` (trailer `Resolves-Feedback: cmuj4l1d9000004l0osapqw3r`).

---

### Task 11: App shell — sidebar ≥1280px, Dock 768–1279px, no top bar ≥768px

**Files:**
- Create: `components/shell/sidebar.tsx` (+ test), `components/shell/sidebar-nav.tsx` (client; active state from `usePathname` + `useSearchParams`), `components/shell/sidebar-footer.tsx`
- Modify: `app/(app)/layout.tsx` (+ `layout.test.tsx`): header gets `md:hidden`; mount `<Sidebar>` (`hidden xl:flex`) and the Dock rail (`hidden md:flex xl:hidden`) — AppRail/TripNav stay the Dock providers but gain `xl:hidden`; sticky offsets become `top-0 h-dvh` at `md`+ because there is no header there
- Modify: `components/app-rail.tsx`, `components/trip/trip-nav.tsx` (+ tests): remove muted Trips/Globe/You duplication? — **keep** them in the Dock (it is the only nav at 768–1279), but sticky offsets change to `md:top-0 md:h-dvh`
- Modify: `app/(app)/trips/[tripId]/layout.tsx`: trip header keeps the bell/people/fork switcher for every non-Home page; Home renders its own header (Task 12), so the layout hides its header on the Home route at `lg`+ via a `data-home` flag the Home page sets, or simpler: move the trip header into a `TripHeader` component rendered by the layout for all routes except `/trips/[id]` exactly (use `usePathname` in a tiny client wrapper). Phone keeps today's header on all routes.
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` `PLAN_ASIDE_CLASS` and any other `top-[calc(3.5rem+…)]` sticky offsets (grep `3.5rem`): at `md`+ there is no header, so offsets are `md:top-6`-style; phones keep theirs
- Help: `lib/help-guide.ts` prose mentioning "header" / "top bar" / "⌘K" updated; `lib/help-guide.test.ts` drift guard stays green

**Interfaces:**
- Sidebar props (server component): `{ user: TravellerLike & { email: string | null }; isAdmin: boolean; pendingAccessRequests: number; trip?: { id: string; name: string } | null; switcher: ReactNode; counts?: ReactNode }` — Task 12 fills `switcher`/`counts`; here render a plain trip-name card placeholder and no counts (the switcher component lands in Task 12a below, i.e. the next task).
- Layout per `docs/specs/2026-09-27-desktop-home.md` §1: 248px, `bg-sun`, `border-r-2 border-border`, `sticky top-0 h-dvh`, padding `py-[22px] px-4`, lockup (`<Logo variant="lockup" />`, 34px) → `/trips`, search slot (Task 13 — render `<CommandPaletteTrigger />` for now), switcher slot, trip nav (Home, Plan, Days, Money, Wishlist, More — reuse `primaryNav`/`moreNav`/`isNavActive`/`isDaysActive` from `trip-nav.tsx`, keep `?plan=` threading), "ALL TRIPS" eyebrow + Trips, Globe; footer: `TravellerAvatar` 36px, display name, "Account" → `/account`, `ThemeToggle` (36px square, white, 2px border); avatar opens the menu (Help, What's new, Admin + badge, Sign out). Outside a Trip: no trip nav; switcher shows "Choose a trip".
- Nav row: 42px, `rounded-xl`, `px-3`, 15px bold; active `bg-coral border-2 border-border shadow-hard-1` + `aria-current="page"`; inactive `border-2 border-transparent hover:border-border`; hit area ≥44px (`py-px` wrapper). `<nav aria-label="Main">`.

- [ ] **Step 1: Failing tests.** `sidebar.test.tsx`: renders one lockup link to `/trips`; inside a trip renders the six trip items in order and marks Plan `aria-current` on `/trips/t1/plan`; keeps `?plan=f1` on Plan and Money hrefs; renders "ALL TRIPS" with Trips and Globe; footer shows display name and an "Account" link; no "Today" item. `layout.test.tsx`: header element has class `md:hidden`; sidebar wrapper has `hidden xl:flex`; Dock has `xl:hidden`. `trip-nav.test.tsx`/`app-rail.test.tsx`: sticky class uses `md:top-0`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the shell tests + `lib/help-guide.test.ts` + tsc → PASS.
- [ ] **Step 5: Commit** `feat(shell): one sidebar on desktop, no top bar from tablet up` (trailer `Resolves-Feedback: cmuhvq385000504jq9szohz3s`).

---

### Task 12: Trip switcher + nav counts

**Files:**
- Create: `components/shell/trip-switcher.tsx` (client, Radix `DropdownMenu`) (+ test)
- Create: `lib/trip-status-line.ts` (+ test)
- Create: `lib/nav-counts.ts` (+ test) — `loadNavCounts(tripId)`: `{ flags: number; wishlist: number }`
- Modify: `components/shell/sidebar.tsx`, `app/(app)/layout.tsx` (load the user's trips for the switcher: id, name, startDate, endDate, current-stop timezone; ordered by `compareForTripList`), trip layout (pass current trip), Dock band: compact switcher pill in the trip header at `md`–`xl` (`xl:hidden`)

**Interfaces:**
- `tripStatusLine({ startDate, endDate, today }): string` → "68 sleeps to go" / "1 sleep to go" / "Today" / "Day 5 of 35" / "Back home" / "No dates yet". Uses `computeTripPhase` and `daysBetween`.
- Flags count: reuse `buildTripNextSteps` inputs? Too heavy for every page — instead reuse the Summary's flag detection entry point (`lib/flags.ts` `detectFlags` or equivalent; grep for the function the summary page calls) with a minimal select; wrap in React `cache()`; render counts inside `<Suspense fallback={null}>` so the nav never waits on them.
- Wishlist count = `db.item.count({ where: { tripId, stopId: null, date: null, forkId: null } })` (confirm the Wishlist predicate against `server/actions/items.ts`'s wishlist query and reuse its `where`).

- [ ] **Step 1: Failing tests.** `tripStatusLine`: start `2026-12-04`, end `2027-01-08` → today `2026-09-27` "68 sleeps to go"; `2026-12-03` "1 sleep to go"; `2026-12-04` "Day 1 of 35"; `2026-12-08` "Day 5 of 35"; `2027-01-09` "Back home"; no dates "No dates yet". Switcher renders the current trip name + line, opens a menu listing other trips, "All trips" → `/trips`, "+ New trip" → `/trips/new`. Counts hidden when 0.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** + tsc → PASS.
- [ ] **Step 5: Commit** `feat(shell): trip switcher and nav counts` (trailer `Resolves-Feedback: cmuhvq385000504jq9szohz3s`).

---

### Task 13: Inline search field

**Files:**
- Create: `components/shell/search-field.tsx` (client) (+ test)
- Refactor: `components/command-palette.tsx` — extract the results model/list into `components/command-palette-results.tsx` (`useCommandResults(query, tripId)` hook returning grouped Go to / Do / Find, and `<CommandResults groups onSelect activeIndex />`), used by both the existing dialog palette and the new field; existing palette tests stay green
- Modify: `components/command-palette-mount.tsx`: ⌘K/Ctrl+K focuses the sidebar field when it is visible (`matchMedia("(min-width: 1280px)")` and the field is mounted — register via a small module-level ref or a `teepee:focus-search` event), else opens the dialog
- Modify: `components/command-palette-trigger.tsx`: remove the `⌘K` kbd chip; tooltip text from `shortcutLabel()` (`⌘K` on Mac via `navigator.platform`/`userAgentData`, else `Ctrl K`)
- Modify: `components/shell/sidebar.tsx` to render `<SearchField tripId={…} />`

**Interfaces:**
- `SearchField`: `<input role="combobox" aria-expanded aria-controls aria-activedescendant placeholder="Search or jump…">` 44px, white, `border-2 border-border rounded-xl`, search icon; focus opens a panel (`role="listbox"`) anchored below (absolute, `z-50`, card styling), showing Go to + Do when empty, Find (debounced, offline message) when typing; ArrowUp/Down move, Enter activates, Esc clears then blurs; click outside closes.
- `shortcutLabel(): "⌘K" | "Ctrl K"` in `lib/shortcut-label.ts` (+ test with mocked navigator).

- [ ] **Step 1: Failing tests.** Focusing the field shows "Go to" and "Do" groups; typing "par" calls the mocked `searchTrip` and shows a Find result; ArrowDown + Enter navigates (`router.push` mock); Esc clears; no element with text "⌘K" in the field; `shortcutLabel` returns "Ctrl K" for Windows UA. Existing `command-palette.test.tsx` passes unchanged.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** + tsc → PASS.
- [ ] **Step 5: Commit** `feat(search): type straight into the sidebar search` (trailer `Resolves-Feedback: cmuhvu6z7000a04la34e6shtu`).

---

### Task 14: Geographic clustering + continents (pure)

**Files:**
- Create: `lib/geo-cluster.ts`, `lib/geo-cluster.test.ts`
- Create: `lib/continents.ts`, `lib/continents.test.ts` (ISO-3166 alpha-2 lowercase → "Europe" | "Asia" | "Africa" | "North America" | "South America" | "Oceania" | "Antarctica"; full table)

**Interfaces:**
```ts
export interface GeoPoint { id: string; lat: number; lng: number; countryCode?: string | null }
/** Single-linkage clusters with a great-circle threshold (default 1500 km). Returns clusters largest-first; ties → the one containing the earliest point in input order. Points without finite lat/lng are ignored. */
export function clusterStops<T extends GeoPoint>(points: T[], thresholdKm?: number): T[][];
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
/** Chip label for a cluster: the country name if every point shares one countryCode, else the continent all share, else "Main route". */
export function clusterLabel(points: GeoPoint[]): string;
export function continentOf(countryCode: string | null | undefined): string | null;
```

- [ ] **Step 1: Failing tests.** Bali + 10 European Stops → largest cluster is the 10 European ones, Bali alone; `clusterLabel` of Paris/Rome/Vienna → "Europe"; all-France → "France"; one Stop → one cluster of one; points with `lat: NaN` ignored; empty input → `[]`; `haversineKm(Sydney, Denpasar)` ≈ 4,500 ± 100.
- [ ] **Step 2–4:** Run → FAIL; implement; run → PASS.
- [ ] **Step 5: Commit** `feat(maps): geographic clustering and continent lookup`.

---

### Task 15: Desktop Home — header, grid, Countdown tile

**Files:**
- Create: `components/trip/home/desktop/home-header.tsx`, `countdown-tile.tsx`, `desktop-home-grid.tsx` (+ tests)
- Create: `lib/countdown.ts` (+ test)
- Modify: `app/(app)/trips/[tripId]/page.tsx`: at `lg`+ render the desktop Home (header + grid) for sketching/planning/final-prep; below `lg` render the existing phase components unchanged (`lg:hidden` wrapper around the phone tree, `hidden lg:flex` around the desktop tree); load the first Transport leg, `coverAspect`, member travellers, unread count
- Modify: trip layout: do not render the layout's trip header on the Home route at `lg`+ (Task 11 left a hook) — the Home header owns h1/bell/people there

**Interfaces:**
- `countdownFor({ startDate, endDate, today }): { kind: "sleeps"; n: number; unit: "sleep" | "sleeps" } | { kind: "today" } | { kind: "day"; n: number; of: number } | { kind: "home" } | { kind: "no-dates" }`.
- `HomeHeader` props: `{ firstName: string; tripName: string; metaLine: string | null; unreadCount: number; recent: …; members: TravellerLike[]; tripId: string; isOwner: boolean }` — meta line `"4 Dec 2026 – 8 Jan 2027 · 35 nights · 11 stops · AUD"` built by `homeMetaLine()` in the same file (test it); bell reuses `NotificationBell` restyled (44px, badge coral pill); people stack 40px `TravellerAvatar`s `-space-x-2.5` linking to settings#travellers; primary button "+ Add a stop" → `/trips/${id}/plan?add=stop` (make the plan page open its add-Stop dialog when `add=stop` is present — find the existing add-Stop trigger in `itinerary-manager.tsx`).
- `DesktopHomeGrid` props: `{ hasCover: boolean; countdown: ReactNode; pot: ReactNode; map: ReactNode; sort: ReactNode }` → `grid grid-cols-12 gap-[18px]` with `grid-rows-[300px_1fr]` / `[200px_1fr]`, spans per spec §3 (8/4 or 6/6; 7/5). Export the class strings.
- `CountdownTile` props: `{ href: string; status: "PLANNING" | "TRAVELLING" | "HOME"; countdown: ReturnType<typeof countdownFor>; firstLeg: string | null; cover: { url: string; aspect: number | null } | null; tripId: string }` — polaroid per spec §4 (`rotate-[4deg]`, `next/image fill sizes="176px"`, "Change" opens the existing cover uploader dialog — find it in `components/trip/trip-cover.tsx` / settings), no-photo variant with dashed "+ Add a photo" pill. Hidden `h2` "Countdown"; number `aria-label="68 sleeps to go"`. "Pick your dates" for `no-dates`.
- First leg string: `"Fri 4 Dec · Sydney → Denpasar, Bali"` via `firstLegLine({ transport, homeName, firstStop })` (test: no leg → first Stop name; no Stops → null).
- Remove from Home desktop: QuickActions, StatTiles, cover band, currency chips. Phone untouched.

- [ ] **Step 1: Failing tests.** `countdownFor` (68 sleeps; 1 sleep; today; day 5 of 35; home; no-dates). `homeMetaLine` exact string above. Grid class with/without cover. CountdownTile renders the polaroid img with `sizes="176px"` when cover, dashed "+ Add a photo" otherwise, links to Plan, and "Pick your dates" for no-dates. Page test: at planning phase the desktop tree has `data-testid="desktop-home"` inside a `hidden lg:flex` wrapper and the phone tree is inside `lg:hidden`; the desktop tree contains no "Add a cost" quick action.
- [ ] **Step 2–4:** Run → FAIL; implement; run + tsc → PASS.
- [ ] **Step 5: Commit** `feat(home): desktop header, grid and countdown tile`.

---

### Task 16: Shared pot, Route map and Sort these out tiles

**Files:**
- Create: `components/trip/home/desktop/shared-pot-tile.tsx`, `route-map-tile.tsx` (client; loads Leaflet like `components/trip/route-map-loader.tsx`), `sort-these-out-tile.tsx` (+ tests)
- Create: `lib/sort-these-out.ts` (+ test)
- Modify: `app/(app)/trips/[tripId]/page.tsx` / a new server loader `lib/desktop-home-loader.ts` that gathers budget totals, next payment, map stops, next steps + reminders (reuse `phase-planning.tsx`'s queries — move them into the loader and have `PhasePlanning` call it too so there is one query path)
- Modify: `app/(app)/trips/[tripId]/loading.tsx`: desktop skeleton per spec §9 using `components/ui/skeletons.tsx` archetypes
- Remove from Home: `RemindersCard` usage on Home (all phases) — Reminders appear only as Sort rows (due within 7 days); keep `RemindersCard` component for the Checklists/Reminders page if used there (grep before deleting anything)

**Interfaces:**
- `SharedPotTile` props `{ href; hasCover: boolean; costTotalMinor; paidTotalMinor; currency; nextPayment: { amountMinor; currency; label; dueDate } | null }`; formats with `formatMoneyCompact` for the total and `formatMoney` (2 decimals) for the next payment; `role="progressbar" aria-label="Paid" aria-valuenow={pct}`; nothing costed → "$0" + "Add your first cost" link, no bar; no payment → "Nothing due". Due line `Due ${formatDayLabel(dueDate)}`.
- `sortTheseOut({ steps: NextStep[]; reminders: ReminderItem[]; today }): { rows: SortRow[]; total: number }` — reminders with `date` within 0..7 days first (tile coral, icon `bell`, subtitle `Due ${formatDayLabel}`), then steps with `kind === "transport"` (sun, `plane`), then the rest in their existing order with tile by step id prefix: packing → teal `list-checks`, pretrip → lilac `clipboard-list`, empty day → pink `calendar`, else stone `circle-alert`; `rows` capped at 4, `total` = all. Empty → one teal row "You're all sorted" / "We'll flag anything new here".
- `RouteMapTile` props `{ stops: Array<{ id; name; lat; lng; countryCode; nights; stopColour: HueName; number: number; nextLine: string }>; tripId }`: `clusterStops` → default view "{clusterLabel} · N stops" chip selected; chips Route (fits main cluster with the route line), cluster, Whole trip; outlying Stops as inset cards bottom-right (click pans); pins 30px numbered, fill via `lib/stop-colours.ts` hex from `lib/map-palette.ts`; `zoomControl:false, scrollWheelZoom:false`; restyled attribution; pin click → `/trips/${tripId}/plan#stop-${id}` (Task 19 makes the hash scroll + highlight). Overlap: after `fitBounds`, compute pixel positions; merge pins closer than 32px into a count pin (e.g. "3") — pure helper `mergeOverlapping(points: {x,y,id}[], minPx)` tested. No Stops → EmptyState "Add your first stop". Tile errors → compact `ErrorPanel` (wrap in an error boundary).

- [ ] **Step 1: Failing tests.** `sortTheseOut` ordering + cap + empty row; SharedPot 2-decimal next payment ("$115.20"), "$0 / Add your first cost", progressbar attributes; RouteMapTile (mock Leaflet like existing `route-map.test.tsx`) renders chip "Europe · 10 stops" and one inset card "Kuta, Bali" for the fixture; `mergeOverlapping` merges two points 10px apart. Page test: planning desktop tree has no `RemindersCard`.
- [ ] **Step 2–4:** Run → FAIL; implement; run + tsc → PASS.
- [ ] **Step 5: Commit** `feat(home): shared pot, route map and "Sort these out" tiles`.

---

### Task 17: Desktop Home — Travelling and Past

**Files:**
- Create: `components/trip/home/desktop/today-tile.tsx`, `spend-so-far-tile.tsx` (+ tests)
- Modify: `app/(app)/trips/[tripId]/page.tsx`, `components/trip/home/phase-travelling.tsx`, `components/trip/home/phase-past.tsx` (+ tests)

**Interfaces:**
- Travelling desktop: `HomeHeader` + grid row 1 `CountdownTile` (status TRAVELLING, `{kind:"day"}`, line = today's Stop) + `SpendSoFarTile` (sun; reuse the Spend so far numbers the travelling phase already computes); row 2 `TodayTile` (today's plan list, next Transport, tonight's stay; `dayTitle` if any — from Task 5) col-span-7 + Day map (existing `DayMapPanel`, expanded, col-span-5); row 3 `TodaysJournal` (Task 7) col-span-12.
- Past desktop: `HomeHeader` + existing wrap-up sections rendered as tiles in the 12-col grid (no new content; status HOME in the countdown tile `{kind:"home"}`).
- Phone trees unchanged (Today's journal already last from Task 7).

- [ ] **Step 1: Failing tests.** Travelling desktop renders, in DOM order, countdown tile with "Day 5 of 35", spend tile, today tile, day map, and `todays-journal` last; Past desktop has the header h1 and "HOME" chip.
- [ ] **Step 2–4:** Run → FAIL; implement; run + tsc → PASS.
- [ ] **Step 5: Commit** `feat(home): desktop Travelling and Past layouts` (trailer `Resolves-Feedback: cmuhvsabe000704jq5oy7qj30`).

---

### Task 18: One card-spacing rule on every Home phase

**Files:**
- Create: `components/trip/home/spacing.ts` exporting `HOME_STACK = "flex flex-col gap-3.5 lg:gap-[18px]"`, `HOME_GRID_GAP = "gap-3.5 lg:gap-[18px]"`
- Modify: `phase-sketching.tsx`, `phase-planning.tsx`, `phase-travelling.tsx`, `phase-past.tsx`, trip Home page cover `mb-2` → consistent (the cover is a stack child, no ad-hoc margin), desktop grid uses `gap-[18px]`
- Create: `components/trip/home/spacing.test.ts` — reads the four phase files + page with `fs` and asserts no `gap-3 `, `gap-6`, `gap-3.5 ` without the paired `lg:gap-[18px]`, or `mb-2` on the cover remain in layout containers (regex over `className="…"` containing `flex-col`/`grid`)

- [ ] **Step 1: Failing test** (the guard). **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the guard + phase tests + tsc → PASS.
- [ ] **Step 5: Commit** `fix(home): one spacing rule between Home cards` (trailer `Resolves-Feedback: cmuhvvx2a000b04la44421ltj`).

---

### Task 19: Stops list in the plan side panel

**Files:**
- Create: `components/trip/plan-stops-nav.tsx` (client) (+ test)
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (render below `PlanOverview` inside `PLAN_ASIDE_CLASS`; pass ordered Stops of the viewed Plan, chapters if enabled, home base), `components/trip/stop-card.tsx` (root gets `id={`stop-${stop.id}`}` and `data-stop-id`, plus `scroll-mt-6`), hash handling: on mount, if `location.hash` matches `#stop-<id>`, scroll + highlight

**Interfaces:**
- `PlanStopsNav` props `{ stops: Array<{ id; name; colourHue: HueName; dateLabel: string /* "10–13 Dec" or "~3 nights" */; chapterId: string | null }>; chapters: Array<{ id; name }> | null; homeBase: { name: string; roundTrip: boolean } | null }`. Click: `document.getElementById("stop-"+id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })`, then add `data-highlight="true"` to the card for 1.6s (CSS ring in `globals.css` using tokens). Scroll-spy: `IntersectionObserver` over `[data-stop-id]`, the topmost intersecting card is active (`aria-current="location"`). `hidden lg:block`. Home base rows are non-interactive labels (or scroll to the Home base card if it has an id — give `HomeBaseCard` `id="home-base-top"`/`"home-base-bottom"`).

- [ ] **Step 1: Failing tests.** Renders Home base, grouped Chapter headings in order, Stop rows with dates / "~3 nights"; clicking a row calls `scrollIntoView` on `#stop-s2` (mock) and sets `data-highlight`; mocked IntersectionObserver callback marks `s3` `aria-current`.
- [ ] **Step 2–4:** Run → FAIL; implement; run + tsc → PASS.
- [ ] **Step 5: Commit** `feat(plan): Stops list in the side panel jumps to each Stop` (trailer `Resolves-Feedback: cmuhvbi4h000004jq6q93wyfx`).

---

### Task 20: Journal on Share links

**Files:**
- Modify: `prisma/schema.prisma` (`ShareLink.includeJournal Boolean @default(false)`), create `prisma/migrations/20260927100006_share_link_include_journal/migration.sql`
- Modify: `server/actions/share.ts` (+ test) create/update accept `includeJournal`; `components/trip/settings/share-links-panel.tsx` (+ test) adds the "Include journal" switch with helper text "Each day's notes and photos, by first name"
- Create: `app/share/[token]/journal-photo/[attachmentId]/route.ts` (+ test)
- Create: `app/share/[token]/journal-section.tsx` (+ test); modify `app/share/[token]/page.tsx` (+ test)

**Interfaces:**
- Photo route: 404 unless: link exists (not revoked) with `includeJournal`; attachment `targetType === "JOURNAL"`, `tripId === link.tripId`; `targetId` (date) is an arrived Trip day (`canWriteJournal` with the Trip's today); the author's `JournalEntry` for that date is not `hiddenFromShares`. Else presigned redirect (same helper as `app/api/attachments/[id]/route.ts`).
- Section "How it's going": arrived days newest first; per day, per author: `travellerFirstName` (display name, no avatar), note, photo (`/share/${token}/journal-photo/${id}`). Entries with `hiddenFromShares` omitted entirely. Only queried when the dial is on (floor stays structural).

- [ ] **Step 1: Failing tests.** Route: dial off → 404; non-JOURNAL attachment (ticket) → 404; hidden entry → 404; future day → 404; happy path → redirect. Page: dial off → no "How it's going"; on → section with "Cam" and note text, no avatar img, hidden entry absent.
- [ ] **Step 2–4:** Run → FAIL; implement; run + prisma + tsc → PASS.
- [ ] **Step 5: Commit** `feat(share): optional "How it's going" Journal section per Share link` (trailer `Resolves-Feedback: cmuhvsabe000704jq5oy7qj30`).

---

### Task 21: Your travels — stats (pure + loader)

**Files:**
- Create: `lib/travel-stats.ts`, `lib/travel-stats.test.ts`
- Create: `lib/travel-stats-loader.ts` (+ test with mocked db)

**Interfaces:**
```ts
export interface TravelTrip { id: string; name: string; startDate: string | null; endDate: string | null; home: { lat: number; lng: number } | null;
  stops: Array<{ id: string; name: string; countryCode: string | null; lat: number | null; lng: number | null; arriveDate: string | null; departDate: string | null }>;
  transports: Array<{ mode: string; depAt: string | null; from: { lat: number; lng: number } | null; to: { lat: number; lng: number } | null }>;
  accommodations: Array<{ checkIn: string; checkOut: string }> }
export interface StatPair { done: number; planned: number }
export interface TravelStats {
  countries: { done: string[]; planned: string[] };   // lowercase codes; planned excludes done
  places: StatPair; trips: StatPair; nightsAway: StatPair; accommodationNights: StatPair;
  transport: Record<"FLIGHT" | "TRAIN" | "BUS" | "FERRY" | "CAR", StatPair>;
  distanceKm: StatPair;
  longestTrip: { tripId: string; name: string; nights: number } | null;
  mostVisitedCountry: { code: string; stops: number } | null;
  farthestFromHome: { stopName: string; km: number } | null;
}
export function computeTravelStats(trips: TravelTrip[], today: string): TravelStats;
```
Rules: a Stop counts as done when `arriveDate <= today`; a Trip done when `startDate <= today`; nights away = sum over trips of nights between start and min(end, today) (done) / remaining (planned); accommodation nights split at today; a Transport done when `depAt` date ≤ today (mode `OTHER` ignored for counts but included in distance); distance = haversine over legs with both endpoints (uses `haversineKm` from Task 14). Rough Stops (no dates) count as planned. Loader: every Trip the user is a `TripMember` of, `REAL_PLAN` only, transports with endpoints resolved to Stop coords or the Trip's Home base (`depIsHome`/`arrIsHome`).

- [ ] **Step 1: Failing tests.** Fixture: one past trip (FR, IT; 1 flight SYD→CDG, 1 train), one current trip (JP, today mid-trip), one future trip (PT) → countries done `["fr","it","jp"]`, planned `["pt"]`; flights done 1; nights split correctly across the current trip; Fork rows never passed (loader test asserts `forkId: null` in every where); empty input → zeros and nulls.
- [ ] **Step 2–4:** Run → FAIL; implement; run + tsc → PASS.
- [ ] **Step 5: Commit** `feat(trips): travel stats across every Trip`.

---

### Task 22: Your travels — map and stats section on /trips

**Files:**
- Create: `components/trips/your-travels.tsx` (server), `components/trips/travel-map.tsx` (client Leaflet; loader like `components/globe/globe-map-loader.tsx` if present), `components/trips/travel-stats-tiles.tsx` (+ tests)
- Modify: `app/(app)/trips/page.tsx` (+ test): section `id="your-travels"` below the cards; a "Your travels ↓" link at the top

**Interfaces:**
- `TravelMap` props `{ trips: Array<{ id; name; dateLabel; when: "past" | "now" | "upcoming"; points: Array<{ lat; lng; name }> }> }`: one polyline + small pins per trip; colour by `when` from `lib/map-palette.ts` (add three named entries there if missing — the only place hex may go); upcoming `dashArray: "6 6"`; click → popup with name, dates, "Home" and "Plan" links; fit bounds to all points; trips with no points omitted; zero trips → the section shows only an empty state "Your trips will appear here once they have places".
- Tiles: countries (flags via regional-indicator emoji from code, with `countryName` as accessible label), places, trips, nights away, accommodation nights, one tile per transport mode with count > 0 (done or planned), distance ("12,340 km"), fun facts line list. Each tile shows "+N planned" when planned > 0.

- [ ] **Step 1: Failing tests.** Section renders the stats from a fixture (e.g. "3 countries", "+1 planned"), hides a Ferry tile at 0/0, map receives only trips with points; page has the jump link to `#your-travels`.
- [ ] **Step 2–4:** Run → FAIL; implement; run + tsc → PASS.
- [ ] **Step 5: Commit** `feat(trips): Your travels — a map of every Trip and fun stats` (trailer `Resolves-Feedback: cmuhw0f0w000a04jqh2r161a9`).

---

### Task 23: Docs and Release notes

**Files:**
- Modify: `docs/adr/0010-adaptive-trip-home.md` (append "Amendment 2026-09-27 — desktop Home tiles": what C/D changed, Reminders only via Sort these out from 7 days out)
- Modify: `docs/adr/0061-playground-hue-ramp-and-rail-shell.md` (append: the interim is resolved — header retired at ≥768px, sidebar at ≥1280px, Dock between)
- Modify: `lib/release-notes.ts` (+ keep `lib/release-notes.test.ts` green): add at the top, `publishedAt` distinct instants `2026-09-27T12:00:00Z` descending by minute, one line each, crediting authors where their note is closed ("— thanks Xanthia" for item photo, portrait covers, Your travels; Cam's notes need no thanks line since Cam is the operator — follow the existing notes' convention):
  - "Desktop now has one sidebar with your trips, search and sections — no more top bar."
  - "Search: just click and type. Results appear right under the box."
  - "Name a day in your plan — like "Sintra day trip" — and it shows everywhere that day does."
  - "Add a photo to any idea or thing to do, so you remember which cathedral you meant — thanks Xanthia."
  - "Set your own profile photo and name in Account."
  - "The Journal opens on day one: one note and one photo each per day, and you can share it on a Share link."
  - "Portrait trip photos now sit beside the trip details on desktop — thanks Xanthia."
  - "The plan's side panel lists every Stop — click one to jump to it."
  - "Your travels: a map of every trip and some fun stats, on the trips page — thanks Xanthia."
  - "A new desktop Home: countdown, shared pot, route map and what to sort out, at a glance."
- Modify: `lib/help-guide.ts` for Day titles, Item photo, Journal rules, Your travels (keep the drift guard green)

- [ ] **Step 1:** Update `lib/release-notes.test.ts` expectations only if it pins counts; run `npx vitest run lib/release-notes.test.ts lib/help-guide.test.ts` → PASS after edits.
- [ ] **Step 2: Commit** `docs: ADR 0010/0061 amendments, release notes and help for the 2026-09-27 lot`.

---

### Task 24: Verification pass

- [ ] **Step 1:** `npm test` (full suite) → all pass; fix any breakage in the owning area (a failing test in an untouched area caused by a shared change is in scope).
- [ ] **Step 2:** `npm run lint` and `npx tsc --noEmit` → clean.
- [ ] **Step 3:** `npx prisma validate` → valid; list the six new migration folders and confirm each is additive (no `DROP`, `RENAME`, `ALTER COLUMN … SET NOT NULL`).
- [ ] **Step 4:** `npm run build` → succeeds (if the build needs env vars absent in the sandbox, record exactly which and stop — do not fabricate values).
- [ ] **Step 5:** `git log --format='%h %s%n%(trailers:key=Resolves-Feedback)' beta..HEAD` → every one of the 10 ids appears at least once.
- [ ] **Step 6:** Commit any fixes as `fix: verification pass for the 2026-09-27 lot`.
