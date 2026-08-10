# E+ Batch 3 — Journal · Files · Checklists Bold-Modular Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the **Journal**, **Files**, and **Checklists** surfaces to the Bold-Modular mocks — presentationally. Preserve every data path, server action, autosave/upload/toggle behaviour, aria contract, `data-testid`, and test-queried placeholder.

**Architecture:** A mix of async RSC pages (no unit tests) and client components (behaviour-only tests that stay green). Changes are layout/card-anatomy/colour only. Two shared risks are isolated: (1) `attachment-list.tsx`'s `compact` branch feeds 5 popover surfaces, so all Files styling is guarded behind `!compact`; (2) the underline tab look is applied via page-level `className` overrides, never by editing the shared `tabs.tsx` primitive.

**Tech Stack:** Next.js RSC + client components, Tailwind v4 (token-driven), `cn`, lucide-react, Radix (Tabs, Avatar), Vitest + Testing Library.

## Global Constraints
- **Mocks:** `design_handoff/TEEPEE - Bold Modular More.dc.html` (M3 Journal ~111–157, M4 Files ~153–159, M5 Checklists ~178–189) and `TEEPEE - Bold Modular Desktop 2.dc.html` (E3 Journal ~79–112, E4 Files ~110–119, E5 Checklists ~131–141). Anatomy in `DESIGN-BRIEF.md` C9. Fidelity is Cam's local `npm run dev` pass.
- **Presentation-only:** NO changes to props/interfaces, server-action calls, callbacks, state, optimistic logic, aria roles/labels/live-regions, `maxLength`, or test-queried text (placeholders, headings).
- **DO NOT modify shared primitives beyond their current behaviour:** `tabs.tsx` (cascades app-wide — use call-site `className` overrides), `card.tsx`, `avatar.tsx`, `segmented.tsx`.
- **DO NOT touch** `components/trip/attachment-links.tsx` or `components/trip/attachment-popover.tsx` (used across timeline/Plan/Wishlist/Globe). For `attachment-list.tsx`, **every visual change is guarded by `!compact`** so the `compact` popover branch (5 surfaces) renders byte-identically to today.
- **Colours token-driven / named-palette** (as established): use `text-success`, `text-primary`, `text-destructive`, `text-amber-700`, `bg-muted`, etc. No raw hex, no inline colour `style`. Category/severity hues use the existing named-palette convention. Radius progression: controls `rounded-xl`, cards/panels `rounded-2xl`, large containers `rounded-3xl`.
- **Accessibility:** keep WCAG AA + visible focus rings + existing aria contracts (JournalEditor `role="status"`/`aria-live`/`aria-label="Journal entry"`/`maxLength=5000`; checklist add-input placeholder; attachment delete aria-labels).
- **Environment (sandbox):** Node ≥22 (`export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use` if vitest errors). `next build`/`next dev` FAIL — do NOT run. Gates: `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run <focused>` then full.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure
- `app/(app)/trips/[tripId]/journal/page.tsx` — **modify** (T1, RSC render).
- `components/trip/journal-editor.tsx` — **modify** (T2).
- `components/trip/attachment-list.tsx` + `.test.tsx` — **modify** (T3; `!compact` branch only).
- `app/(app)/trips/[tripId]/files/page.tsx` — **modify** (T4, RSC render).
- `components/trip/checklist.tsx` + `.test.tsx` — **modify** (T5).
- `app/(app)/trips/[tripId]/checklists/page.tsx` — **modify** (T6, RSC render + tab className overrides).
- `components/trip/packing-templates-bar.tsx`, `components/trip/ai-booking-parser.tsx`, `components/trip/ai-packing-suggestions.tsx` — **modify** (T7, radius only).

---

### Task 1: Journal list page

**Files:** Modify `app/(app)/trips/[tripId]/journal/page.tsx` (RSC render only). No test (async RSC).

