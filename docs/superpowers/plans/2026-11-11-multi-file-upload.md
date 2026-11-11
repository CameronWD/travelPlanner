# Multi-file upload, title on upload, drag-and-drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Traveller pick or drop several files into any `AttachmentList`, give each an optional title in a staging tray, and upload them in one go.

**Architecture:** The server action `uploadAttachment` gains an optional `title` field, normalised by a shared client-safe helper that `setAttachmentTitle` also uses. On the client a new `useStagedUploads` hook + `StagedUploadTray` component (own file) owns the tray state and the sequential upload loop; `AttachmentList` wires its file input and drop targets into it. One `uploadAttachment` request per file — no new endpoint.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching server-action conventions), React 19, Prisma, Vitest + Testing Library + user-event.

**Spec:** `docs/specs/2026-11-11-multi-file-upload.md` — read it before your task. Glossary: `CONTEXT.md` **Attachment**.

## Global Constraints

- Verification per task: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Inner loop: `npx vitest run <test file>`. Never run the full suite or `next build` per task.
- Zero comments unless the WHY is non-obvious; no JSDoc on new code. Match the local style of the file you're in.
- Server actions keep the ADR 0074 failure contract: refusals via `formFail(message)` from `@/lib/action-result`.
- Title rules (exact): trimmed; empty/whitespace → `null`; longer than 120 characters → refused with `"Title must be 120 characters or fewer."`.
- The stored `filename` is never changed by a title.
- No schema change — `Attachment.title` already exists.
- Every button in `AttachmentList` / the tray is `type="button"`: the list renders inside entity dialogs' `<form>`s.
- Do not commit `AGENTS.md` (untracked, not ours). Stage files by explicit path, never `git add -A` / `git add .`.
- Never run `feedback:pull`, `feedback:resolve` or `feedback:accept`, and never load `.env.production.local`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Server rejects a file mid-batch** (2nd of 3 over quota) — the 1st leaves the tray, the 2nd stays with the server's message, the 3rd still uploads. Task 2 test.
2. **Enter in a Title box inside an entity dialog's `<form>`** — must not submit the form. Task 2 test.
3. **Whitespace-only title** — stored as no title; the Activity line falls back to the filename. Task 1 test.
4. **A dropped file of a disallowed type** — `accept` does not filter drops; the row shows the type error and the file is never sent. Task 3 test.
5. **Highlight stuck after a drop** — the drop target's dragging state clears on drop, not only on dragleave. Task 3 test.

---

### Task 1: `uploadAttachment` accepts an optional title

**Files:**
- Modify: `lib/attachment-name.ts` (add the normaliser + max)
- Modify: `server/actions/attachments.ts` (`uploadAttachment` both paths; `setAttachmentTitle` reuses the normaliser, drop its local `TITLE_MAX`)
- Modify: `lib/attachment-create.ts` (`createAttachmentFromFile` opts gains `title?: string | null`, written to the row)
- Test: `server/actions/attachments.test.ts`, `lib/attachment-name` tests if a test file exists beside it (else add cases to the action tests only)

**Interfaces:**
- Produces: `export const ATTACHMENT_TITLE_MAX = 120;` and `export function normalizeAttachmentTitle(raw: unknown): { ok: true; title: string | null } | { ok: false; error: string }` in `lib/attachment-name.ts`. Non-string `raw` (e.g. `null` from `formData.get`) → `{ ok: true, title: null }`.
- Produces: `uploadAttachment(formData)` reads `formData.get("title")`. Task 2 sends it as the `"title"` field.

