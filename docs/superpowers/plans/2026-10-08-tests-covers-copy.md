# Test speed, small-cover backfill and plain copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the cost of running tests in the build pipeline, give every Trip cover a small copy (new and existing), and remove the copy that reads as generated.

**Architecture:** Vitest `projects` split pure tests (node) from component tests (DOM), with an optional happy-dom switch kept only if it clears a measured bar. A shared server-only cover-save helper serves both cover upload paths; a `sharp`-based helper powers a one-off operator backfill. A parser-based guard test enforces the copy rules, with a shrinking "pending" list that each copy task empties.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching Next APIs), React 19, Vitest 4.1, jsdom 29, happy-dom 20 (trial), Prisma 7, sharp 0.35.4, TypeScript compiler API.

**Spec:** `docs/specs/2026-10-08-test-speed-and-cover-backfill.md` — read it before your task. Parts: 1 = Tasks 1–2, 2 = Tasks 3–4, 3 = Tasks 5–9.

## Global Constraints

- Branch `chore/tests-covers-copy-2026-10-08`. Never commit to `main`. Never deploy. Never run `feedback:*` scripts, the backfill script, or anything against production.
- **Verification tiers (from Task 1 on):** inner loop `npx vitest run <file>`; before reporting a task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Do **not** run full `npm test` or `npm run build` in a task unless the task says so.
- Test pass count before this batch: **8,598 tests in 682 files** (unit suite). No test may be deleted, skipped, or have an assertion weakened, except where a copy change requires the asserted string to change.
- No product code changes in Tasks 1–2.
- Copy house style (Part 3, spec §F): no `—` in Traveller-facing text except a string that is exactly `—`; no "not X, just Y" pivots or self-justifying copy; error toasts "Couldn't <verb> <thing>. Try again." (never "Failed to…", never "Please"); success toasts short with no full stop; everyday nouns lowercase in running text (trip, stop, note, device, traveller, sign-in link, access request); capitals only for screen/feature names seen as a tab or heading (Wishlist, Budget, Journal, Summary, Digest, Compare); "Admin" only for the role; a person speaking is the maintainer as "I", never "we"/"the Admin"; elsewhere the app speaks impersonally.
- On-screen labels (CONTEXT.md): Fork → "What-if plan", Promote → "Make this the real plan", "Real plan" unchanged. Code identifiers, routes, models and file names are NOT renamed.
- Cover small copy: WebP, fits 480 px on the longest side, never enlarged, quality 82, GIFs skipped. Server accepts a small copy only if declared `image/webp`, `0 < size ≤ 512 KB`, and bytes start `RIFF....WEBP`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. A `.ts` test that silently depended on jsdom globals but now passes vacuously under node (e.g. a `typeof window === "undefined"` branch) — Task 1 compares per-file test counts and pass states between the before/after JSON reports, not only totals.
2. New Trip with a GIF cover, or a browser that can't make the small copy, or a small copy whose bytes aren't WebP — the trip is still created with its large cover and `coverSmallKey` null (Task 3 tests).
3. Backfill on a cover whose blob is missing, corrupt, a GIF, or an EXIF-rotated portrait JPEG — counted failed/skipped/made correctly, and the aspect is the *displayed* (rotated) one (Task 4 tests).
4. Backfill re-run, or a crash between blob save and row update — re-run picks the row up again and overwrites the same key; no row ever holds a `coverSmallKey` whose blob wasn't saved (Task 4 tests).
5. Copy edits breaking exact-string tests, the help guide's on-screen label checks (`lib/help-guide.ts` `GUIDE_UI_STRINGS`/`GUIDE_NAV_LABELS`), or the promote confirm's typed-name gate — each copy task runs `vitest related` on every file it touched, and Task 6 tests the renamed confirm end to end.

---

### Task 1: Node environment for pure tests + verification tiers

**Files:**
- Modify: `vitest.config.ts`
- Modify: `test/setup.ts`
- Modify (add docblock only): `lib/feedback-queue.test.ts`, `lib/offline-status.test.ts`, `lib/scroll-to.test.ts`, `lib/share-url.test.ts`, `lib/standalone.test.ts`, `components/account/device-state.test.ts`, `components/account/push-subscribe.test.ts`, `components/plan/use-drag-dismiss.test.ts`, `components/ui/scroll-edges.test.ts`, `scripts/layout-audit/capture.test.ts`, `scripts/layout-audit/collector.test.ts`, `lib/new-trip/arrival.test.ts`, `lib/plan/day-collapse.test.ts`, `test/helpers/containing-block.test.ts`
- Modify: `CLAUDE.md` (add a section; do not touch the auto-generated Next.js block at the end)
- Modify: `docs/open-follow-ups.md` (one dated line under the 2026-10-08 heading you add: before/after timings)

**Interfaces:**
- Produces: Vitest projects named `node` (`**/*.test.ts`) and `dom` (`**/*.test.tsx`). Task 2 changes only the `dom` project's `environment`.