**Preserve:** all DB queries, `requireTripAccess`, `photosByDate`/`allDates` union logic, `formatLongDate`/`relativeTime`, the `EmptyState`, and the `Link` to the day view. NO schema/data changes — there is no per-entry `title` and no stop/city suffix available, so render the body directly and use the date alone (do not invent a title or join a city).

- [ ] **Step 1: Restyle the render.**
  - Page `<h2>`: add `tracking-tight` → `font-display text-2xl font-bold tracking-tight text-foreground`. Keep the "{N} entries" line.
  - Date section header: replace the current heading with a hairline-rule row — keep the `<Link href={.../day/${date}}>` but style its label as `font-display text-sm font-bold text-foreground`, followed by a `<span className="h-px flex-1 bg-border" aria-hidden="true" />`. Wrap in `<div className="flex items-center gap-2">`. Drop the separate "View day →" span.
  - Entry card: `rounded-xl border border-border bg-card px-5 py-4` → `rounded-2xl border border-border bg-card p-4 shadow-soft`. Body stays `whitespace-pre-wrap text-sm leading-relaxed`, colour → `text-foreground` (keep readable).
  - Author/time footer: prepend a small avatar circle — `<span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">{firstInitial}</span>` — then `"{name} · {relativeTime}"` in `text-xs text-muted-foreground`. Derive `firstInitial` from the author name (fallback "?"); if there is no author, render the time alone (keep current fallback behaviour).
  - Photo grid: `flex flex-wrap gap-2` + `h-28 w-28` → `grid grid-cols-2 gap-2 sm:grid-cols-3` with cells `h-24 w-full rounded-xl object-cover`. Keep the `<a href={photo.url} target="_blank" rel="noopener noreferrer">` wrappers and alt text.
- [ ] **Step 2: Gates.** `npx tsc --noEmit`; `npx eslint "app/(app)/trips/[tripId]/journal/page.tsx"`; full `npx vitest run` (green, unchanged count).
- [ ] **Step 3: Commit** — `feat(journal): Bold-Modular entry cards + hairline date dividers (E+ B3)` (+ trailer).

---

### Task 2: `JournalEditor` (Day view)

**Files:** Modify `components/trip/journal-editor.tsx`. Behaviour tests in `journal-editor.test.tsx` must stay green (do not edit them).

**Preserve (hard):** props `{ tripId, date, initialBody, updatedAt?, author?, photos }`; autosave (`handleBlur`→`handleSave` only when changed; `saveJournalEntry(tripId, date, body)`; `saveStatus` "saving"→"saved"→null 2s timer; `saveTimerRef` cleanup); `hasChanges` Save button; the invisible `<p role="status" aria-live="polite">` (keep it mounted in a stable position — do NOT move it into a node that remounts); `<Textarea … aria-label="Journal entry" maxLength={5000} disabled={isSaving}>`; PhotoStrip upload/delete (`uploadAttachment` FormData keys `tripId`/`targetType:"JOURNAL"`/`targetId:date`/`file`; `deleteAttachment(id)`; delete btn `aria-label={`Delete photo ${photo.filename}`}`; `htmlFor`↔hidden input wiring).

- [ ] **Step 1: Restyle** (logic untouched):
  - Wrap the editor in a card: `rounded-2xl border border-border bg-card p-4 shadow-soft` (was bare `space-y-4`; keep an inner `space-y-3`).
  - Header row (new): a `flex items-center justify-between` line with the date label on the left (`font-display text-sm font-bold text-foreground` — reuse the date/`updatedAt` info already available; if only `date` is available, show the formatted date) and the **combined status+count** on the right: keep the existing `<p role="status" aria-live="polite">` element but render its text as `{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : (lastSaved ? "Saved" : "")} · {body.length}/5000` styled `text-[11px] font-medium text-success`. Remove the old separate bottom-left char-count and bottom-right status blocks (fold both into this one live region). If keeping the live-region text non-empty only when there's a status is simpler, ensure the char count is always visible even when status is empty (put the count in a sibling span if needed, but keep `role="status"` on the status text).
  - `<Textarea>`: pass `className="rounded-xl resize-none"` (keep `rows`, `aria-label`, `maxLength`, `disabled`). Placeholder may be trimmed to "How was today? Jot a memory…".
  - PhotoStrip: grid `flex flex-wrap gap-2` → `grid grid-cols-2 gap-2 sm:grid-cols-3`; thumbnails `h-24 w-24 rounded-lg` → `h-24 w-full rounded-xl object-cover`. Upload trigger `<label>` → a square tile `size-14 rounded-xl border-[1.5px] border-dashed border-border flex items-center justify-center` with a `+` (`Plus` icon); keep `htmlFor`↔input wiring and the `isPending && !deletingId` disabled state.