- [ ] **Step 1: Write the failing tests** in `server/actions/attachments.test.ts` `describe("uploadAttachment")`, using the file's existing `makeFormData` helper and mocks:
  - `"stores a trimmed title on the trip attachment row"` — `fd.set("title", "  Louvre tickets  ")`; `attachmentCreateMock` called with `data: expect.objectContaining({ title: "Louvre tickets", filename: "test.pdf" })`.
  - `"stores a title on a globe attachment row"` — globe FormData as in the existing marker test plus `title: "Museum pass"`; `attachmentCreateMock` data contains `title: "Museum pass"`.
  - `"stores no title when the title is blank or whitespace"` — `title: "   "`; create data contains `title: null`; `recordActivityMock` called with `changes: { excerpt: "test.pdf" }` and `entityLabel: "test.pdf"`.
  - `"refuses a title over 120 characters and writes nothing"` — `title: "x".repeat(121)`; result `success: false` with message `"Title must be 120 characters or fewer."` (match the shape the existing refusal tests assert); `attachmentCreateMock` and `storageSaveMock` not called.
  - `"names the activity by the title when one is given"` — file `boarding.pdf`, `title: "Flight to Rome"`; `recordActivityMock` called with `entityLabel: "Flight to Rome"`, `changes: { excerpt: "Flight to Rome" }`.
  - Keep the existing `"logs a CREATED attachment activity"` test passing unchanged (no title → filename).

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run server/actions/attachments.test.ts`
Expected: the five new tests FAIL; existing tests pass.

- [ ] **Step 3: Implement**
  - `normalizeAttachmentTitle` + `ATTACHMENT_TITLE_MAX` in `lib/attachment-name.ts`.
  - `uploadAttachment`: normalise the title immediately after the access check and before `validateUpload`/quota/`arrayBuffer` in **both** paths (refuse early, write nothing). Globe path: pass `title` into its `db.attachment.create` data. Trip path: pass `title` to `createAttachmentFromFile`; the Activity's `entityLabel` and `changes.excerpt` become `attachmentName({ filename: file.name, title })`.
  - `createAttachmentFromFile`: write `title: opts.title ?? null` on create. Other callers (Item photo) pass nothing.
  - `setAttachmentTitle`: replace its inline trim/length logic with `normalizeAttachmentTitle`, same behaviour and message.

- [ ] **Step 4: Run and confirm they pass**

Run: `npx vitest run server/actions/attachments.test.ts`
Expected: PASS. Then the task-done tier on `lib/attachment-name.ts server/actions/attachments.ts lib/attachment-create.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/attachment-name.ts lib/attachment-create.ts server/actions/attachments.ts server/actions/attachments.test.ts
git commit -m "feat(attachments): optional title on upload"
```

---

### Task 2: Multi-select + staging tray in `AttachmentList`

**Files:**
- Create: `lib/attachment-mimes.ts`
- Modify: `lib/storage.ts:359-366` (`ALLOWED_MIMES = new Set(ATTACHMENT_MIMES)`)
- Create: `components/trip/staged-upload-tray.tsx`
- Modify: `components/trip/attachment-list.tsx`
- Test: `components/trip/attachment-list.test.tsx`

**Interfaces:**
- Consumes: Task 1's `"title"` FormData field and `ATTACHMENT_TITLE_MAX` from `@/lib/attachment-name`.
- Produces in `lib/attachment-mimes.ts`: `export const ATTACHMENT_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"] as const;` and `export function isAttachmentMime(mime: string): boolean`. The file input's `accept` becomes `ATTACHMENT_MIMES.join(",")`.
- Produces in `components/trip/staged-upload-tray.tsx`:
  - `export interface StagedFile { key: string; file: File; title: string; error: string | null }` — `file` is the post-compression file.
  - `export function useStagedUploads(target: { tripId?: string; globeId?: string; targetType: TargetType; targetId?: string }): { staged: StagedFile[]; validCount: number; uploading: boolean; addFiles: (files: File[]) => Promise<void>; setTitle: (key: string, title: string) => void; remove: (key: string) => void; uploadAll: () => void }`
  - `export function StagedUploadTray({ tray, compact }: { tray: ReturnType<typeof useStagedUploads>; compact: boolean }): React.ReactElement | null` — renders nothing when `staged` is empty.
  - Task 3 calls `tray.addFiles` and reads `tray.uploading`.

