# Upload Compression & Honest Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phone photos upload reliably everywhere, and upload failures tell the truth: the Files/attachments surface gains the same client-side compression the journal/cover surfaces already have, oversize files get an accurate client-side message instead of a doomed request, and a cover-upload storage failure returns a real error instead of a thrown exception mislabeled as "too large".

**Architecture:** One shared helper in `lib/image-compress.ts` (`oversizeUploadMessage`) encodes the practical browser-upload ceiling (Vercel serverless functions reject request bodies over ~4.5 MB — far below the app's 10 MB `validateUpload` cap, so an oversize FormData dies at the platform edge and the client sees an opaque throw). Each upload surface compresses first, then consults the helper before sending. `setTripCover` gets the same catch-and-return storage-failure handling `uploadAttachment` got in the previous round (blob-first order means there is nothing to clean up — just return the error).

**Tech Stack:** Next.js 16 App Router server actions, React 19 client components, `browser-image-compression` (already a dependency, used via `lib/image-compress.ts`), Vitest + Testing Library + userEvent.

## Global Constraints

- Branch: work happens on `fix/upload-compression` (already checked out). NEVER commit to `main`, never merge, never deploy.
- TDD: every behavior change lands with a test that fails before and passes after; capture RED/GREEN evidence.
- Exact copy strings below are verbatim requirements — including the em dashes.
- Vocabulary per `CONTEXT.md`: "Traveller" not "user"; Attachment/Journal are the app's terms. Conventional commits matching repo history.
- Test conventions: partial-module mock for `@/lib/image-compress` must keep the real `oversizeUploadMessage` (use `importOriginal` spread, mock only `compressImage`) — the helper is pure and should be exercised for real in component tests.
- Sandbox has no DB/storage credentials; all tests mock at module boundaries. Per-task: run the named test file(s); before each commit run `npx tsc --noEmit`. The finisher runs full `npx vitest run` + lint.
- Out of scope (deliberate): `app/(app)/trips/new/new-trip-form.tsx` keeps its current behavior — its optional cover is compressed already, and wiring the oversize message into that form's field-error UI is a separate piece of work. Do not touch it.

---

### Task 1: `oversizeUploadMessage` helper in `lib/image-compress.ts`

**Files:**
- Modify: `lib/image-compress.ts`
- Test: `lib/image-compress.test.ts` (exists — extend)

**Interfaces:**
- Produces (Tasks 2–4 consume verbatim):
  - `export const MAX_BROWSER_UPLOAD_BYTES = 4 * 1024 * 1024;`
  - `export function oversizeUploadMessage(file: File): string | null` — `null` when `file.size <= MAX_BROWSER_UPLOAD_BYTES`, otherwise an accurate user-facing message.

- [ ] **Step 1: Write the failing tests**

Append to the existing describe structure in `lib/image-compress.test.ts` (match the file's existing import/style conventions — read it first):

```ts
describe("oversizeUploadMessage", () => {
  it("returns null for a file at or under the cap", () => {
    const small = new File([new Uint8Array(1024)], "a.webp", { type: "image/webp" });
    expect(oversizeUploadMessage(small)).toBeNull();
  });

  it("names the size and suggests alternatives for an oversize image", () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024)], "big.heic", { type: "image/heic" });
    const msg = oversizeUploadMessage(big);
    expect(msg).toMatch(/5\.0 MB/);
    expect(msg).toMatch(/couldn't be shrunk/i);
  });

  it("uses the non-image wording for an oversize PDF", () => {
    const pdf = new File([new Uint8Array(6 * 1024 * 1024)], "doc.pdf", { type: "application/pdf" });
    const msg = oversizeUploadMessage(pdf);
    expect(msg).toMatch(/6\.0 MB/);
    expect(msg).toMatch(/smaller copy/i);
    expect(msg).not.toMatch(/shrunk/i);
  });
});
```

Add `oversizeUploadMessage` to the test file's import from `./image-compress`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/image-compress.test.ts`
Expected: FAIL — `oversizeUploadMessage` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `lib/image-compress.ts`:

```ts
/**
 * Practical ceiling for a browser upload. Vercel serverless functions reject
 * request bodies over ~4.5 MB regardless of the app's own 10 MB
 * `validateUpload` cap, so a bigger FormData never reaches the server action —
 * it dies at the platform edge as an opaque thrown error. Checking here, after
 * compression, turns that into an accurate message instead of a doomed request.
 */
export const MAX_BROWSER_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Accurate "too big to upload" copy for a file that is about to be sent, or
 * null when it fits. Call AFTER compressImage — an image that reaches here
 * oversize is one the browser could not decode/shrink (e.g. HEIC outside
 * Safari), which is exactly what the image wording explains.
 */
export function oversizeUploadMessage(file: File): string | null {
  if (file.size <= MAX_BROWSER_UPLOAD_BYTES) return null;
  const mb = (file.size / 1024 / 1024).toFixed(1);
  return file.type.startsWith("image/")
    ? `This image is ${mb} MB and couldn't be shrunk in this browser — more than the ~4 MB the app can upload. Try a smaller copy or a JPEG/PNG version.`
    : `This file is ${mb} MB — more than the ~4 MB the app can upload. Try a smaller copy.`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/image-compress.test.ts`
Expected: PASS (new tests plus all pre-existing tests in the file).

- [ ] **Step 5: Commit**

```bash
git add lib/image-compress.ts lib/image-compress.test.ts
git commit -m "feat(uploads): name the real browser upload ceiling in one helper"
```

---

### Task 2: Files/attachments surface compresses images and pre-checks size

**Files:**
- Modify: `components/trip/attachment-list.tsx` (the `handleFileChange` function, ~lines 111–133)
- Test: `components/trip/attachment-list.test.tsx` (exists — extend)

**Interfaces:**
- Consumes: `compressImage(file: File): Promise<File>` and `oversizeUploadMessage(file: File): string | null` from `@/lib/image-compress` (Task 1).

**Context:** This is the one upload surface that sends raw files — trip Files AND Globe marker attachments both render through it. The journal editor (`components/trip/journal-editor.tsx:44-61`) shows the target shape: compress inside the transition, then build FormData. The component already has an `uploadError` state + `inputRef` reset idiom — reuse both.

- [ ] **Step 1: Write the failing tests**

In `components/trip/attachment-list.test.tsx`, add a partial mock for the compressor near the existing `vi.mock` calls (top of file, before imports of the mocked modules):

```ts
vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});
```

and `import { compressImage } from "@/lib/image-compress";` alongside the other post-mock imports. Then add:

```tsx
it("compresses an image before uploading it", async () => {
  const user = userEvent.setup();
  const compressed = new File([new Uint8Array(10)], "photo.webp", { type: "image/webp" });
  vi.mocked(compressImage).mockResolvedValueOnce(compressed);
  const { container } = render(
    <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />,
  );

  const raw = new File([new Uint8Array(5000)], "big.jpg", { type: "image/jpeg" });
  await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, raw);

  expect(compressImage).toHaveBeenCalledWith(raw);
  const fd = vi.mocked(uploadAttachment).mock.calls[0][0] as FormData;
  expect((fd.get("file") as File).name).toBe("photo.webp");
});