- [ ] **Step 2: Gates.** Run `npx vitest run components/trip/journal-editor.test.tsx` → both behaviour tests green. Then `npx tsc --noEmit`; `npx eslint components/trip/journal-editor.tsx`; full `npx vitest run`.
- [ ] **Step 3: Commit** — `feat(journal): Bold-Modular editor card + combined save/count header (E+ B3)` (+ trailer).

---

### Task 3: `AttachmentList` — dropzone + mime chip (NON-COMPACT only)

**Files:** Modify `components/trip/attachment-list.tsx` + `.test.tsx`.

**Preserve (hard):** props `{ tripId?, globeId?, targetType, targetId?, attachments, compact? }`; `AttachmentView` interface; `uploadAttachment(FormData)` (keys tripId/globeId/targetType/targetId/file) + `deleteAttachment(id)`; the input `id` generation + `htmlFor` label wiring; file-input reset on error; `useConfirm` destructive delete dialog; `deletingId`/`isPending && !deletingId` differentiation; `formatBytes`/`mimeLabel`. Existing 4 behaviour tests stay green.

**CRITICAL SCOPE:** Every visual change below is **guarded by `!compact`**. The `compact === true` branch (used by `AttachmentPopover` on Plan/Wishlist/Globe/Stop/Transport/Accommodation) must render EXACTLY as it does today — do not restyle it.

- [ ] **Step 1: Add a class-string regression test** to `attachment-list.test.tsx` (keep the 4 existing tests). Render a non-compact list with one PDF attachment and assert the coloured mime chip exists (e.g. `container.querySelector(".rounded-xl")` on the icon chip is thin — instead assert the dropzone): render non-compact and assert the dropzone block is present:

```tsx
it("shows a full dropzone in non-compact mode", () => {
  const { container } = render(
    <AttachmentList tripId="t" targetType="TRIP" attachments={[{ id: "a", filename: "x.pdf", mime: "application/pdf", size: 1000, url: "/x" }]} />,
  );
  expect(container.querySelector(".border-dashed")).toBeTruthy();
});
```

