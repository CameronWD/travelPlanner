# Landing Body Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Landing body line under the hero, in both the desktop and phone trees, with the agreed copy.

**Architecture:** Pure copy change in `app/landing/landing.tsx` (two `<p>` elements), pinned by the existing Landing component test.

**Tech Stack:** Next.js (app router), React, Vitest + Testing Library.

**Spec:** `docs/specs/2026-09-29-landing-body-copy.md`

## Global Constraints

- Copy, verbatim (both trees): `Stops, trains, beds and budget all in one place. For the trip you're dreaming up, the one you're on, and everywhere you've been.`
- No comma after "budget". Apostrophes written as `&apos;` in JSX, matching the file.
- Do not change classes, layout, hero, CTAs or any other copy.
- Must not introduce "hotel", "stay" or "staying" (existing test forbids them).

## Review Focus

1. Old copy lingering in either tree — the test asserts the old strings are gone from the whole page.
2. Desktop and phone drifting apart — the test asserts the exact same string in each tree.
3. Straight vs curly apostrophe mismatch — the test matches the rendered straight `'` exactly.
4. Accidentally touched classNames — review the diff is limited to the two text nodes.
5. None further found for a copy-only change.

---

### Task 1: Swap the Landing body copy

**Files:**
- Modify: `app/landing/landing.tsx` (desktop `<p>` ~line 37, phone `<p>` ~line 56)
- Test: `app/landing/landing.test.tsx` (test "leads with the kit's hero heading in both trees, with the kit body copy")

**Interfaces:** none.

- [ ] **Step 1: Write the failing test** — in `app/landing/landing.test.tsx`, replace the two body-copy `expect` lines in that test with:

```tsx
    const body = "Stops, trains, beds and budget all in one place. For the trip you're dreaming up, the one you're on, and everywhere you've been.";
    expect(within(desktop()).getByText(body)).toBeInTheDocument();
    expect(within(phone()).getByText(body)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sleeps|Fork the plan|whoever's coming/);
```

and rename the test to `"leads with the kit's hero heading in both trees, with the same body copy (spec 2026-09-29 body copy)"`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/landing/landing.test.tsx`
Expected: FAIL — unable to find the new text.

- [ ] **Step 3: Implement** — in `app/landing/landing.tsx` set the text of both body `<p>` elements to:

```tsx
Stops, trains, beds and budget all in one place. For the trip you&apos;re dreaming up, the one you&apos;re on, and everywhere you&apos;ve been.
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run app/landing` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/landing/landing.tsx app/landing/landing.test.tsx
git commit -m "copy(landing): body line covers every trip, past and next"
```
