# Feedback Note Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Feedback note records the site it was written on (main / beta / other preview / local); the inbox splits open notes by site, the panel chips notes from another site, and `feedback:resolve` is site-aware.

**Architecture:** A nullable `FeedbackNote.site` column, filled by the server from Vercel env via one pure helper (`lib/feedback-site.ts`). The inbox renderer and the panel view mapper read it; null means `main`. `feedback:resolve` gains an optional `--site` that only warns.

**Tech Stack:** Next.js 16 server actions, Prisma + Postgres, Vitest, tsx scripts.

**Spec:** `docs/specs/2026-09-26-feedback-site.md` (decisions: ADR 0040 amendment 2026-09-26; `CONTEXT.md` **Site**).

## Global Constraints

- Branch `feat/feedback-site-tag` (from `main` at `3002531`). Never commit to / merge into / push `main` or `beta`. Never push. Never deploy.
- **Never run `npm run feedback:pull` or `npm run feedback:resolve`** (they read/write production via `scripts/load-env.ts`). Tests exercise the pure libs only.
- Never `next start`. Prisma CLI commands only against the local database in `.env` (`host.docker.internal`) — confirm with `grep -o '@[^/:]*' .env` before running any `prisma migrate` command. Never set `DATABASE_URL` to anything from `.env.production.local` / `.env.vercel-prod`.
- Site values: `VERCEL_ENV=production` → `"main"`; `VERCEL_ENV=preview` → `VERCEL_GIT_COMMIT_REF` (trimmed) or `"preview"` if empty; anything else → `"local"`. Stored null counts as `"main"`. Display labels: `main`→`Main`, `beta`→`Beta`, `local`→`Local`, anything else → the raw name.
- The browser never supplies a site; the create schema does not accept one.
- Stage files explicitly; never `git add -A`/`.`. `CLAUDE.md` carries an uncommitted `next dev` block — never stage it whole (Task 4 stages one hunk via `git apply --cached`).
- Commit trailers exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01RuFVUoNnrXEY6WuEJUtf1c`
  No `Resolves-Feedback:` trailers.
- Gates after every task: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

## Review Focus

1. **A preview deploy with an empty `VERCEL_GIT_COMMIT_REF`** → site `"preview"`, never `""`. Pinned in Task 1.
2. **A client sending `site: "main"` from beta** (crafted request) → ignored; server value wins. Pinned in Task 1 (schema strips unknown keys; action test).
3. **Old notes with `site = null`** → shown as Main in the inbox and never chipped on main. Pinned in Tasks 2 and 3.
4. **Inbox with open notes on only one site** → no empty section headers for the other. Pinned in Task 2.
5. **`--site` typo'd or missing value** → a clear error, never a silent resolve. Pinned in Task 4.

---

### Task 1: Column, site helper, create action

**Files:**
- Modify: `prisma/schema.prisma` (model `FeedbackNote`, after `userAgent`)
- Create: `prisma/migrations/20260926000000_feedback_note_site/migration.sql`
- Create: `lib/feedback-site.ts`, `lib/feedback-site.test.ts`
- Modify: `server/actions/feedback.ts` (`createFeedbackNote`)
- Test: the existing test for `server/actions/feedback.ts` (find it: `ls server/actions/*feedback*test*`)

**Interfaces:**
- Produces: `feedbackSite(env?: Record<string, string | undefined>): string` (defaults to `process.env`); `siteOf(stored: string | null): string` (null → `"main"`); `siteLabel(site: string): string`.

- [ ] **Step 1: Failing tests** — `lib/feedback-site.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { feedbackSite, siteLabel, siteOf } from "./feedback-site";

describe("feedbackSite", () => {
  it("production is main", () => {
    expect(feedbackSite({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe("main");
  });
  it("a preview is its branch", () => {
    expect(feedbackSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "beta" })).toBe("beta");
    expect(feedbackSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: " feat/x " })).toBe("feat/x");
  });
  it("a preview with no branch is 'preview'", () => {
    expect(feedbackSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "" })).toBe("preview");
    expect(feedbackSite({ VERCEL_ENV: "preview" })).toBe("preview");
  });
  it("anything else is local", () => {
    expect(feedbackSite({})).toBe("local");
    expect(feedbackSite({ VERCEL_ENV: "development" })).toBe("local");
  });
});

describe("siteOf / siteLabel", () => {
  it("a note with no site counts as main", () => {
    expect(siteOf(null)).toBe("main");
    expect(siteOf("beta")).toBe("beta");
  });
  it("labels", () => {
    expect(siteLabel("main")).toBe("Main");
    expect(siteLabel("beta")).toBe("Beta");
    expect(siteLabel("local")).toBe("Local");
    expect(siteLabel("feat/x")).toBe("feat/x");
  });
});
```

In the create-action test (mock `db.feedbackNote.upsert` the way the file already does), add:

```ts
it("records the server's site and ignores one sent by the client", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "beta");
  await createFeedbackNote({ ...validInput, site: "main" } as never);
  expect(upsertMock).toHaveBeenCalledWith(
    expect.objectContaining({ create: expect.objectContaining({ site: "beta" }) }),
  );
  vi.unstubAllEnvs();
});
```

(Adapt `validInput` / `upsertMock` names to the file's existing fixtures.)

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run lib/feedback-site.test.ts server/actions`

- [ ] **Step 3: Implement.**

`lib/feedback-site.ts`:

```ts
/**
 * The **site** a Feedback note was written on (CONTEXT.md; ADR 0040 amendment
 * 2026-09-26). Derived on the server from Vercel's own deployment variables —
 * the browser never supplies it, so a note can't claim to come from somewhere
 * it didn't.
 */
