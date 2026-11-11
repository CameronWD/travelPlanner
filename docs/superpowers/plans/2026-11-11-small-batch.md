# Small batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offline-aware wording on the after-close upload failure toast, and the next Transport's files as chips on the Travelling Home's "Up next" card.

**Architecture:** Task 1 is local to `useStagedUploads`: a thrown upload is marked as thrown so the after-close toast can pass it through `failureMessage`. Task 2 threads the next Transport's `id` out of `loadTravellingHome`, and `PhaseTravelling` hands `attachmentsByTarget[id]` to `TransportCountdown`, which renders chips.

**Tech Stack:** React 19, Next.js, Vitest + Testing Library.

**Spec:** `docs/specs/2026-11-11-small-batch.md`

## Global Constraints

- Verification per task: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Inner loop: `npx vitest run <test file>`. Never the full suite or `next build` per task.
- Offline copy comes only from `failureMessage` / `OFFLINE_MESSAGE` in `components/ui/failure-message.ts`; never hard-code it.
- No em-dashes in Traveller-facing strings (`test/copy-style.test.ts`).
- Zero comments unless the WHY is non-obvious; no JSDoc on new code. Match local style.
- Do not commit `AGENTS.md`. Stage by explicit path. Never run `feedback:*` scripts or load `.env.production.local`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Offline, but the failure was a staging check** (a wrong-type file still preparing when the tray closed) — keeps "Only PDFs, photos or text files can be added.", not the offline line. Task 1 test.
2. **Offline while the tray is still open** — the row error stays "Couldn't upload that file." (spec: rows unchanged). Task 1 test.
3. **Next Transport with no files** — card renders no chip container at all. Task 2 test.
4. **Next Transport departs tomorrow** — its files still show (attachments are trip-wide). Task 2 test at the PhaseTravelling level with a model whose `nextTransport.id` has entries in `attachmentsByTarget`.
5. **A titled file** — chip shows the title, not the filename. Task 2 test.

---

### Task 1: Offline-aware after-close toast

**Files:**
- Modify: `components/trip/staged-upload-tray.tsx` (`send` / `enqueue` / `report` — the failure path)
- Test: `components/trip/attachment-list.test.tsx`

**Interfaces:** none produced.

