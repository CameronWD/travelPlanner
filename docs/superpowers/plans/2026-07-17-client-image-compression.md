# Client-Side Image Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Downscale + compress cover photos and journal photos to WebP in the browser before upload, so large phone photos don't slow the app or strain the (in-memory) serve path. Attachments are deliberately left uncompressed.

**Architecture:** One shared browser util `compressImage(file)` wrapping `browser-image-compression` (lazy-imported). Three client upload handlers call it before uploading; the attachment-list handler does not. No server changes — the server already accepts `image/webp`, and `validateUpload` (10 MB) + the 12 MB server-action body limit stay as the safety backstop.

**Tech Stack:** Next.js (client components), TypeScript, `browser-image-compression@^2`, Vitest + @testing-library/react + user-event (jsdom).

## Global Constraints

- **New dependency:** `browser-image-compression` (^2.x). Confirmed reachable on npm (2.0.2). Cam approved adding it.
- **Lazy import only.** `browser-image-compression` touches `window`/`Worker`; it MUST be imported via dynamic `await import("browser-image-compression")` *inside* the async function, NEVER at module top level, or SSR/`next build` can throw. This failure is invisible to tsc/eslint/vitest — do not regress it.
- **Compression never blocks an upload.** Any failure (decode error, HEIC, no worker) → return the original file. Never throw to the caller.
- **Scope — compress in exactly these 3 handlers:** `app/(app)/trips/new/new-trip-form.tsx` (cover), `components/trip/settings/cover-image-field.tsx` (cover), `components/trip/journal-editor.tsx` (journal photo). **Do NOT modify `components/trip/attachment-list.tsx`** — attachments (tickets/passport scans) stay pristine.
- **Compression params:** WebP output, `maxWidthOrHeight: 2048`, `maxSizeMB: 1`, `initialQuality: 0.82`, `useWebWorker: true`. Non-images and `image/gif` pass through untouched. If the compressed result isn't strictly smaller than the original (or is empty), keep the original.
- **No server changes.** Do not touch `validateUpload`, `next.config.ts`, or any server action. The 10 MB cap and 12 MB body limit remain the backstop.
- **Verification reality (BLIND BUILD):** the lib is mocked in jsdom, so tests prove wiring only — NOT that compression runs in a real browser or that quality is acceptable. That is Cam's local check. Do not claim the feature "works" from a green suite.
- **Environment:** Node ≥22 for vitest/npm — prefix npx/npm with `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use`. Do NOT run `next build`/`next dev` (no DB/browser). Gates: `npx tsc --noEmit` + `npx eslint <files>` + `npx vitest run <focused>` then full. Commit only on the feature branch; never `git add` under `.superpowers/`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Add dependency + `compressImage` util

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Create: `lib/image-compress.ts`
- Test: `lib/image-compress.test.ts`

**Interfaces:**
- Produces: `export async function compressImage(file: File): Promise<File>` — returns a compressed WebP `File` for compressible images, or the original `File` unchanged for non-images, GIFs, failures, or when compression wouldn't be smaller.

- [ ] **Step 1: Install the dependency**

Run (node 22 via nvm):
```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use
npm install browser-image-compression@^2.0.2
```
Expected: `package.json` gains the dep, `package-lock.json` updates, `node_modules/browser-image-compression` exists. Confirm the default export shape:
```bash
node -e "console.log(typeof require('browser-image-compression').default)"
```
Expected: `function`. (v2 default export is `imageCompression(file, options)`.) If the shape differs, adapt the util's import accordingly and note it in the report.

- [ ] **Step 2: Write the failing test**

```ts
// lib/image-compress.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const imageCompressionMock = vi.fn();
vi.mock("browser-image-compression", () => ({ default: imageCompressionMock }));

import { compressImage } from "./image-compress";

function makeFile(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("compressImage", () => {
  beforeEach(() => imageCompressionMock.mockReset());

  it("passes non-image files through untouched", async () => {
    const pdf = makeFile(100, "ticket.pdf", "application/pdf");
    const out = await compressImage(pdf);
    expect(out).toBe(pdf);
    expect(imageCompressionMock).not.toHaveBeenCalled();
  });

  it("passes animated GIFs through untouched", async () => {
    const gif = makeFile(100, "anim.gif", "image/gif");
    const out = await compressImage(gif);
    expect(out).toBe(gif);
    expect(imageCompressionMock).not.toHaveBeenCalled();
  });

  it("compresses an image to a smaller .webp file", async () => {
    const jpg = makeFile(5000, "photo.jpg", "image/jpeg");
    imageCompressionMock.mockResolvedValue(
      new File([new Uint8Array(500)], "photo.jpg", { type: "image/webp" }),
    );
    const out = await compressImage(jpg);
    expect(imageCompressionMock).toHaveBeenCalledWith(
      jpg,
      expect.objectContaining({
        maxWidthOrHeight: 2048,
        maxSizeMB: 1,
        useWebWorker: true,
        fileType: "image/webp",
        initialQuality: 0.82,
      }),
    );
    expect(out).not.toBe(jpg);
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("photo.webp");
    expect(out.size).toBeLessThan(jpg.size);
  });

  it("keeps the original when the compressed result would be larger", async () => {
    const jpg = makeFile(300, "small.jpg", "image/jpeg");
    imageCompressionMock.mockResolvedValue(
      new File([new Uint8Array(9000)], "small.jpg", { type: "image/webp" }),
    );
    const out = await compressImage(jpg);
    expect(out).toBe(jpg);
  });

  it("falls back to the original when compression throws", async () => {
    const jpg = makeFile(5000, "photo.jpg", "image/jpeg");
    imageCompressionMock.mockRejectedValue(new Error("decode failed"));
    const out = await compressImage(jpg);
    expect(out).toBe(jpg);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/image-compress.test.ts`