(Use the real `AttachmentView` fields the file already expects. If the file mocks server actions/`useConfirm`, follow the existing test's setup.)

- [ ] **Step 2: Run → confirm** (the current inline "Add file" label already uses `border-dashed`, so this may pass immediately — if so, strengthen the assertion to check the dropzone is a block-level centred zone, e.g. it contains the "browse" copy text: `expect(screen.getByText(/browse/i)).toBeInTheDocument()` — that WILL be RED until implemented).

- [ ] **Step 3: Implement (guarded by `!compact`):**
  - **MimeIcon → coloured chip (non-compact):** wrap the icon in `<span className="flex size-10 shrink-0 items-center justify-center rounded-xl">` with a hued bg + icon colour by mime: image → `bg-sky-500/15 text-sky-600`; `application/pdf` → `bg-red-500/15 text-red-600`; fallback → `bg-muted text-muted-foreground`. Keep the existing lucide icon components. In `compact` mode, keep the current bare `size-5` icon unchanged.
  - **Upload trigger (non-compact):** replace the small inline `<label>` with a full-width dashed dropzone: `<label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-border p-5 text-center transition-colors hover:border-primary">` containing an `Upload` icon (`size-6 text-muted-foreground`), a line "Drop files or browse" (`text-sm font-semibold`), and a subline "PDF, images · attach to any entity" (`text-xs text-muted-foreground`). Keep the hidden `<input>` inside/associated with this label (same `id`/`htmlFor`). In `compact` mode, keep the current small inline "Add file" label unchanged. (Note: no real drag-and-drop handlers are added — visual only.)
  - **Row body (non-compact):** remove the `<Badge>` mime-label; always render the size (`formatBytes`) as `text-xs text-muted-foreground`; filename `font-semibold`. The `<ul>` wrapper: `divide-y divide-border rounded-xl border border-border bg-card` → keep `divide-y divide-border` but drop `rounded-xl border border-border bg-card` (rows sit on the page surface with hairline dividers). In `compact` mode, keep the current `<ul>` classes and `<Badge>` unchanged.
  - Keep the open (`ExternalLink`) and delete (`Trash2`) icon buttons in both modes with their existing aria-labels.
- [ ] **Step 4: Run tests → GREEN** (`npx vitest run components/trip/attachment-list.test.tsx` — new + 4 existing). Then `npx tsc --noEmit`; `npx eslint components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx`; full `npx vitest run`.
- [ ] **Step 5: Commit** — `feat(files): Bold-Modular dropzone + mime chips (non-compact) (E+ B3)` (+ trailer).

---

### Task 4: Files page layout

**Files:** Modify `app/(app)/trips/[tripId]/files/page.tsx` (RSC render only). No test.

**Preserve:** all Prisma fetching, `requireTripAccess`, `TARGET_TYPES` iteration order, the TRIP/entity split + `grouped` Map, threading `tripId`/`targetType` into each `<AttachmentList>`, and the `EmptyState` on empty.

- [ ] **Step 1: Unify the layout.**
  - Page header: `<h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Files</h2>` (keep any existing subtitle or drop it). Do NOT add a header upload button (upload lives in the TRIP `AttachmentList` dropzone — adding a second wired uploader is out of scope).
  - Collapse the two `<section>`s ("Trip-level files" / "Files by category") into one flow. Render the TRIP `AttachmentList` first (non-compact), then each non-empty entity group. Replace the `<h3>`/`<h4>` headings with a shared inline group-header row: `<div className="flex items-center gap-2 px-1"><span className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</span><span className="text-xs text-muted-foreground">{count}</span><span className="h-px flex-1 bg-border" /></div>`. Use `TARGET_TYPE_LABELS` for `{label}` and the group length for `{count}`. Keep each group's `<AttachmentList>` non-compact.
  - Outer wrapper `space-y-8` → `flex flex-col gap-6`.
- [ ] **Step 2: Gates.** `npx tsc --noEmit`; `npx eslint "app/(app)/trips/[tripId]/files/page.tsx"`; full `npx vitest run` (green).
- [ ] **Step 3: Commit** — `feat(files): unified grouped file list + Bold-Modular header (E+ B3)` (+ trailer).

---

### Task 5: `Checklist` — Bold-Modular rows, progress, badges, add form

**Files:** Modify `components/trip/checklist.tsx` + `.test.tsx`.

**Preserve (hard):** props `{ tripId, kind, items, members?, showDueDate?, showAssignee? }`; server actions `toggleChecklistItem`/`addChecklistItem`/`updateChecklistItem`/`deleteChecklistItem`/`reorderChecklistItem` via `useTransition`; optimistic `opacity-60`; `useDeleteWithConfirm`; `EditItemDialog`; `AnimatedList`/`AnimatedItem` (keep `as="ul"/"li"` + `SPRING_POP`); the `dueDateStatus()` comparison logic. **The add-input placeholder text must NOT change** (a test queries `getByPlaceholderText(/book airport taxi/i)`). The 4 existing behaviour tests stay green.

- [ ] **Step 1: Add a due-badge regression test** to `checklist.test.tsx` (keep existing tests). Render a `<Checklist>` with an overdue item (a `dueDate` in the past) and `showDueDate` and assert the label contains "Overdue"; and one with a near-future date asserting "Due soon". Copy the existing tests' `ChecklistItemRow`/props fixture shape; use dates relative to a fixed base if the file mocks the clock, else pick clearly past/near dates.

- [ ] **Step 2: Run → RED** (labels are currently "Due {ISO}", not "Overdue …"/"Due soon …").

- [ ] **Step 3: Implement:**
  - **Due badge label:** in the badge render (driven by `dueDateStatus()`), format the date with the codebase's existing short-date approach — `new Date(<parsed same way dueDateStatus already parses it>).toLocaleDateString("en-AU", { month: "short", day: "numeric" })` (reuse any existing helper in `lib/dates.ts` if present; do NOT add a new date dependency; mind the ISO-midnight/timezone pitfall — parse exactly as `dueDateStatus` already does so status and label agree). Prefix by status: overdue → `Overdue · {date}`, soon → `Due soon · {date}`, normal → `Due · {date}`.
  - **Due badge colour/icon:** overdue keep `text-destructive` + `AlertTriangle`; soon `text-amber-600 dark:text-amber-400` → `text-amber-700 dark:text-amber-400` + a clock icon; normal `text-muted-foreground` + `CalendarClock`. `text-xs font-semibold`.
  - **ChecklistRow:** `items-start` → `items-center`; padding `px-3 py-2.5` → `px-3.5 py-3`; keep `hover:bg-muted/40` and hover-only row actions. Checkbox: undone keeps `text-muted-foreground` (token-driven), done keeps `text-primary`; keep `CheckSquare`/`Square` (or existing icons).
  - **Assignee avatar:** remove `ring-1 ring-border` (keep `size-6`).
  - **ProgressBar:** label add `font-semibold` (`text-xs font-semibold text-muted-foreground`); track/fill unchanged (`h-2 rounded-full bg-muted` / `bg-primary`).
  - **List `<ul>`:** `rounded-xl` → `rounded-2xl` (keep `divide-y … border border-border bg-card`).
  - **AddItemForm container:** `rounded-xl border-dashed border-border bg-muted/30 p-3` → `rounded-2xl border-dashed border-border/80 bg-muted/40 p-3`; the "Add" submit `Button` → add `shape="pill"` (pill variant from Tier ⑤; if the Button lacks that in this call, use `className="rounded-full"`). Keep the text input's placeholder unchanged; keep `showDueDate`/`showAssignee`-gated optional fields.
- [ ] **Step 4: Run tests → GREEN** (`npx vitest run components/trip/checklist.test.tsx` — new + 4 existing incl. the placeholder-driven add test). Then `npx tsc --noEmit`; `npx eslint components/trip/checklist.tsx components/trip/checklist.test.tsx`; full `npx vitest run`.
- [ ] **Step 5: Commit** — `feat(checklists): Bold-Modular rows, due badges, pill add form (E+ B3)` (+ trailer).

---

### Task 6: Checklists page — heading + underline tabs

**Files:** Modify `app/(app)/trips/[tripId]/checklists/page.tsx` (RSC render + Tabs `className` overrides). **Do NOT edit `components/ui/tabs.tsx`.** No page test.

**Preserve:** all data fetching, `sortChecklist` split, the `Tabs`/`TabsContent` structure + `defaultValue="pretrip"`, and every child (`Checklist` ×2, `PackingTemplatesBar`, `AiPackingSuggestions`, `AiBookingParser`) with its props.

- [ ] **Step 1: Implement.**
  - Add a page heading above the tabs: `<h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Checklists</h2>` (wrap the existing content so the outer container is `flex flex-col gap-6` with the h2 first).
  - Underline tab style via call-site overrides (leave `tabs.tsx` untouched):
    - `<TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">`
    - each `<TabsTrigger className="rounded-none border-b-2 border-transparent px-0 py-2.5 font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none">`
    - Keep the remaining-count `<span>` badges on the triggers (harmless enhancement) OR drop them — either is acceptable; if kept, keep their current classes.
  - Optionally remove the per-tab sub-heading `<h2>`/`<p>` blocks inside each `TabsContent` (the tab label is the heading now); keep the child components.
- [ ] **Step 2: Gates.** `npx tsc --noEmit`; `npx eslint "app/(app)/trips/[tripId]/checklists/page.tsx"`; `npx vitest run components/ui/tabs.test.tsx` (untouched primitive → green); full `npx vitest run`.
- [ ] **Step 3: Commit** — `feat(checklists): page heading + underline tabs (E+ B3)` (+ trailer).

---

### Task 7: Radius consistency — templates bar + AI panels

**Files:** Modify `components/trip/packing-templates-bar.tsx`, `components/trip/ai-booking-parser.tsx`, `components/trip/ai-packing-suggestions.tsx`. No tests (none exist; behaviour untouched).

**Preserve:** all server actions, dialogs, transitions, violet AI-accent convention.

- [ ] **Step 1: Implement (radius-only, no logic):**
  - `packing-templates-bar.tsx`: outer container `rounded-xl` → `rounded-2xl`.
  - `ai-booking-parser.tsx`: textarea `rounded-lg` → `rounded-xl`; draft result panel `rounded-xl` → `rounded-2xl`.
  - `ai-packing-suggestions.tsx`: violet suggestions panel `rounded-xl` → `rounded-2xl`; per-item row `rounded-lg` → `rounded-xl`.
- [ ] **Step 2: Gates.** `npx tsc --noEmit`; `npx eslint components/trip/packing-templates-bar.tsx components/trip/ai-booking-parser.tsx components/trip/ai-packing-suggestions.tsx`; full `npx vitest run` (green, unchanged count).
- [ ] **Step 3: Commit** — `feat(checklists): chunkier radius on templates bar + AI panels (E+ B3)` (+ trailer).

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean on all touched files; full `npx vitest run` green (count grows by the added regression tests).
- Journal: hairline date dividers, chunkier entry cards with avatar+time footers, grid photo galleries; editor card with combined "Saved · n/5000" status.
- Files: full dashed dropzone + coloured mime chips + unified grouped list (non-compact); popover (`compact`) surfaces UNCHANGED.
- Checklists: page heading + underline tabs (via overrides, `tabs.tsx` untouched); Bold-Modular rows, humanized due badges (Overdue/Due soon), chunkier list + pill add form; AI panels/templates radius aligned.
- No behaviour/prop/action/aria/`data-testid`/placeholder changes; `tabs.tsx`/`attachment-links`/`attachment-popover` untouched; `attachment-list` `compact` branch byte-identical.
- Visual pass (Cam, local dev) owed. Tick Journal · Files · Checklists in the tracker.

## Self-Review Notes
- **Spec coverage:** Journal (list T1, editor T2), Files (list-component T3, page T4), Checklists (rows/badges/add T5, page tabs T6, radius T7). C9 anatomy preserved; no data/schema changes.
- **Isolation of shared risk:** T3 gates every change behind `!compact` (popover surfaces safe); T6 uses call-site overrides (no `tabs.tsx` cascade). T7 is radius-only.
- **Test contracts:** JournalEditor `role="status"`/aria kept; AttachmentList upload/delete behaviour + aria kept; Checklist add-input placeholder kept; new regression assertions for the Files dropzone and the checklist due-badge labels.
- **Placeholder scan:** all class strings literal; the due-date humanization reuses the existing parse (no new dep) and is guarded by a regression test.
- **Blind build:** unverifiable visually in-sandbox; class-string regression assertions + preserved behaviour tests are the guard; Cam's local pass is the fidelity check.