Behaviour: in `send`, a thrown `uploadAttachment` is distinguishable from a refusal (e.g. return `{ reason, thrown: true }` or keep the string and track thrown separately — implementer's choice). The mounted row error stays `"Couldn't upload that file."`. In the after-close outcome, a thrown failure's reason is `failureMessage(UPLOAD_FAILED)`, computed when the failure happens; refusals and staging-check failures keep their own reason.

- [ ] **Step 1: Write the failing tests** (set offline with `Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true })`, restore to `true` in `afterEach`):
  - `"after close, a thrown upload while offline toasts the offline message"` — stage `a.pdf`, `uploadAttachment` mock rejects, set offline, `unmount()`; `toast` called with `title: "Couldn't add a.pdf"`, `description: OFFLINE_MESSAGE` (import it from `@/components/ui/failure-message`).
  - `"after close, a thrown upload while online keeps the generic reason"` — same, online; description `"Couldn't upload that file."`.
  - `"after close, a server refusal keeps its reason even when offline"` — mock resolves a refusal with message `"This trip is out of space."` (same shape as the existing rejection test); offline; description is that message.
  - `"while open, an offline thrown upload leaves the row error unchanged"` (Review Focus 2) — click Add; row alert reads `"Couldn't upload that file."`; `toast` not called.
  - `"after close, an offline staging failure keeps its own message"` (Review Focus 1) — use a deferred `compressImage` for an image so preparation is still running, then a `video/mp4` behind it; offline; `unmount()`; resolve; the mp4's toast description is `"Only PDFs, photos or text files can be added."`. If the tray checks type before compression so this ordering can't be produced, assert the equivalent with the simplest ordering that leaves the mp4 unprepared at unmount, and say so in the report.

- [ ] **Step 2: Run and confirm they fail** — `npx vitest run components/trip/attachment-list.test.tsx`; the offline-toast test fails (description is the generic text), others may already pass — note which.

- [ ] **Step 3: Implement** the thrown marker and `failureMessage` use in `components/trip/staged-upload-tray.tsx`.

- [ ] **Step 4: Run and confirm they pass** — same command, all green; then the task-done tier on `components/trip/staged-upload-tray.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/trip/staged-upload-tray.tsx components/trip/attachment-list.test.tsx
git commit -m "fix(attachments): offline wording on the after-close upload toast"
```

---

### Task 2: Next Transport's files on the "Up next" card

**Files:**
- Modify: `lib/travelling-home-loader.ts:141-156` (`nextTransport` gains `id: string`)
- Modify: `components/trip/transport-countdown.tsx` (new optional prop)
- Modify: `components/trip/home/phase-travelling.tsx:167-174` (pass the attachments)
- Test: `components/trip/transport-countdown.test.tsx`, `components/trip/home/phase-travelling.test.tsx`

**Interfaces:**
- Produces: `nextTransport: { id: string; depAt: string; depTimeLabel; depZone; label } | null` from `loadTravellingHome` (dated model). The desktop `today-tile.tsx` prop type is a structural subset and needs no change.
- Produces: `TransportCountdown` prop `attachments?: AttachmentView[]` (type from `@/lib/attachment-view`).

Behaviour: when `attachments` is non-empty, render below the "Leaves" block (or below the label when there is no time) a wrapping row of chips, one per attachment, in the given order. Each chip is an `AttachmentLink` (`href={a.url}`, `mime={a.mime}`) with a `Paperclip` icon and the text `attachmentName(a)`; min height 44px (`min-h-11`), rounded-full, `border-2 border-border bg-card text-foreground`, `text-sm font-extrabold`, padding `px-3.5` — a tap target that reads on the coral card. Empty or absent → render nothing extra (no wrapper element). `PhaseTravelling` passes `attachmentsByTarget[nextTransport.id] ?? []`.

- [ ] **Step 1: Write the failing tests**
  - `transport-countdown.test.tsx`: `"shows each of the departure's files as a link chip, named by title else filename"` — attachments `[{ title: "Boarding pass", filename: "BA123.pdf", url: "/api/attachments/a1", mime: "application/pdf", … }, { title: null, filename: "seat-map.png", url: "/api/attachments/a2", mime: "image/png", … }]`; `getByRole("link", { name: /Boarding pass/ })` has `href` `/api/attachments/a1`; a link named `/seat-map\.png/` exists; no link named `/BA123\.pdf/` (Review Focus 5).
  - `transport-countdown.test.tsx`: `"renders no file chips when the departure has no files"` (Review Focus 3) — with `attachments={[]}` and with the prop omitted, `queryAllByRole("link")` is empty.
  - `phase-travelling.test.tsx`: `"the Up next card shows the next Transport's files"` (Review Focus 4) — follow the file's existing render/model pattern for `PhaseTravelling`; a model whose `nextTransport.id` is `"tr-1"` and `attachmentsByTarget["tr-1"]` holds one file titled `"Boarding pass"`, the next departure dated tomorrow relative to the model's today; the link `/Boarding pass/` is present inside the Up next card (scope with `within` on the card containing "Next departure").
  - `phase-travelling.test.tsx` loader block (the existing "next transport depZone" describe): `"nextTransport carries the Transport's id"` — `model.nextTransport?.id` equals the seeded transport's id.

- [ ] **Step 2: Run and confirm they fail** — `npx vitest run components/trip/transport-countdown.test.tsx components/trip/home/phase-travelling.test.tsx`.

- [ ] **Step 3: Implement** the loader `id`, the `attachments` prop and chips, and the `PhaseTravelling` wiring.

- [ ] **Step 4: Run and confirm they pass** — same command; then the task-done tier on `lib/travelling-home-loader.ts components/trip/transport-countdown.tsx components/trip/home/phase-travelling.tsx`.

- [ ] **Step 5: Commit**

```bash
git add lib/travelling-home-loader.ts components/trip/transport-countdown.tsx components/trip/home/phase-travelling.tsx components/trip/transport-countdown.test.tsx components/trip/home/phase-travelling.test.tsx
git commit -m "feat(today): the next departure's files on the Up next card"
```

---

### Branch done

`npm test` + `npm run build` + `npm run test:integration` (local DB is up; the integration helper refuses non-local hosts).