Behaviour (spec §Staging tray):
- `addFiles`: per file — not `isAttachmentMime(file.type)` → row with error `"Only PDFs, photos or text files can be added."` (no compression); else `compressImage` then `oversizeUploadMessage(compressed)` as the row error (null when fine). Appends; never replaces existing rows.
- `validCount` = rows with `error === null`.
- `uploadAll` (inside a transition): for each row with `error === null`, in order, one `uploadAttachment` call with the same tripId/globeId/targetType/targetId fields the current code sends, `file`, and `title`. Success → remove the row. Failure → set that row's error to `firstErrorMessage(result, "Couldn't upload that file.")` and carry on with the next row. A thrown call is treated the same as a failure.
- Tray UI: heading `"Ready to add"`; per row the filename, `mimeLabel`-style type and `formatBytes` size, a text input (`aria-label={\`Title for ${file.name}\`}`, `placeholder={file.name}`, `maxLength={ATTACHMENT_TITLE_MAX}`, disabled while uploading; Enter → `preventDefault()`), a remove button (`aria-label={\`Remove ${file.name}\`}`), and the row error as `<p role="alert">`. Footer button: `validCount === 0` → `"Add files"` disabled; else `` `Add ${n} file${n === 1 ? "" : "s"}` ``; disabled while uploading. All buttons `type="button"`. Use the existing `Button`/`Input` primitives from `@/components/ui`; `compact` picks the denser text sizes the compact list uses.
- `AttachmentList`: file input gets `multiple`; `onChange` calls `tray.addFiles(Array.from(e.target.files ?? []))` and resets `e.target.value = ""` immediately. Remove the old single-file `handleFileChange` and the list-level `uploadError` alert (errors live on rows now). `uploading` reads `tray.uploading`. Tray placement: full layout — directly above the file grid; compact — directly under the upload button. Copy: full tile heading `"Tap or drop files"` (`"Uploading…"` while uploading), hint `"PDF, photos or text, up to 4 MB each"`; compact button label `"Add files"`.

- [ ] **Step 1: Update and add tests** in `components/trip/attachment-list.test.tsx`:
  - Update the existing globe/trip upload tests and `"compresses an image before uploading it"`: after `user.upload`, `uploadAttachment` is **not** called until `user.click(screen.getByRole("button", { name: "Add 1 file" }))`; then the same FormData assertions hold.
  - Update `"shows a full dropzone in non-compact mode"`: text `/tap or drop files/i`; drop the stale "nothing handles a drop" comment.
  - Keep `"shows the oversize message and never calls the server…"` (alert text `/~4 MB/` appears on staging; the Add button reads "Add files" and is disabled).
  - `"stages several picked files with a title box each, filename as placeholder"` — upload two files; two textboxes named `Title for a.pdf` / `Title for b.jpg` with those placeholders; button `"Add 2 files"`; input has the `multiple` attribute.
  - `"sends each file in its own request with its title, in order"` — type `"Flight"` into `Title for a.pdf`, leave b blank, click `"Add 2 files"`; two `uploadAttachment` calls; call 1 `title` = `"Flight"`, `file.name` = `a.pdf`; call 2 file `b.jpg` and a blank/absent title; tray heading `"Ready to add"` is gone afterwards.
  - `"refuses a disallowed type on staging and never sends it"` — `user.upload` with `{ applyAccept: false }` setup and a `video/mp4` file plus a PDF; the mp4 row shows `"Only PDFs, photos or text files can be added."`; button `"Add 1 file"`; after clicking, exactly one call, for the PDF.
  - `"keeps a server-rejected file in the tray with its reason and still uploads the rest"` (Review Focus 1) — three PDFs; `uploadAttachment` mocked success / `{ success: false, … }` refusal whose message is `"This trip is out of space."` (use the shape `firstErrorMessage` reads) / success; after Add: 3 calls; only the 2nd file's row remains, showing that message; button `"Add 1 file"`.
  - `"remove takes a file out of the tray"` — stage two, click `Remove a.pdf`; button `"Add 1 file"`.
  - `"Enter in a title box and the tray's buttons never submit a surrounding form"` (Review Focus 2) — render inside `<form onSubmit={spy}>` (compact and full via `it.each` like the existing form test); type `"x{Enter}"` in the title box, click Remove on one row and Add on the other; `spy` not called.
  - `"resets the file input so the same file can be picked again"` — after `user.upload`, the input's `value` is `""`.