export function feedbackSite(
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.VERCEL_ENV === "production") return "main";
  if (env.VERCEL_ENV === "preview") return env.VERCEL_GIT_COMMIT_REF?.trim() || "preview";
  return "local";
}

/** Notes written before sites were recorded have none; they count as main. */
export function siteOf(stored: string | null): string {
  return stored ?? "main";
}

const LABELS: Record<string, string> = { main: "Main", beta: "Beta", local: "Local" };

/** How a site reads to a person: known sites capitalised, other branches as named. */
export function siteLabel(site: string): string {
  return LABELS[site] ?? site;
}
```

`prisma/schema.prisma`, in `FeedbackNote` after `userAgent String?`:

```prisma
  /// Which deployment the note was written on — "main", a preview branch
  /// ("beta"), or "local". Set by the server (lib/feedback-site.ts), never by
  /// the client. NULL = written before sites were recorded; counts as main
  /// (ADR 0040, amended 2026-09-26).
  site      String?
```

`prisma/migrations/20260926000000_feedback_note_site/migration.sql`:

```sql
-- Additive on the read path AND the write path (docs/DEPLOY.md §4b): "site" is
-- nullable, so the still-running old build — which does not write it — cannot
-- violate a constraint during the migrate-then-build window, and its reads are
-- unaffected by a column it never selects.
--
-- Deliberately NOT backfilled: NULL means "written before sites were
-- recorded", which every reader treats as main (lib/feedback-site.ts siteOf).

-- AlterTable
ALTER TABLE "FeedbackNote" ADD COLUMN "site" TEXT;
```

`server/actions/feedback.ts` `createFeedbackNote` — import `feedbackSite` and add `site: feedbackSite(),` inside `create: { … }` (after `authoredAt`). Leave `update: {}` untouched (a replayed flush keeps its first site). `createFeedbackNoteSchema` is a plain `z.object`, which strips unknown keys, so a client `site` never reaches `rest` — do not add `site` to the schema.

- [ ] **Step 4: Local DB + client.** Confirm `.env` points at `host.docker.internal`, then `npx prisma generate && npx prisma migrate deploy` (applies only the new migration locally). `npx prisma validate`.

- [ ] **Step 5: Run — expect PASS; gates; commit** (`feat(feedback): record the site a note was written on`), adding the schema, migration dir, lib, action and tests explicitly.

---

### Task 2: Inbox split by site

**Files:**
- Modify: `lib/feedback-inbox.ts` (`InboxNote`, `FeedbackNoteRow`, `toInboxNote`, `renderNote`, `renderInbox`)
- Modify: `scripts/feedback-pull.ts` (add `site: true` to the select)
- Test: `lib/feedback-inbox.test.ts` (existing)

**Interfaces:**
- Consumes: `siteOf`, `siteLabel` from `lib/feedback-site.ts`.
- Produces: `InboxNote.site: string` (never null — `toInboxNote` applies `siteOf`); `FeedbackNoteRow.site: string | null`.

- [ ] **Step 1: Failing tests** (extend the file's existing note factory with a `site` field):

```ts
it("splits open notes into site sections, Beta first, then Main, then others", () => {
  const md = renderInbox([
    note({ id: "m1", site: "main" }),
    note({ id: "b1", site: "beta" }),
    note({ id: "x1", site: "feat/x" }),
  ], new Date("2026-09-26"));
  const beta = md.indexOf("## Open · Beta");
  const main = md.indexOf("## Open · Main");
  const other = md.indexOf("## Open · feat/x");
  expect(beta).toBeGreaterThan(-1);
  expect(main).toBeGreaterThan(beta);
  expect(other).toBeGreaterThan(main);
  expect(md.slice(beta, main)).toContain("`b1`");
});