it("shows the oversize message and never calls the server when compression can't fit the cap", async () => {
  const user = userEvent.setup();
  const stillHuge = new File([new Uint8Array(5 * 1024 * 1024)], "big.heic", { type: "image/heic" });
  vi.mocked(compressImage).mockResolvedValueOnce(stillHuge);
  const { container } = render(
    <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />,
  );

  await user.upload(
    container.querySelector('input[type="file"]') as HTMLInputElement,
    new File([new Uint8Array(10)], "big.heic", { type: "image/heic" }),
  );

  expect(await screen.findByText(/~4 MB/)).toBeInTheDocument();
  expect(uploadAttachment).not.toHaveBeenCalled();
});
```

(If the file's existing tests use a shared upload helper instead of inline `user.upload`, follow the file's own idiom — the assertions are the requirement, not the exact plumbing. Check how `uploadError` renders — if it isn't plain text, target it the way the file's existing failure-path tests do; if none exist, `findByText` on a regex is fine.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trip/attachment-list.test.tsx`
Expected: FAIL — `compressImage` is never called (first test); the oversize path uploads anyway (second test). Pre-existing tests must still pass (the passthrough mock keeps their raw-file expectations intact — if any pre-existing test asserts the exact uploaded File instance, confirm it still holds under passthrough).

- [ ] **Step 3: Implement**

In `components/trip/attachment-list.tsx`, add the import:

```ts
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
```

Replace the body of `handleFileChange` with:

```tsx
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    startTransition(async () => {
      // Phone photos routinely exceed the upload cap raw; shrink images
      // client-side first (non-images pass through untouched).
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        setUploadError(oversize);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      const fd = new FormData();
      if (tripId) fd.set("tripId", tripId);
      if (globeId) fd.set("globeId", globeId);
      fd.set("targetType", targetType);
      if (targetId) fd.set("targetId", targetId);
      fd.set("file", compressed);

      const result = await uploadAttachment(fd);
      if (!result.success) {
        setUploadError(result.error);
      }
      // Reset the file input so the same file can be re-selected after an error.
      if (inputRef.current) inputRef.current.value = "";
    });
  }
```