- [ ] **Step 1: Record the baseline.** Run the full suite once with a JSON report (this task is allowed to):

```bash
S=$(mktemp -d); start=$(date +%s); TZ=UTC npx vitest run --reporter=json --outputFile=$S/before.json > /dev/null 2>&1; echo "before: $(( $(date +%s)-start ))s"; echo $S
```
Expected: exit 0, 8,598 tests passing. Note the seconds.

- [ ] **Step 2: Make `test/setup.ts` environment-aware.** Keep `import '@testing-library/jest-dom'` and the `afterAll` timer drain at top level. Wrap every statement that touches `window`/`document`/`HTMLElement` (the `matchMedia` default, the pointer-capture/scrollIntoView stubs, `window.Image = StubImage`) in a single `if (typeof window !== 'undefined') { … }` block. `setMatchMedia` and `setImageLoadResult` stay exported top-level functions (they read `window` only when called). Add one comment line above the block: `// DOM-only stubs: the node project (pure .ts tests) has no window.`

- [ ] **Step 3: Split into projects** in `vitest.config.ts`. Replace the `test` block with:

```ts
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    exclude: ['node_modules', '.next', 'test/integration/**'],
    // Spec 2026-10-08 §B: pure tests skip the DOM's per-file startup cost.
    // A .ts test that needs a DOM opts in with `// @vitest-environment jsdom`.
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: ['**/*.test.ts'] } },
      { extends: true, test: { name: 'dom', environment: 'jsdom', include: ['**/*.test.tsx'] } },
    ],
  },
```
Keep the plugins/resolve blocks and the React Compiler comment as they are.

- [ ] **Step 4: Add `// @vitest-environment jsdom`** as the very first line of each of the 14 `.ts` test files listed under Files.

- [ ] **Step 5: Run the full suite and compare per file.**

```bash
start=$(date +%s); TZ=UTC npx vitest run --reporter=json --outputFile=$S/after.json > /dev/null 2>&1; echo "after: $(( $(date +%s)-start ))s"
node -e '
const a=require(process.argv[1]),b=require(process.argv[2]);
const m=r=>Object.fromEntries(r.testResults.map(t=>[t.name,t.assertionResults.map(x=>x.fullName+":"+x.status).sort().join("|")]));
const A=m(a),B=m(b);let d=0;for(const k of new Set([...Object.keys(A),...Object.keys(B)]))if(A[k]!==B[k]){d++;console.log("DIFF",k)}
console.log("totals",a.numPassedTests,b.numPassedTests,"files differing",d)' $S/before.json $S/after.json
```
Expected: `totals 8598 8598 files differing 0`. If any `.ts` file now fails with `window`/`document`/`navigator`/`localStorage`/`sessionStorage` not defined, add the docblock to it too and rerun. If a file passes but differs, investigate (Review Focus 1).

- [ ] **Step 6: Confirm `vitest related` works across projects:**

```bash
npx vitest related --run lib/cover.ts
```
Expected: runs `lib/cover.test.ts` (node) and component tests that import `lib/cover` (dom), all pass.

- [ ] **Step 7: Add the tiers to `CLAUDE.md`**, as a new section placed directly after the "Once I say go…" pipeline paragraph:

```markdown
## Verification tiers

Plans and subagents verify at three tiers. The full suite and `next build`
never run per task.

| When | Run |
|---|---|
| Inner loop (red/green on a task) | `npx vitest run <the test file(s) being worked>` |
| Task done (implementer self-check, spec review, quality review) | `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>` |
| Once per branch, before the batch is reported finished | `npm test` + `npm run build` + `npm run test:integration` (when the local DB is up) |

Plans written by superpowers:writing-plans use these commands in their
verification steps. CI still runs the full suite and build on every push.
```

- [ ] **Step 8: Record timings** in `docs/open-follow-ups.md`: add a `## 2026-10-08 · Tests, covers, copy` heading at the end (if absent) with a bullet `Test split (spec 2026-10-08 §B): full suite <before>s → <after>s on a 12-core machine.`

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts test/setup.ts CLAUDE.md docs/open-follow-ups.md $(git diff --name-only -- '*.test.ts')
git commit -m "perf(test): run pure tests on node; verification tiers"
```

---

### Task 2: happy-dom trial (keep or drop by the spec's rule)

**Files:**
- Modify: `package.json` / `package-lock.json` (devDependency `happy-dom`, exact version)
- Modify: `vitest.config.ts` (dom project environment), `test/setup.ts` (only if polyfills are needed)
- Modify: up to 15 `.tsx` test files (small mechanical edits) and up to 20 docblock opt-outs
- Modify: `docs/open-follow-ups.md` (result line); if dropped, Create: `docs/adr/0071-component-tests-stay-on-jsdom.md`

**Interfaces:**
- Consumes: Task 1's `dom` project.

- [ ] **Step 1: Baseline the dom project on jsdom:**

```bash
start=$(date +%s); TZ=UTC npx vitest run --project dom > /dev/null 2>&1; echo "dom/jsdom: $(( $(date +%s)-start ))s"
```

- [ ] **Step 2: Install and switch.** `npm i -D -E happy-dom@20.14.5`. In `vitest.config.ts` set the dom project's `environment: 'happy-dom'`.

- [ ] **Step 3: Run and triage.**

```bash
TZ=UTC npx vitest run --project dom 2>&1 | tail -40
```
For each failing file decide, in this order: (a) a shared polyfill in `test/setup.ts`'s DOM block fixes many files → add it; (b) a small mechanical edit to that test file (query, `await`, timing) with no weakened assertion → edit, count it; (c) otherwise add `// @vitest-environment jsdom` as line 1 → count it as opted back. Never edit product code.