Expected: FAIL — cannot resolve `./image-compress` / `compressImage is not defined`.

- [ ] **Step 4: Write the implementation**

```ts
// lib/image-compress.ts
const MAX_DIMENSION = 2048;
const TARGET_MB = 1;
const QUALITY = 0.82;

/** Replace a filename's extension with `.webp` (or append if none). */
function toWebpName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "image"}.webp`;
}

/**
 * Downscale + compress an image `File` to WebP in the browser before upload.
 *
 * Non-images (PDF/text) and animated GIFs pass through untouched. Any failure
 * (decode error, unsupported format like HEIC, no Worker) falls back to the
 * original file — this never throws and never blocks an upload. The server's
 * `validateUpload` size/mime check remains the backstop.
 *
 * `browser-image-compression` is imported lazily (it touches window/Worker and
 * must not be evaluated during SSR/build).
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file; // PDFs, text, etc.
  if (file.type === "image/gif") return file; // preserve animation

  try {
    const imageCompression = (await import("browser-image-compression")).default;
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: MAX_DIMENSION,
      maxSizeMB: TARGET_MB,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: QUALITY,
    });
    const out = new File([compressed], toWebpName(file.name), { type: "image/webp" });
    return out.size > 0 && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/image-compress.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit` (expect no new errors) and `npx eslint lib/image-compress.ts lib/image-compress.test.ts` (expect clean).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/image-compress.ts lib/image-compress.test.ts
git commit -m "feat(upload): add client-side image compression util"
```

---

### Task 2: Wire `compressImage` into the three upload handlers

**Files:**
- Modify: `app/(app)/trips/new/new-trip-form.tsx`
- Modify: `components/trip/settings/cover-image-field.tsx`
- Modify: `components/trip/journal-editor.tsx`
- Test: `components/trip/settings/cover-image-field.test.tsx` (exists — keep green + add one), `components/trip/journal-editor.test.tsx` (exists — keep green + add one)

**Interfaces:**
- Consumes: `compressImage` from `@/lib/image-compress` (Task 1).

**Do NOT touch `components/trip/attachment-list.tsx`.**

- [ ] **Step 1: Add failing integration tests**

For `components/trip/settings/cover-image-field.test.tsx` — first read the file to reuse its existing mock setup (it already mocks `@/server/actions/cover`). Add a mock for the util and a test. If the file's `setTripCover` mock returns a value, keep that; assert the file forwarded is the compressed one:

```tsx
import userEvent from "@testing-library/user-event";

// Mock the compressor to return a sentinel webp file, so we assert wiring only.
vi.mock("@/lib/image-compress", () => ({
  compressImage: vi.fn(async () => new File([new Uint8Array(10)], "photo.webp", { type: "image/webp" })),
}));

// (Reuse the file's existing vi.mock("@/server/actions/cover", ...) — capture setTripCover.)

it("compresses the selected file before calling setTripCover", async () => {
  const user = userEvent.setup();
  const { setTripCover } = await import("@/server/actions/cover");
  (setTripCover as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

  render(<CoverImageField tripId="t1" hasCover={false} />);
  const input = screen.getByLabelText(/cover photo/i, { selector: "input[type=file]" })
    ?? document.querySelector('input[type="file"]')!;
  await user.upload(input as HTMLElement, new File([new Uint8Array(5000)], "big.jpg", { type: "image/jpeg" }));

  const { compressImage } = await import("@/lib/image-compress");
  expect(compressImage).toHaveBeenCalled();
  const fd = (setTripCover as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
  const sent = fd.get("file") as File;
  expect(sent.type).toBe("image/webp");
});
```

> Note: adapt the file-input query and the server-action mock capture to the file's actual conventions (read it first). The essential assertion: `compressImage` is called and the `File` handed to `setTripCover` is the compressed (webp) one.

Add the analogous test to `components/trip/journal-editor.test.tsx`, mocking `@/lib/image-compress` and capturing `uploadAttachment` from the file's existing `@/server/actions/attachments` mock; assert the `file` in the FormData passed to `uploadAttachment` is the compressed webp sentinel. Reuse the file's existing render props.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/trip/settings/cover-image-field.test.tsx components/trip/journal-editor.test.tsx`
Expected: the new tests FAIL (compressImage not yet called; forwarded file is the raw jpeg).

- [ ] **Step 3: Wire `new-trip-form.tsx`**

Add import: `import { compressImage } from "@/lib/image-compress";`
In `handleSubmit`, compress inside the transition before `createTrip`:

```tsx
    startTransition(async () => {
      const rawCover = coverFile && coverFile.size > 0 ? coverFile : null;
      const cover = rawCover ? await compressImage(rawCover) : null;
      const result = await createTrip(input, cover);
      if (!result.success) {
        setErrors(result.errors);
      }
    });
```
(Remove the old inline `coverFile && coverFile.size > 0 ? coverFile : null` argument now that `cover` holds it.)

- [ ] **Step 4: Wire `cover-image-field.tsx`**

Add import: `import { compressImage } from "@/lib/image-compress";`
Rewrite `onFile` to compress inside the transition and build the FormData from the compressed file:

```tsx
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      try {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.set("tripId", tripId);
        fd.set("file", compressed);
        const r = await setTripCover(fd);
        if (!r.success) toast({ variant: "destructive", title: r.error });
        else router.refresh();
      } catch {
        toast({ variant: "destructive", title: "Upload failed — the image may be too large (max 10 MB)." });
      }
    });
  }
```

- [ ] **Step 5: Wire `journal-editor.tsx`**

Add import: `import { compressImage } from "@/lib/image-compress";`
Rewrite `handleFileChange` to compress inside the transition and build FormData from the compressed file:

```tsx
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    startTransition(async () => {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.set("tripId", tripId);
      fd.set("targetType", "JOURNAL");
      fd.set("targetId", date);
      fd.set("file", compressed);
      const result = await uploadAttachment(fd);
      if (!result.success) {
        setUploadError(result.error);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }
```

- [ ] **Step 6: Run the touched test files**

Run: `npx vitest run components/trip/settings/cover-image-field.test.tsx components/trip/journal-editor.test.tsx`
Expected: PASS — the new tests plus all pre-existing tests in both files. Do NOT weaken any pre-existing assertion; if one breaks unexpectedly, report BLOCKED.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit` (no new errors) and
`npx eslint app/\(app\)/trips/new/new-trip-form.tsx components/trip/settings/cover-image-field.tsx components/trip/journal-editor.tsx components/trip/settings/cover-image-field.test.tsx components/trip/journal-editor.test.tsx` (clean).

- [ ] **Step 8: Confirm attachment-list is untouched**

Run: `git diff --name-only` — `components/trip/attachment-list.tsx` must NOT appear.

- [ ] **Step 9: Commit**

```bash
git add app/\(app\)/trips/new/new-trip-form.tsx components/trip/settings/cover-image-field.tsx components/trip/journal-editor.tsx components/trip/settings/cover-image-field.test.tsx components/trip/journal-editor.test.tsx
git commit -m "feat(upload): compress covers and journal photos before upload"
```

---

### Task 3: Whole-feature verification

**Files:** none (verification only; may add nothing).

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: PASS (whole suite green, including the pre-existing cover-image-field and journal-editor tests).

- [ ] **Step 2: Typecheck + lint (whole)**

Run: `npx tsc --noEmit` (exit 0) and `npx eslint lib/image-compress.ts app/\(app\)/trips/new/new-trip-form.tsx components/trip/settings/cover-image-field.tsx components/trip/journal-editor.tsx` (exit 0).

- [ ] **Step 3: Confirm scope boundaries**

- `git diff --stat main..HEAD` should show ONLY: `package.json`, `package-lock.json`, `lib/image-compress.ts(+test)`, the three handler files (+2 test files). `attachment-list.tsx` must be absent, and no server file (`server/actions/*`, `next.config.ts`, `lib/storage.ts`) may appear.
- Grep the util for a top-level import of the lib (must be none — lazy only): `grep -n "browser-image-compression" lib/image-compress.ts` should show it only inside the `await import(...)`.

- [ ] **Step 4: Record the Cam-local check**

State in the report that the actual browser behaviour — that compression runs, produces a valid WebP, and looks acceptable — is Cam's local check (`npm run dev`: create a trip with a large photo cover; change a cover in settings; add a journal photo; confirm each uploads, renders, and that the network payload is small). The green suite does NOT prove this.

## Self-Review

**Spec coverage:**
- Shared util with lazy import, WebP, params, GIF/non-image pass-through, error/larger fallback → Task 1. ✓
- Covers (new-trip + settings) + journal compress before upload → Task 2. ✓
- Attachments NOT compressed → Task 2 Step 8 + Task 3 Step 3. ✓
- New dep added → Task 1 Step 1. ✓
- No server changes → Task 3 Step 3 (diff excludes server files). ✓
- Verification reality flagged → Task 3 Step 4. ✓

**Placeholder scan:** No TBD/TODO. Util + edits are complete code. Integration-test snippets instruct reading the existing test files for exact mock/query conventions — deliberate (those files own the conventions), not a placeholder.

**Type consistency:** `compressImage(file: File): Promise<File>` used identically in all three handlers. Options object matches the util and the test's `expect.objectContaining`.