(The FormData construction moves inside the transition because compression is async; behavior is otherwise identical.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/trip/attachment-list.test.tsx`
Expected: PASS — new and all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx
git commit -m "fix(attachments): compress images client-side on the Files surface"
```

---

### Task 3: Cover upload — honest failures end to end

**Files:**
- Modify: `server/actions/cover.ts` (`setTripCover`, the `storage.save` call ~line 47)
- Modify: `components/trip/settings/cover-image-field.tsx` (the `onFile` handler)
- Test: `server/actions/cover.test.ts` (exists — extend)
- Create: `components/trip/settings/cover-image-field.test.tsx`

**Interfaces:**
- Consumes: `compressImage` / `oversizeUploadMessage` from `@/lib/image-compress` (Task 1).
- Produces: `setTripCover` on storage-write failure now RETURNS `{ success: false, error: "Upload failed — nothing was saved. Please try again." }` (same copy as `uploadAttachment`) instead of throwing.

**Context:** This is the bug the owner actually hit: `setTripCover` has no try/catch around `storage.save`, so any storage failure throws out of the server action, and the client's catch shows a hardcoded toast blaming file size. Blob-first ordering means a failed save needs no cleanup — the Trip row hasn't been touched yet.

- [ ] **Step 1: Write the failing server test**

In `server/actions/cover.test.ts`, inside `describe("setTripCover")` (reuse the file's existing FormData/fixture helpers — read how the happy-path test at ~line 116 builds its FormData and mirror it):

```ts
it("returns a friendly failure and leaves the trip untouched when the blob write fails", async () => {
  tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
  storageSaveMock.mockRejectedValueOnce(new Error("EROFS: read-only file system"));

  const result = await setTripCover(makeCoverFormData()); // ← use the file's actual helper/inline idiom

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error).toBe("Upload failed — nothing was saved. Please try again.");
  expect(tripUpdateMock).not.toHaveBeenCalled();
  expect(revalidatePathMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/actions/cover.test.ts`
Expected: the new test FAILS — today the rejected save makes `setTripCover` itself reject, so the test errors instead of seeing `{ success: false }`.

- [ ] **Step 3: Implement the server fix**

In `server/actions/cover.ts`, replace:

```ts
  await storage.save(key, bytes, file.type);
```

with:

```ts
  try {
    await storage.save(key, bytes, file.type);
  } catch (err) {
    // Blob-first order: nothing has been written to the Trip row yet, so a
    // failed write needs no cleanup — just report it honestly.
    console.error("setTripCover: storage write failed", err);
    return { success: false, error: "Upload failed — nothing was saved. Please try again." };
  }
```

- [ ] **Step 4: Run to verify server pass**

Run: `npx vitest run server/actions/cover.test.ts`
Expected: PASS — new and all pre-existing tests.

- [ ] **Step 5: Write the failing client tests**

Create `components/trip/settings/cover-image-field.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/cover", () => ({
  setTripCover: vi.fn().mockResolvedValue({ success: true }),
  removeTripCover: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { setTripCover } from "@/server/actions/cover";
import { compressImage } from "@/lib/image-compress";
import { toast } from "@/components/ui/use-toast";
import { CoverImageField } from "./cover-image-field";

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("CoverImageField", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces the server's own error message when the action fails", async () => {
    const user = userEvent.setup();
    vi.mocked(setTripCover).mockResolvedValueOnce({
      success: false,
      error: "Upload failed — nothing was saved. Please try again.",
    });
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    await user.upload(
      fileInput(container),
      new File([new Uint8Array(10)], "c.jpg", { type: "image/jpeg" }),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Upload failed — nothing was saved. Please try again.",
      }),
    );
  });

  it("shows the oversize message and never calls the action when compression can't fit the cap", async () => {
    const user = userEvent.setup();
    const stillHuge = new File([new Uint8Array(5 * 1024 * 1024)], "big.heic", { type: "image/heic" });
    vi.mocked(compressImage).mockResolvedValueOnce(stillHuge);
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    await user.upload(
      fileInput(container),
      new File([new Uint8Array(10)], "big.heic", { type: "image/heic" }),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/~4 MB/) }),
    );
    expect(setTripCover).not.toHaveBeenCalled();
  });

  it("no longer blames file size for an unexplained throw", async () => {
    const user = userEvent.setup();
    vi.mocked(setTripCover).mockRejectedValueOnce(new Error("boom"));
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    await user.upload(
      fileInput(container),
      new File([new Uint8Array(10)], "c.jpg", { type: "image/jpeg" }),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Upload failed. Please try again." }),
    );
  });
});
```

(If `CoverImageField`'s real `Field`/`Input` imports pull client-only trouble into jsdom, stub those modules the same boundary-mock way — do not restructure the component. Check the real `use-toast` module shape first: if `toast` is not a named export, mirror its actual export shape in the mock.)

- [ ] **Step 6: Run to verify client failure**

Run: `npx vitest run components/trip/settings/cover-image-field.test.tsx`
Expected: test 1 may already pass (the `!r.success` path exists); tests 2 and 3 FAIL — no oversize guard, and the catch toast still says "the image may be too large (max 10 MB)".

- [ ] **Step 7: Implement the client fix**

In `components/trip/settings/cover-image-field.tsx`: add `oversizeUploadMessage` to the existing `@/lib/image-compress` import, and replace the `onFile` transition body with:

```tsx
    startTransition(async () => {
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        toast({ variant: "destructive", title: oversize });
        return;
      }
      const fd = new FormData();
      fd.set("tripId", tripId);
      fd.set("file", compressed);
      try {
        const r = await setTripCover(fd);
        if (!r.success) toast({ variant: "destructive", title: r.error });
        else router.refresh();
      } catch {
        // The action reports its own failures; reaching here means the request
        // itself died (network, platform limit) — don't invent a size excuse.
        toast({ variant: "destructive", title: "Upload failed. Please try again." });
      }
    });
```

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run components/trip/settings/cover-image-field.test.tsx server/actions/cover.test.ts`
Expected: PASS — all tests in both files.

- [ ] **Step 9: Commit**

```bash
git add server/actions/cover.ts server/actions/cover.test.ts components/trip/settings/cover-image-field.tsx components/trip/settings/cover-image-field.test.tsx
git commit -m "fix(cover): report storage failures honestly instead of blaming file size"
```

---

### Task 4: Journal photos get the same oversize pre-check

**Files:**
- Modify: `components/trip/journal-editor.tsx` (the `handleFileChange` function, ~lines 44–61)
- Test: `components/trip/journal-editor.test.tsx` (exists — extend)

**Interfaces:**
- Consumes: `oversizeUploadMessage` from `@/lib/image-compress` (Task 1). `compressImage` is already imported and called here.

- [ ] **Step 1: Write the failing test**

In `components/trip/journal-editor.test.tsx` — note this file mocks `@/lib/image-compress` with a plain factory (`compressImage: vi.fn(async (f) => f)`), which would erase the real `oversizeUploadMessage`. Convert that existing mock to the partial form first:

```ts
vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});
```

(all existing tests keep working — `compressImage` stays mocked identically). Then add:

```tsx
it("shows the oversize message and skips upload when the photo can't be shrunk under the cap", async () => {
  const user = userEvent.setup();
  const stillHuge = new File([new Uint8Array(5 * 1024 * 1024)], "big.heic", { type: "image/heic" });
  vi.mocked(compressImage).mockResolvedValueOnce(stillHuge);
  const { container } = render(<JournalEditor {...BASE_PROPS} />);

  await user.upload(
    container.querySelector('input[type="file"]') as HTMLInputElement,
    new File([new Uint8Array(10)], "big.heic", { type: "image/heic" }),
  );

  expect(await screen.findByText(/~4 MB/)).toBeInTheDocument();
  expect(uploadAttachment).not.toHaveBeenCalled();
});
```

(Check how the component renders `uploadError` — if it isn't reachable via `findByText`, target it the way any existing upload-failure test in this file does.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trip/journal-editor.test.tsx`
Expected: the new test FAILS (upload fires, no message); all pre-existing tests still pass under the converted partial mock.

- [ ] **Step 3: Implement**

In `components/trip/journal-editor.tsx`: extend the import to `import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";` and insert the guard after compression in `handleFileChange`:

```tsx
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        setUploadError(oversize);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
```

(The rest of the handler — FormData build, `uploadAttachment`, error handling, input reset — stays exactly as it is.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/trip/journal-editor.test.tsx`
Expected: PASS — new and all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add components/trip/journal-editor.tsx components/trip/journal-editor.test.tsx
git commit -m "fix(journal): explain an unshrinkable photo instead of letting the upload die"
```

---

## Final verification (after all tasks)

- [ ] `npx vitest run` — full suite green
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] Confirm still on `fix/upload-compression`, `main` untouched, nothing deployed