- [ ] **Step 4: Measure and apply the rule.**

```bash
start=$(date +%s); TZ=UTC npx vitest run --project dom > /dev/null 2>&1; echo "dom/happy-dom: $(( $(date +%s)-start ))s"
```
**Keep** only if: happy-dom time ≤ 0.7 × Step 1 time, ≤ 15 test files edited (b), ≤ 20 files opted back (c), dom project fully green with the same test count as Step 1.

- [ ] **Step 5a (keep):** add a comment above the dom project naming the rule and the measured times; add a bullet in `docs/open-follow-ups.md` under the 2026-10-08 heading: `happy-dom kept: dom project <x>s → <y>s; <n> files edited, <m> on jsdom.` Run the full suite once (`npm test`) — 8,598 passing.

- [ ] **Step 5b (drop):** `git checkout -- . && npm i` to revert every trial change (confirm `git status` clean apart from untracked notes). Write `docs/adr/0071-component-tests-stay-on-jsdom.md` (ADR format of `docs/adr/0070-*.md`): context (spec §C), the measured times, file counts, the top three failure kinds, decision: stay on jsdom. Add the open-follow-ups bullet `happy-dom dropped (ADR 0071): …`.

- [ ] **Step 6: Commit** — `perf(test): component tests on happy-dom` or `docs(adr): 0071 component tests stay on jsdom`.

---

### Task 3: Shared cover save; New Trip saves a small copy and aspect

**Files:**
- Create: `lib/cover-save.ts`, `lib/cover-save.test.ts`
- Modify: `server/actions/cover.ts` (use the helper), `server/actions/cover.test.ts` (must stay green unchanged except imports if any)
- Modify: `server/actions/trips.ts:39-43,139-153` (`createTrip` signature + cover block), its test file (`server/actions/trips.test.ts` or the file that tests `createTrip` — find with `grep -ln "createTrip" server/actions/*.test.ts`)
- Modify: `components/new-trip/new-trip-flow.tsx:221-224`, `components/new-trip/new-trip-flow.test.tsx`

**Interfaces:**
- Produces (`lib/cover-save.ts`, first line `import "server-only";`):
  - `export const MAX_SMALL_COVER_BYTES = 512 * 1024;`
  - `export function isWebpBytes(bytes: Buffer): boolean`
  - `export async function acceptSmallCover(entry: unknown): Promise<Buffer | null>` — `File`, type `image/webp`, `0 < size ≤ MAX`, WebP magic; else null.
  - `export function coverExt(mime: string): "png" | "webp" | "gif" | "jpg"`
  - `export function coverAspectOf(bytes: Buffer): number | null` — `readImageSize` width/height.
  - `export async function saveCoverFiles(opts: { tripId: string; bytes: Buffer; mime: string; small: Buffer | null; route: string }): Promise<{ key: string; smallKey: string | null }>` — saves the large blob (throws on failure), then the small at `coverSmallKeyFor(key)` best-effort (`reportError` with `route`, `smallKey` null on failure).
- `createTrip(input: CreateTripInput, coverFile?: File | null, coverSmallFile?: File | null): Promise<CreateTripResult>`

- [ ] **Step 1: Write failing tests for `lib/cover-save.ts`** (mock `@/lib/storage` `getStorage` and `@/lib/error-sink` `reportError` as `server/actions/cover.test.ts` does):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const save = vi.fn();
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ save }), generateKey: (_s: unknown, id: string, name: string) => `trips/t1/${id}/${name}` }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
import { acceptSmallCover, saveCoverFiles, coverExt, isWebpBytes } from "./cover-save";

const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
const file = (b: Buffer, type: string) => new File([b], "x", { type });

beforeEach(() => save.mockReset());