it("a note with no site is Main, and an absent site gets no empty section", () => {
  const md = renderInbox([note({ id: "old", site: null })], new Date("2026-09-26"));
  expect(md).toContain("## Open · Main");
  expect(md).not.toContain("## Open · Beta");
});

it("shows open counts per site in the header", () => {
  const md = renderInbox([note({ site: "beta" }), note({ site: "beta" }), note({ site: null })], new Date("2026-09-26"));
  expect(md).toContain("_3 open (Beta 2 · Main 1), 0 resolved · pulled 2026-09-26_");
});

it("labels each resolved note with its site", () => {
  const md = renderInbox([note({ id: "r1", site: "beta", status: "DONE", resolvedAt: new Date() })], new Date("2026-09-26"));
  expect(md).toMatch(/- \*\*Beta · .*\*\* — `r1`/);
});
```

(`note(...)` here is whatever factory the file uses; the row-level factory must accept `site: string | null` and go through `toInboxNote`, or set `InboxNote.site` directly with `siteOf` applied.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - `FeedbackNoteRow` gains `site: string | null`; `InboxNote` gains `site: string`; `toInboxNote` sets `site: siteOf(row.site)`.
  - `renderNote(note, { showSite })`: when `showSite` is true, prefix the meta with `siteLabel(note.site)` (`[siteLabel(note.site), note.pageLabel, …]`). Open notes render with `showSite: false` (their section says it); resolved notes with `showSite: true`.
  - `renderInbox`: group `open` by `note.site`; order sections `beta`, `main`, then the rest alphabetically; each section is `## Open · ${siteLabel(site)}` followed by the existing area grouping (`### ${area}`). When there are no open notes keep the single `## Open` + "No open feedback notes." block. Header line: `_${open.length} open (${perSite}), ${resolved.length} resolved · pulled ${day}_` where `perSite` is `Beta 2 · Main 1` in the same section order; when `open.length === 0` keep the existing `_0 open, N resolved · pulled …_` shape.
  - `scripts/feedback-pull.ts`: add `site: true` to the `select`.

- [ ] **Step 4: Run — expect PASS** (update any existing snapshot/string assertions whose shape changed to the new intent); gates; commit (`feat(feedback): inbox splits open notes by site`).

---

### Task 3: Panel chip for notes from another site

**Files:**
- Modify: `lib/feedback-view.ts` (`FeedbackNoteView`, `FeedbackNoteQueryRow`, `VIEW_SELECT`, `toView`)
- Modify: `server/actions/feedback.ts` (pass the current site to `toView`)
- Modify: `components/feedback/feedback-launcher.tsx` (`SentEntry`, ~line 680)
- Test: `lib/feedback-view.test.ts` (create if missing), `components/feedback/feedback-launcher.test.tsx` (existing)

**Interfaces:**
- Consumes: `feedbackSite`, `siteOf`, `siteLabel`.
- Produces: `toView(row, viewerId, currentSite: string)`; `FeedbackNoteView.siteChip: string | null` — the label of the note's site when it differs from `currentSite`, else `null`.

- [ ] **Step 1: Failing tests.**

```ts
// lib/feedback-view.test.ts
import { toView, type FeedbackNoteQueryRow } from "./feedback-view";
const row = (site: string | null): FeedbackNoteQueryRow => ({
  id: "n1", body: "b", route: "/trips", pageLabel: "Trips", tripName: null,
  authorId: "u1", authorName: "Cam", status: "OPEN", authoredAt: new Date("2026-09-26"), site,
});
it("chips a note from another site", () => {
  expect(toView(row("beta"), "u1", "main").siteChip).toBe("Beta");
  expect(toView(row(null), "u1", "beta").siteChip).toBe("Main");
});
it("doesn't chip a note from the current site, including old notes on main", () => {
  expect(toView(row("beta"), "u1", "beta").siteChip).toBeNull();
  expect(toView(row(null), "u1", "main").siteChip).toBeNull();
});
```