- [ ] **Step 2: Run and confirm the new/updated tests fail**

Run: `npx vitest run components/trip/attachment-list.test.tsx`
Expected: new and updated tests FAIL; untouched tests pass.

- [ ] **Step 3: Implement** `lib/attachment-mimes.ts`, the `lib/storage.ts` reuse, `components/trip/staged-upload-tray.tsx`, and the `AttachmentList` wiring as specified above.

- [ ] **Step 4: Run and confirm they pass**

Run: `npx vitest run components/trip/attachment-list.test.tsx`
Expected: PASS. Then the task-done tier on `lib/attachment-mimes.ts lib/storage.ts components/trip/staged-upload-tray.tsx components/trip/attachment-list.tsx`.

- [ ] **Step 5: Commit**

```bash
git add lib/attachment-mimes.ts lib/storage.ts components/trip/staged-upload-tray.tsx components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx
git commit -m "feat(attachments): pick several files and title them before upload"
```

---

### Task 3: Drag-and-drop onto the upload targets

**Files:**
- Modify: `components/trip/attachment-list.tsx`
- Test: `components/trip/attachment-list.test.tsx`

**Interfaces:**
- Consumes: `tray.addFiles(files: File[])`, `tray.uploading` from Task 2.

Behaviour: the full-layout upload tile `<label>` and the compact `"Add files"` `<label>` are drop targets. `onDragOver`: `preventDefault()`; when not uploading set dragging true. `onDragLeave`: dragging false. `onDrop`: `preventDefault()`, dragging false, and when not uploading `tray.addFiles(Array.from(e.dataTransfer.files))`. While dragging the label carries `data-dragging="true"` and a visible highlight (border `border-primary` plus a tinted background, matching `components/new-trip/step-cover.tsx`'s dragging style); otherwise no `data-dragging` attribute.

- [ ] **Step 1: Write the failing tests** (use `fireEvent.dragOver` / `fireEvent.drop` with `{ dataTransfer: { files: [...] } }` on the label found via its text):
  - `it.each` compact/full: `"dropping files onto the upload target stages them"` — drop `a.pdf` and `b.png`; button `"Add 2 files"`; `uploadAttachment` not called.
  - `"highlights the target while dragging and clears it on drop"` (Review Focus 5) — after `dragOver` the label has `data-dragging="true"`; after `drop` it has no `data-dragging` attribute.
  - `"a dropped file of a disallowed type is refused on its row"` (Review Focus 4) — drop a `video/mp4`; its row shows `"Only PDFs, photos or text files can be added."`; Add button disabled.
  - `"dragleave clears the highlight"` — `dragOver` then `dragLeave`; no `data-dragging`.

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run components/trip/attachment-list.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the handlers and dragging state in `components/trip/attachment-list.tsx`.

- [ ] **Step 4: Run and confirm they pass**

Run: `npx vitest run components/trip/attachment-list.test.tsx`
Expected: PASS. Then the task-done tier on `components/trip/attachment-list.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx
git commit -m "feat(attachments): drag and drop files onto the upload target"
```

---

### Branch done

Once all tasks pass review: `npm test` + `npm run build` + `npm run test:integration` (when the local DB is up). Report results faithfully.