describe("acceptSmallCover", () => {
  it("accepts a real small WebP", async () => expect(await acceptSmallCover(file(webp, "image/webp"))).toEqual(webp));
  it("rejects a non-WebP body declared as WebP", async () => expect(await acceptSmallCover(file(Buffer.from("GIF89a-----------"), "image/webp"))).toBeNull());
  it("rejects a non-webp type, empty, oversize and non-File", async () => {
    expect(await acceptSmallCover(file(webp, "image/png"))).toBeNull();
    expect(await acceptSmallCover(file(Buffer.alloc(0), "image/webp"))).toBeNull();
    expect(await acceptSmallCover(file(Buffer.concat([webp, Buffer.alloc(512 * 1024)]), "image/webp"))).toBeNull();
    expect(await acceptSmallCover("nope")).toBeNull();
  });
});

describe("saveCoverFiles", () => {
  it("saves large then small and returns both keys", async () => {
    const r = await saveCoverFiles({ tripId: "t1", bytes: Buffer.from("x"), mime: "image/jpeg", small: webp, route: "r" });
    expect(r.key).toMatch(/cover\.jpg$/);
    expect(r.smallKey).toBe(`${r.key}-sm`);
    expect(save.mock.calls.map((c) => c[0])).toEqual([r.key, r.smallKey]);
  });
  it("throws when the large save fails and never saves the small", async () => {
    save.mockRejectedValueOnce(new Error("down"));
    await expect(saveCoverFiles({ tripId: "t1", bytes: Buffer.from("x"), mime: "image/png", small: webp, route: "r" })).rejects.toThrow();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("returns smallKey null when only the small save fails", async () => {
    save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("down"));
    expect((await saveCoverFiles({ tripId: "t1", bytes: Buffer.from("x"), mime: "image/png", small: webp, route: "r" })).smallKey).toBeNull();
  });
});

it("coverExt / isWebpBytes", () => {
  expect([coverExt("image/png"), coverExt("image/webp"), coverExt("image/gif"), coverExt("image/jpeg")]).toEqual(["png", "webp", "gif", "jpg"]);
  expect(isWebpBytes(webp)).toBe(true);
  expect(isWebpBytes(Buffer.from("RIFF"))).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run lib/cover-save.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `lib/cover-save.ts`** by moving `MAX_SMALL_COVER_BYTES`, `isWebpBytes`, the ext ternary, the large/small save block and the aspect computation out of `server/actions/cover.ts` (keep their comments). `saveCoverFiles` generates the key with `generateKey({ trip: tripId }, crypto.randomUUID(), \`cover.${coverExt(mime)}\`)`.

- [ ] **Step 4: Refactor `setTripCover`** to call `acceptSmallCover(formData.get("fileSmall"))`, `saveCoverFiles(...)` (catch → existing reportError + error result), `coverAspectOf(bytes)`. Behaviour identical. Run `npx vitest run lib/cover-save.test.ts server/actions/cover.test.ts` — PASS.

- [ ] **Step 5: Failing tests for `createTrip`** in its test file: (a) with a JPEG `coverFile` and a valid WebP `coverSmallFile` → `db.trip.update` called with `{ coverImageKey, coverSmallKey: \`${coverImageKey}-sm\`, coverAspect: <number from a real 2×1 PNG/JPEG header fixture> }` and `checkQuota` called with `size: large + small`; (b) GIF cover, no small → `coverSmallKey: null`, trip created; (c) small with non-WebP bytes → `coverSmallKey: null`; (d) `checkQuota` returns `{ ok: false }` → no storage save, trip still created (`success: true`); (e) large save throws → trip still created, no cover update. Use the existing mocks style in that file.

- [ ] **Step 6: Implement** in `createTrip`: new third param; in the cover block, `const small = await acceptSmallCover(coverSmallFile)`; `checkQuota({ tripId: null, size: coverFile.size + (small?.length ?? 0) })` — skip the cover silently if not ok; `saveCoverFiles({ tripId: trip.id, bytes, mime: coverFile.type, small, route: "server/actions/trips.ts#createTrip" })`; then `db.trip.update({ where: { id: trip.id }, data: { coverImageKey: key, coverSmallKey: smallKey, coverAspect: coverAspectOf(bytes) } })`. Keep the swallow-and-continue `try/catch`.

- [ ] **Step 7: Client.** In `new-trip-flow.tsx` replace the single compress with:

```ts
      const [file, small] = cover?.file
        ? await Promise.all([compressImage(cover.file), compressCoverSmall(cover.file)])
        : [null, null];
```
and pass `small` as the third argument to `createTrip`. Import `compressCoverSmall` beside `compressImage`. In `new-trip-flow.test.tsx` add a test that with a cover chosen, `createTrip` is called with a third argument (mock `compressCoverSmall` to return a `File`), and one where it resolves `null` and `createTrip`'s third argument is `null`.

- [ ] **Step 8: Verify (task tier)** `npx vitest related --run lib/cover-save.ts server/actions/cover.ts server/actions/trips.ts components/new-trip/new-trip-flow.tsx && npx tsc --noEmit && npx eslint lib/cover-save.ts server/actions/cover.ts server/actions/trips.ts components/new-trip/new-trip-flow.tsx`

- [ ] **Step 9: Commit** `feat(cover): New Trip saves a small copy and aspect; shared cover save`

---

### Task 4: `sharp` resizer and the backfill script

**Files:**
- Modify: `package.json` (`"sharp": "0.35.4"` in devDependencies; script `"backfill:cover-small": "tsx --conditions=react-server scripts/backfill-cover-small.ts"`)
- Create: `lib/cover-small-image.ts`, `lib/cover-small-image.test.ts`
- Create: `scripts/backfill-cover-small.ts`, `scripts/backfill-cover-small-run.ts`, `scripts/backfill-cover-small-run.test.ts`
- Modify: `docs/open-follow-ups.md` (PX-01 entry, at `## 2026-10-06 · Performance and UX batch`)

**Interfaces:**
- Produces:
  - `lib/cover-small-image.ts`: `export async function makeCoverSmall(bytes: Buffer): Promise<{ webp: Buffer; width: number; height: number } | null>` — null for GIF (`GIF8` magic) or undecodable input; `width/height` are the **displayed** (EXIF-rotated) dimensions of the original. Constants `COVER_SMALL_WIDTH` (from `lib/cover.ts`, 480) and quality 82.
  - `scripts/backfill-cover-small-run.ts`: `export async function backfillCoverSmall(deps: { db: Pick<typeof import("../lib/db").db, "trip">; storage: Pick<Storage, "read" | "save">; dryRun: boolean; log: (s: string) => void }): Promise<{ scanned: number; made: number; skipped: number; failed: number }>`

- [ ] **Step 1: Add sharp** `npm i -D -E sharp@0.35.4`; confirm `npm ls sharp` shows one deduped 0.35.4.

- [ ] **Step 2: Failing tests for `makeCoverSmall`.** Build fixtures in the test with sharp itself (no binary files committed):

```ts
import sharp from "sharp";
import { makeCoverSmall } from "./cover-small-image";

const jpeg = (w: number, h: number, orientation?: number) => {
  const s = sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } }).jpeg();
  return (orientation ? s.withMetadata({ orientation }) : s).toBuffer();
};

it("fits a landscape inside 480 wide as WebP", async () => {
  const r = (await makeCoverSmall(await jpeg(2000, 1000)))!;
  const m = await sharp(r.webp).metadata();
  expect([m.format, m.width, m.height]).toEqual(["webp", 480, 240]);
  expect([r.width, r.height]).toEqual([2000, 1000]);
});
it("applies EXIF rotation (orientation 6 = portrait on screen)", async () => {
  const r = (await makeCoverSmall(await jpeg(1200, 800, 6)))!;
  const m = await sharp(r.webp).metadata();
  expect([m.width, m.height]).toEqual([320, 480]);
  expect([r.width, r.height]).toEqual([800, 1200]);
});
it("never enlarges", async () => {
  const m = await sharp((await makeCoverSmall(await jpeg(300, 200)))!.webp).metadata();
  expect([m.width, m.height]).toEqual([300, 200]);
});
it("skips GIFs and garbage", async () => {
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
  expect(await makeCoverSmall(gif)).toBeNull();
  expect(await makeCoverSmall(Buffer.from("not an image"))).toBeNull();
});
```
Run — FAIL.

- [ ] **Step 3: Implement**

```ts
import sharp from "sharp";
import { COVER_SMALL_WIDTH } from "./cover";

/** Spec 2026-10-08 §E: the operator backfill's twin of lib/image-compress.ts compressCoverSmall. */
const QUALITY = 82;

export async function makeCoverSmall(bytes: Buffer): Promise<{ webp: Buffer; width: number; height: number } | null> {
  if (bytes.subarray(0, 4).toString("latin1") === "GIF8") return null;
  try {
    const img = sharp(bytes).rotate();
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return null;
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    const webp = await img
      .resize({ width: COVER_SMALL_WIDTH, height: COVER_SMALL_WIDTH, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    return { webp, width, height };
  } catch {
    return null;
  }
}
```
Run — PASS.

- [ ] **Step 4: Failing tests for `backfillCoverSmall`** with an in-memory fake db (`findMany` returning rows `{ id, coverImageKey, coverAspect }`, `update` recording calls) and fake storage (`read` from a Map, `save` recording, optionally rejecting). Cases: (a) JPEG row with `coverAspect: null` → `save` at `${key}-sm` with `image/webp` **before** `update({ where:{id}, data:{ coverSmallKey: `${key}-sm`, coverAspect: w/h } })`; (b) row with existing aspect → update data has no `coverAspect` key; (c) GIF → skipped, no save/update; (d) missing blob → failed; (e) garbage bytes → failed; (f) `save` rejects → failed, **no update**; (g) `dryRun` → no save, no update, counted as made; (h) `findMany` is called with `where: { coverImageKey: { not: null }, coverSmallKey: null }`; (i) returned counts match. Assert ordering with a shared call log array.

- [ ] **Step 5: Implement `scripts/backfill-cover-small-run.ts`** (loop as in `scripts/backfill-cover-aspect.ts`, using `makeCoverSmall`, `coverSmallKeyFor`; save first then update; per-row `log` lines; never throw out of the loop for a single row). Run tests — PASS.

- [ ] **Step 6: Entry script `scripts/backfill-cover-small.ts`** — header doc modelled on `backfill-cover-aspect.ts` (run command, what it does, idempotent, `--dry-run`, operator-run only, needs production storage + DB env, dry run first). Body:

```ts
import { db } from "../lib/db";
import { getStorage } from "../lib/storage";
import { backfillCoverSmall } from "./backfill-cover-small-run";

const dryRun = process.argv.includes("--dry-run");
backfillCoverSmall({ db, storage: getStorage(), dryRun, log: (s) => console.log(s) })
  .then((r) => {
    console.log(`\n=== Summary ===\n  trips: scanned=${r.scanned} made=${r.made} skipped=${r.skipped} failed=${r.failed}`);
    if (dryRun) console.log("\n(dry-run: nothing was written)");
  })
  .catch((err) => { console.error("Fatal error:", err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
```
Smoke-check locally only if the docker DB is up: `npm run backfill:cover-small -- --dry-run` (local DB, never production).

- [ ] **Step 7: Docs.** Update PX-01 in `docs/open-follow-ups.md`: the script exists (`npm run backfill:cover-small [-- --dry-run]`), New Trip now sends a small copy (Task 3), and Cam runs the script once against production after deploy, dry run first, recording the date and counts here.

- [ ] **Step 8: Verify (task tier)** `npx vitest related --run lib/cover-small-image.ts scripts/backfill-cover-small-run.ts && npx tsc --noEmit && npx eslint lib/cover-small-image.ts scripts/backfill-cover-small*.ts`

- [ ] **Step 9: Commit** `feat(cover): backfill script for small cover copies (PX-01)`

---

### Task 5: Copy guard test with a pending list

**Files:**
- Create: `test/helpers/copy-scan.ts`, `test/helpers/copy-scan.test.ts`, `test/copy-style.test.ts`

**Interfaces:**
- Produces:
  - `export type CopyViolation = { file: string; line: number; text: string; rule: "em-dash" | "failed-to" | "please-try-again" }`
  - `export function scanSource(file: string, source: string): CopyViolation[]`
  - `export function copyScanFiles(root: string): string[]` — every non-test, non-`.d.ts` `.ts`/`.tsx` under `app/`, `components/`, `server/`, plus `lib/release-notes.ts`, `lib/help-guide.ts`, `lib/mail.ts`, `lib/approval-email.ts`, `lib/push.ts`, `lib/admin-notify.ts`, and every non-test `lib/digest*.ts`. Paths repo-relative with `/`.
  - In `test/copy-style.test.ts`: `const ALLOWLIST: { file: string; includes: string; reason: string }[]` and `const PENDING = new Set<string>([...])`. Tasks 6–9 remove files from `PENDING`; Task 9 deletes it.

- [ ] **Step 1: Failing unit tests for `scanSource`:**

```ts
import { scanSource } from "./copy-scan";
const v = (src: string) => scanSource("x.tsx", src).map((x) => x.rule);

it("flags em-dashes in strings, templates and JSX text", () => {
  expect(v(`const a = "one — two";`)).toEqual(["em-dash"]);
  expect(v("const a = `x — ${b} — y`;")).toEqual(["em-dash", "em-dash"]);
  expect(v(`const C = () => <p>Hello — there</p>;`)).toEqual(["em-dash"]);
});
it("allows a lone em-dash placeholder", () => expect(v(`const C = () => <td>{"—"}</td>; const d = "—";`)).toEqual([]));
it("ignores comments, imports, directives, console and reportError context", () => {
  expect(v(`"use client";\n// a — b\n/* c — d */\nimport x from "a—b";\nconsole.warn("x — y");\nreportError(e, { route: "a — b", source: "server" });`)).toEqual([]);
});
it("flags Failed to and Please try again", () => {
  expect(v(`toast.error("Failed to reorder stops.")`)).toEqual(["failed-to"]);
  expect(v(`const e = "Upload failed. Please try again.";`)).toEqual(["please-try-again"]);
});
it("reports line numbers", () => expect(scanSource("x.ts", `\n\nconst a = "a — b";`)[0].line).toBe(3));
```
Run `npx vitest run test/helpers/copy-scan.test.ts` — FAIL.

- [ ] **Step 2: Implement `test/helpers/copy-scan.ts`** with the TypeScript compiler API: `ts.createSourceFile(file, source, Latest, true, file.endsWith("x") ? TSX : TS)`; visit nodes; collect text from `StringLiteral`, `NoSubstitutionTemplateLiteral`, `TemplateHead/Middle/Tail`, `JsxText` (trimmed); skip a node whose ancestor is an `ImportDeclaration`/`ExportDeclaration`/`ImportTypeNode`, an `ExpressionStatement` directive (`"use client"`/`"use server"` as the first statements), a `CallExpression` whose callee is `console.<x>`, or a `PropertyAssignment` named `route` or `source`. Rules: `text.includes("—") && text.trim() !== "—"` → em-dash; `/\bFailed to\b/` → failed-to; `/please try again/i` → please-try-again. `copyScanFiles` walks with `fs.readdirSync(..., { recursive: true })`. Run — PASS.

- [ ] **Step 3: Write `test/copy-style.test.ts`:**

```ts
import fs from "node:fs";
import path from "node:path";
import { copyScanFiles, scanSource } from "./helpers/copy-scan";

/** Spec 2026-10-08 §K. Each entry needs a reason a reviewer would accept. */
const ALLOWLIST: { file: string; includes: string; reason: string }[] = [];

/** Files not yet brought to the house style (spec §F). Tasks remove their files; the list must end empty and be deleted. */
const PENDING = new Set<string>([
  /* filled in Step 4 */
]);

const root = path.resolve(__dirname, "..");
const violations = copyScanFiles(root).flatMap((f) => scanSource(f, fs.readFileSync(path.join(root, f), "utf8")))
  .filter((v) => !ALLOWLIST.some((a) => a.file === v.file && v.text.includes(a.includes)));

it("Traveller-facing copy has no em-dashes, 'Failed to' or 'Please try again'", () => {
  const live = violations.filter((v) => !PENDING.has(v.file));
  expect(live.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`)).toEqual([]);
});

it("every pending file still has something to fix (remove clean files from PENDING)", () => {
  const dirty = new Set(violations.map((v) => v.file));
  expect([...PENDING].filter((f) => !dirty.has(f))).toEqual([]);
});
```

- [ ] **Step 4: Fill `PENDING`** with every file that currently has a violation (print them once with a throwaway `console.log([...new Set(violations.map(v=>v.file))].sort())`, paste sorted, remove the log). For any hit that is genuinely not Traveller-facing (e.g. a developer-only `throw new Error` never shown, a CSS/regex string), prefer an `ALLOWLIST` entry with a reason over leaving it pending. Run `npx vitest run test/copy-style.test.ts test/helpers/copy-scan.test.ts` — PASS.

- [ ] **Step 5: Commit** `test(copy): guard against em-dashes and stock error phrasing`

---

### Task 6: Plan variants on screen + release note

**Files:**
- Modify: Traveller-facing strings in `components/trip/promote-fork-dialog.tsx`, `components/trip/compare-table.tsx`, `components/trip/fork-switcher.tsx`, `components/trip/variant-banner.tsx`, `app/(app)/trips/[tripId]/compare/page.tsx`, `server/actions/forks.ts`, the Activity feed's fork lines (find with `grep -rn -i "fork\|promot" lib/activity*.ts components/**/activity*.tsx`), trip settings' plan-variants toggle label/help (`components/trip/settings/*`), `components/trip/help-guide.tsx` and `lib/help-guide.ts` (variant sections and label lists), `lib/demo/eu-trip.ts` if it renders fork names/labels; plus their tests.
- Modify: `lib/release-notes.ts` (new top entry), `test/copy-style.test.ts` (remove files you made clean from `PENDING`)

**Interfaces:** none new. Identifiers (`Fork`, `promoteFork`, `/compare` route, `fork-switcher.tsx`) stay.

- [ ] **Step 1: Find every visible occurrence:** `grep -rn -i -E "\bforks?\b|promot|committed|losses" --include=*.tsx --include=*.ts app components server lib | grep -v "\.test\."` and keep only string/JSX text a Traveller sees (labels, titles, aria-labels, toasts, error results, activity text, help text).

- [ ] **Step 2: Update tests first** for the strings you will change (the dialog, compare table, switcher, banner, compare page, activity text, help guide label checks) to assert the new wording. Run them — FAIL.

- [ ] **Step 3: Rewrite** to: "What-if plan" / "what-if plans" (a new one: "New what-if plan"); "Make this the real plan" (button and action menu); confirm title `Make "<name>" your real plan?`; loss list intro `Booked and paid things in your current plan will be removed:`; typed gate `Type <name> to confirm`; toast `Couldn't make this the real plan. Try again.`; compare empty state in plain words (e.g. "Make a what-if plan to compare another way of doing this trip."); "Real plan" unchanged. Apply house style (no `—`) to every string in these files.

- [ ] **Step 4: Release note** at the top of `RELEASE_NOTES` (`publishedAt` = now, ISO, UTC): `Plan variants are now called what-if plans. Pick one with Make this the real plan.`

- [ ] **Step 5: Verify (task tier)** — `npx vitest related --run <every source file changed>` + `npx vitest run test/copy-style.test.ts` + `npx tsc --noEmit` + `npx eslint <changed files>`. Include a test that the promote confirm stays disabled until the exact name is typed and enabled after.

- [ ] **Step 6: Commit** `copy(plan): what-if plans and Make this the real plan`

---

### Task 7: Privacy, Terms, sign-in, and the maintainer's voice

**Files:**
- Modify: `app/privacy/page.tsx`, `app/privacy/page.test.tsx`, `app/terms/page.tsx`, `app/terms/page.test.tsx`, `app/landing/sign-in-panel.tsx` (+ its test), Welcome (`grep -rln "welcome-dialog" components`), `components/feedback/feedback-launcher.tsx`, the help guide's feedback lines, access-request strings (`server/actions/access-requests.ts`, sign-in/request components), `components/account/devices-panel.tsx` (line ~177 status line), and any other file where a person speaks as "we/us/our" or "the Admin" to a Traveller (`grep -rn -E "\b(we|We|we'll|We'll|we've|We've|us|our)\b" --include=*.tsx app components | grep -v "\.test\."`, judging each).
- Modify: `test/copy-style.test.ts` (remove cleaned files from `PENDING`)

- [ ] **Step 1: Read** spec §F and §H. List every fact the Privacy and Terms pages state (what is collected, where it is kept, retention, who can see it, deletion, analytics, Speed Insights). That fact list is the bar: none may be lost or changed.

- [ ] **Step 2: Update tests first** — privacy/terms tests keep asserting each fact (adjust exact strings to the new wording), plus a test that the sign-in denial renders the short message. Run — FAIL where strings changed.

- [ ] **Step 3: Rewrite.** Privacy and Terms: first person ("I run Teepee for a small group of friends and family…"), plain statements, no "not a…/just…" framing, no `—`, lowercase everyday nouns, "Admin" only as a role name. Sign-in denial: `You don't have access yet. I've been told you tried. If someone invited you, ask them to check.` Devices status line: one point (e.g. `Removed. If that device still has permission, it comes back next time it opens.`). Welcome/feedback/access-request voice: "I", consistently.

- [ ] **Step 4: Verify (task tier)** on every changed file + `npx vitest run test/copy-style.test.ts`.

- [ ] **Step 5: Commit** `copy: privacy, terms and sign-in in plain first person`

---

### Task 8: Help guide pass

**Files:**
- Modify: `components/trip/help-guide.tsx`, `lib/help-guide.ts`, `components/trip/help-legend.tsx`, their tests (`components/trip/help-guide.test.tsx`, `lib/help-guide.test.ts`)
- Modify: `test/copy-style.test.ts` (remove these from `PENDING`)

- [ ] **Step 1:** Run `npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx` to see the current label/on-screen checks; read how `GUIDE_UI_STRINGS` and `GUIDE_NAV_LABELS` tie guide text to real UI strings, so renamed text stays matched.

- [ ] **Step 2: Rewrite** every em-dash (`**Title** — explanation` → `**Title**: explanation`; mid-sentence dashes → full stop or comma), apply lowercase-noun and voice rules (the guide's "tell me what's wrong" in "I"), keep section titles and every fact. The "Word list" section stays; lowercase its prose per §F4 except feature names.

- [ ] **Step 3: Verify (task tier)** + `npx vitest run test/copy-style.test.ts` (these files no longer pending).

- [ ] **Step 4: Commit** `copy(help): house style across the help guide`

---

### Task 9: The rest of the app, What's new icon, empty the pending list

**Files:**
- Modify: every file still in `PENDING`, plus `components/whats-new/whats-new-card.tsx`, `app/(app)/whats-new/page.tsx` (+ tests), `lib/release-notes.ts` (existing entries too), and the tests that assert changed strings.
- Modify: `test/copy-style.test.ts` — delete `PENDING` and the second test.

- [ ] **Step 1: Icon.** Replace `Sparkles` with `Megaphone` from `lucide-react` in both What's new files. `ai-suggest-button.tsx` keeps `Sparkles`.

- [ ] **Step 2: Work the pending list file by file**, heaviest first (`npx vitest run test/copy-style.test.ts` prints the remaining hits once a file leaves `PENDING`): for each file, remove it from `PENDING`, fix its hits to the house style, fix its "Failed to…"/"Please try again" toasts to `Couldn't <verb> <thing>. Try again.`, apply lowercase-noun and voice rules to any other user-facing string in the same file, update tests asserting those strings, run `npx vitest related --run <file>`. Commit every 8–10 files (`copy: house style in <area>`).

- [ ] **Step 3: Close the guard.** Delete `PENDING` and its test; the guard now applies to everything. `npx vitest run test/copy-style.test.ts` — PASS.

- [ ] **Step 4: Verify (task tier)** + `npx tsc --noEmit` + `npx eslint` on changed files.

- [ ] **Step 5: Commit** `copy: house style everywhere; guard enforces it`

---

## Branch close-out (main session, once)

Full `npm test` (expect ≥ 8,598 passing plus the new tests), `npm run build`, `npm run test:integration` if the docker DB is up. Then the final whole-branch review.