```tsx
// feedback-launcher.test.tsx — render a sent note with siteChip "Beta" the way the file renders sent notes
it("shows the site chip on a note from another site", async () => {
  // …existing setup with a note { …, siteChip: "Beta" }
  expect(await screen.findByText("Beta")).toBeInTheDocument();
});
it("shows no chip when siteChip is null", async () => {
  // …note { …, siteChip: null }
  expect(screen.queryByText("Beta")).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - `FeedbackNoteQueryRow` gains `site: string | null`; `VIEW_SELECT` gains `site: true`; `FeedbackNoteView` gains `siteChip: string | null` (doc comment: "label of the site this note was written on, only when it isn't the site being viewed").
  - `toView(row, viewerId, currentSite)`: `const site = siteOf(row.site); siteChip: site === currentSite ? null : siteLabel(site)`.
  - In `server/actions/feedback.ts`, compute `const site = feedbackSite()` once per action and pass it to every `toView` call (create and list).
  - `SentEntry`: after the status badge slot, render `{note.siteChip ? <Badge variant="outline" aria-label={`Written on ${note.siteChip}`}>{note.siteChip}</Badge> : null}` before the status badge (use an existing Badge variant — check `components/ui/badge.tsx` for the muted/outline one; no new colours). `PendingEntry` (queued notes, always this site) gets nothing.

- [ ] **Step 4: Run — expect PASS; gates; commit** (`feat(feedback): chip notes written on another site`).

---

### Task 4: Site-aware resolve + CLAUDE.md

**Files:**
- Modify: `lib/feedback-resolve-args.ts` (+ its test `lib/feedback-resolve-args.test.ts`)
- Modify: `scripts/feedback-resolve.ts` (select `site`, print it, warn on mismatch)
- Create: `lib/feedback-resolve-site.ts` + test (pure message helper)
- Modify: `CLAUDE.md` — only the "Closing a Feedback note" section

**Interfaces:**
- Produces: `ResolveArgs.site: string | null`; `siteMismatchWarning(noteSite: string | null, resolvingFor: string | null): string | null`.

- [ ] **Step 1: Failing tests.**

```ts
// lib/feedback-resolve-args.test.ts
it("accepts --site <name> and --site=<name>", () => {
  expect(parseResolveArgs(["n1", "--site", "beta"])).toMatchObject({ id: "n1", site: "beta" });
  expect(parseResolveArgs(["n1", "--site=main"])).toMatchObject({ site: "main" });
});
it("site defaults to null", () => {
  expect(parseResolveArgs(["n1"])).toMatchObject({ site: null });
});
it("--site without a value is an error", () => {
  expect(parseResolveArgs(["n1", "--site"])).toEqual({ error: expect.stringContaining("--site") });
  expect(parseResolveArgs(["n1", "--site", "--dry-run"])).toEqual({ error: expect.stringContaining("--site") });
});

// lib/feedback-resolve-site.test.ts
import { siteMismatchWarning } from "./feedback-resolve-site";
it("warns when the note's site differs from the site being resolved for", () => {
  expect(siteMismatchWarning("beta", "main")).toBe(
    "Warning: this note was written on Beta, but you're resolving for Main. Resolving anyway.",
  );
});
it("treats a note with no site as main", () => {
  expect(siteMismatchWarning(null, "main")).toBeNull();
  expect(siteMismatchWarning(null, "beta")).toContain("written on Main");
});
it("says nothing without --site", () => {
  expect(siteMismatchWarning("beta", null)).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - `parseResolveArgs`: add `site: string | null` (default null); handle `--site <value>` (value missing or starting with `--` → `{ error: '--site needs a value, e.g. --site beta' }`) and `--site=<value>`; trim; update the usage comment.
  - `lib/feedback-resolve-site.ts`:

```ts
import { siteLabel, siteOf } from "@/lib/feedback-site";

/** A non-blocking heads-up when a note is resolved for a site it wasn't written on (ADR 0040, 2026-09-26). */
export function siteMismatchWarning(noteSite: string | null, resolvingFor: string | null): string | null {
  if (!resolvingFor) return null;
  const site = siteOf(noteSite);
  if (site === resolvingFor) return null;
  return `Warning: this note was written on ${siteLabel(site)}, but you're resolving for ${siteLabel(resolvingFor)}. Resolving anyway.`;
}
```

  - `scripts/feedback-resolve.ts`: add `site: true` to the `findUnique` select; after the not-found check print `Site: ${siteLabel(siteOf(existing.site))}`; print `siteMismatchWarning(existing.site, parsed.site)` if non-null (both in dry-run and real runs). Update the header comment's run command to show `[--site <name>]`. **Do not run this script.**
  - `CLAUDE.md` "After I confirm the deploy is live" steps: change step 1 to read "`npm run feedback:resolve -- <id> --site <site> --note "what you did"` for each `Resolves-Feedback:` trailer on **that site's branch** (`main` for the live site, `beta` for beta) since that site's last deploy." and add one line under the section heading: "Each note records the **site** it was written on (ADR 0040, amended 2026-09-26): a beta note closes when the fix is live on beta, a main note when it is live on main." Stage ONLY this hunk: `git diff CLAUDE.md > /tmp/claude-md.patch`, edit the patch copy to drop the `next dev` block hunk (it's the hunk adding the "This is NOT the Next.js you know" block), then `git apply --cached <edited patch>`; verify with `git diff --cached CLAUDE.md` that only the feedback lines are staged.

- [ ] **Step 4: Run — expect PASS; gates; commit** (`feat(feedback): feedback:resolve prints the site and warns on a mismatch`).
