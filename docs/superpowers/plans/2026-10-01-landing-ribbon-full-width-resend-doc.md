# Desktop ribbon spans the sun panel + resendDeploy.md — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Landing's desktop route ribbon run edge to edge across the sun panel at every width, and move the Resend deployment steps into their own doc, `docs/resendDeploy.md`.

**Architecture:** `CollageCards` gains a panel-filling wrapper that owns the breakpoint scale ladder as one CSS variable (`--fan-scale`); the 600×630 stage scales from that variable, and the ribbon piece moves out of the stage to be the wrapper's last child, anchored to the panel and bleeding past both edges. The doc move is a verbatim cut-and-paste plus cross-reference updates.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4.3 (`scale-(--var)` and `[--var:value]` arbitrary syntax), Vitest + Testing Library.

**Spec:** `docs/specs/2026-10-01-share-light-email-signin-welcome-layering.md` §E and §F (the rest of that spec already shipped on main).

## Global Constraints

- Branch `feat/landing-ribbon-full-width-resend-doc-2026-10-01`. Never commit to `main`; never deploy; never run `npm run feedback:*`.
- Every task ends green: `npm test`, `npx tsc --noEmit`, `npm run lint`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh`.
- Scale ladder values, unchanged: `.9` base, `.95` from 1152px, `1` from 1280px, `1.1` from 1536px, `1.3` from 1920px, `1.75` from 2560px.
- Ribbon vertical anchor: `top-[calc(50%+259px*var(--fan-scale))]` (the stage's `top-[574px]` is 259px below the 630px stage's centre, which is the panel centre). Horizontal: `-inset-x-10` relative to the panel wrapper.
- The ribbon stays the ninth shuffle piece (`pieceRef("stops")`, `data-piece="stops"`, last in DOM order, fade-only — `use-trip-shuffle.ts` `FADE_ONLY = "stops"`). The phone fan is untouched.
- New doc path and name exactly `docs/resendDeploy.md`; DEPLOY.md keeps a one-line §3b pointing at it; no `§3b` cross-reference survives anywhere except that pointer line.
- `next dev`/`next build` may re-add a block to `/work/CLAUDE.md`; never commit that change.

## Review Focus

1. **A 2560px-wide screen**: the ribbon must still sit just under the fan's bottom row, not drift — Task 1 pins the `calc(50%+259px*var(--fan-scale))` anchor and that the ladder has the same six values as before.
2. **Reduce Motion / the shuffle**: the ribbon must still fade in and out with the other pieces after moving out of the stage — Task 1 pins that the ribbon wrapper is the element `pieceRef("stops")` receives (nine pieces, `stops` last).
3. **The sun panel's `overflow-hidden`** clips the bleed, as intended, but the ribbon must not be clipped vertically by the panel on short viewports — out of scope (the fan itself already is); noted, no test.
4. **The ribbon's testid consumers**: `landing.test.tsx` expects `collage-cards`'s parent to be the sun panel and its text to include the stops — Task 1 moves the testid to the wrapper so both hold.
5. **Someone following DEPLOY.md after the move**: every pointer that said "§3b" must land on the new file — Task 2 pins it with a grep.

---

### Task 1: The desktop ribbon spans the sun panel (spec §E)

**Files:**
- Modify: `app/landing/sample-cards.tsx:108-205` (`CollageCards`)
- Test: `app/landing/sample-cards.test.tsx:22-70`

**Interfaces:**
- Consumes: `useTripShuffle(DESKTOP_PIECE_ORDER, DESKTOP_TIMING)` → `{ trip, pieceRef, shuffle }` (unchanged); `Ribbon` (unchanged).
- Produces: `CollageCards` now renders `<div data-testid="collage-cards" class="absolute inset-0 [--fan-scale:.9] …"><div data-slot="fan-stage" class="absolute left-1/2 top-1/2 h-[630px] w-[600px] -translate-x-1/2 -translate-y-1/2 scale-(--fan-scale)">…eight pieces…</div><div data-piece="stops" class="absolute -inset-x-10 top-[calc(50%+259px*var(--fan-scale))]">ribbon</div></div>`. `landing.tsx` needs no change (the wrapper's parent is still the sun panel `<section>`).

- [ ] **Step 1: Amend the failing tests**

In `app/landing/sample-cards.test.tsx`, replace the first test of `describe("CollageCards …")` (lines 23-45, "renders nine pieces in three mirrored rows on a 600×630 stage with the scale ladder") with:

```tsx
  it("renders a panel-filling wrapper carrying the scale ladder, a 600×630 stage that scales from it, and nine pieces (spec 2026-10-01 §E)", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    expect(root).not.toHaveAttribute("aria-hidden");
    for (const c of ["absolute", "inset-0", "[--fan-scale:.9]", "min-[1152px]:[--fan-scale:.95]", "min-[1280px]:[--fan-scale:1]", "min-[1536px]:[--fan-scale:1.1]", "min-[1920px]:[--fan-scale:1.3]", "min-[2560px]:[--fan-scale:1.75]"]) {
      expect(root.className).toContain(c);
    }
    expect(root.className).not.toMatch(/(^|\s)scale-\[/);
    const stage = root.querySelector<HTMLElement>('[data-slot="fan-stage"]')!;
    for (const c of ["absolute", "left-1/2", "top-1/2", "h-[630px]", "w-[600px]", "-translate-x-1/2", "-translate-y-1/2", "scale-(--fan-scale)"]) {
      expect(stage.className).toContain(c);
    }
    expect(stage.className).not.toMatch(/scale-\[|min-\[\d+px\]:scale/);
    expect(pieces(root).map((p) => p.dataset.piece)).toEqual(["day", "money", "lilac", "weather", "countdown", "train", "fork", "wishlist", "stops"]);
    // Eight pieces live on the scaled stage; the ribbon is the wrapper's last child, anchored to the panel.
    expect(pieces(stage).map((p) => p.dataset.piece)).toEqual(["day", "money", "lilac", "weather", "countdown", "train", "fork", "wishlist"]);
    const by = (n: string) => root.querySelector<HTMLElement>(`[data-piece="${n}"]`)!;
    expect(by("stops").parentElement).toBe(root);
    expect(root.lastElementChild).toBe(by("stops"));
    for (const c of ["absolute", "-inset-x-10", "top-[calc(50%+259px*var(--fan-scale))]"]) expect(by("stops").className).toContain(c);
    expect(by("stops").className).not.toContain("top-[574px]");
    for (const c of ["left-10", "top-[18px]", "w-[210px]"]) expect(by("day").className).toContain(c);
    for (const c of ["right-10", "top-[18px]", "w-[210px]"]) expect(by("money").className).toContain(c);
    for (const c of ["left-3", "top-[196px]", "w-[170px]"]) expect(by("lilac").className).toContain(c);
    for (const c of ["right-3", "top-[196px]", "w-[170px]"]) expect(by("weather").className).toContain(c);
    for (const c of ["left-[170px]", "top-[150px]", "z-20", "w-[260px]"]) expect(by("countdown").className).toContain(c);
    for (const c of ["inset-x-0", "top-[360px]", "z-30", "justify-center", "pointer-events-none"]) expect(by("train").className).toContain(c);
    for (const c of ["left-[70px]", "top-[418px]", "w-[180px]"]) expect(by("fork").className).toContain(c);
    for (const c of ["right-[70px]", "top-[418px]", "w-[190px]"]) expect(by("wishlist").className).toContain(c);
    // colours cross over: lilac/teal in the middle row, teal/lilac in the bottom row
    expect(by("lilac").firstElementChild!.className).toContain("bg-lilac");
    expect(by("weather").firstElementChild!.className).toContain("bg-teal");
    expect(by("fork").firstElementChild!.className).toContain("bg-teal");
    expect(by("wishlist").firstElementChild!.className).toContain("bg-lilac");
  });
```

The second test ("each piece is a wrapper around a tp-card-in card …") and the third ("carries the Japan copy …") need no change: `pieces(root)` still finds nine pieces (the ribbon is inside the wrapper), the ribbon's card still carries `tp-card-in`, and `root.textContent` still includes the stops.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/landing/sample-cards.test.tsx`
Expected: the amended test FAILS (no wrapper classes, no `fan-stage`, `stops` inside the stage).

- [ ] **Step 3: Restructure `CollageCards`**

In `app/landing/sample-cards.tsx`, change the `CollageCards` return so the outer element is the wrapper, the stage is an inner `div`, and the `stops` piece is the wrapper's last child. Keep every piece's markup exactly as it is; only the three elements shown change:

```tsx
  return (
    // The wrapper fills the sun panel and owns the breakpoint scale ladder as
    // one variable: the stage scales from it, and the ribbon — anchored to the
    // panel, not the scaled stage — uses it to stay just under the fan's
    // bottom row (the stage's old top-[574px] is 259px below the stage centre,
    // which is the panel centre). The ribbon bleeds past both panel edges at
    // every width (spec 2026-10-01 §E; handoff §3 "the only piece that runs
    // off the panel").
    <div
      data-testid="collage-cards"
      className="absolute inset-0 [--fan-scale:.9] min-[1152px]:[--fan-scale:.95] min-[1280px]:[--fan-scale:1] min-[1536px]:[--fan-scale:1.1] min-[1920px]:[--fan-scale:1.3] min-[2560px]:[--fan-scale:1.75]"
    >
      <div data-slot="fan-stage" className="absolute left-1/2 top-1/2 h-[630px] w-[600px] -translate-x-1/2 -translate-y-1/2 scale-(--fan-scale)">
        {/* …the eight existing pieces, day through wishlist, unchanged… */}
      </div>
      <div ref={pieceRef("stops")} data-piece="stops" aria-hidden="true" className="absolute -inset-x-10 top-[calc(50%+259px*var(--fan-scale))]">
        <Ribbon stops={trip.stops} repeats={3} size="desktop" i={8} delayMs={1370} />
      </div>
    </div>
  );
```

Update the `CollageCards` doc comment's last clause from "the ribbon across the bottom — the only piece that runs off the panel" to "the ribbon across the bottom, anchored to the panel rather than the stage so it runs off both panel edges at every width (§E)".

- [ ] **Step 4: Run the Landing suite to verify it passes**

Run: `npm test -- app/landing`
Expected: PASS, including `landing.test.tsx` ("desktop: the collage sits on the clipped sun panel" — the wrapper's parent is still the `bg-sun` section) and `use-trip-shuffle.test.tsx`.

- [ ] **Step 5: Confirm Tailwind emits the classes**

Run: `npm run build 2>&1 | tail -5` then `grep -o 'scale:var(--fan-scale)' .next/static/css/*.css | head -1 && grep -o '\-\-fan-scale:\.9' .next/static/css/*.css | head -1`
Expected: build exit 0 and both greps print a match (Tailwind v4 generated `scale-(--fan-scale)` and the arbitrary property). If the first grep is empty, Tailwind did not recognise `scale-(--fan-scale)`: use `[scale:var(--fan-scale)]` on the stage instead and update the test's expected class string to match. If the build rewrote `/work/CLAUDE.md`, run `git checkout -- CLAUDE.md`.

- [ ] **Step 6: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`

```bash
git add app/landing/sample-cards.tsx app/landing/sample-cards.test.tsx
git commit -m "fix(landing): desktop route ribbon spans the sun panel, anchored to the panel not the scaled stage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 2: `docs/resendDeploy.md` (spec §F)

**Files:**
- Create: `docs/resendDeploy.md`
- Modify: `docs/DEPLOY.md:39-71` (§3b), `:86-87` (env table), `:464` (§6 step 3)
- Modify: `.env.example:18`, `lib/auth.ts:49`, `docs/open-follow-ups.md:2501,2536`

**Interfaces:** none.

- [ ] **Step 1: Create the new doc**

Read `docs/DEPLOY.md` lines 39-71 (from the `## 3b. Resend (Sign-in links) — free, optional` heading to the line before `## 4. Vercel — free (Hobby)`). Create `docs/resendDeploy.md` with this header followed by that section's body **verbatim** (every numbered step, the Vercel table, the Preview-environment paragraph, and the closing two paragraphs), with only the heading changed:

```markdown
# Resend (Sign-in links) — deploy steps

Moved out of `docs/DEPLOY.md` §3b on 2026-10-01 (spec 2026-10-01 §F). Read
`docs/DEPLOY.md` for the rest of the deployment; this file is the one place
for turning the Sign-in link on.

<body of the old §3b, verbatim, starting at "The email field on the Landing appears only when…">
```

- [ ] **Step 2: Replace §3b in DEPLOY.md with a pointer**

Replace lines 39-71 of `docs/DEPLOY.md` (the whole old section, up to but not including `## 4.`) with:

```markdown
## 3b. Resend (Sign-in links) — free, optional

See `docs/resendDeploy.md` — account, domain and DNS, API key, the two Vercel env vars, redeploy, test.

```

- [ ] **Step 3: Update every cross-reference**

- `docs/DEPLOY.md` env table rows: `| \`AUTH_RESEND_KEY\` | optional — from step 3b |` → `| \`AUTH_RESEND_KEY\` | optional — see docs/resendDeploy.md |`; `| \`AUTH_RESEND_FROM\` | optional — \`Teepee <signin@teepee.camxanhq.com>\` (step 3b) |` → `| \`AUTH_RESEND_FROM\` | optional — \`Teepee <signin@teepee.camxanhq.com>\` (docs/resendDeploy.md) |`.
- `docs/DEPLOY.md` §6 step 3: `a Sign-in link if §3b is set up` → `a Sign-in link if docs/resendDeploy.md is done`.
- `.env.example` line 18: `(docs/DEPLOY.md §3b)` → `(docs/resendDeploy.md)`.
- `lib/auth.ts` line 49 comment: `(docs/DEPLOY.md §3b)` → `(docs/resendDeploy.md)`.
- `docs/open-follow-ups.md`: both occurrences of `` `docs/DEPLOY.md` §3b`` → `` `docs/resendDeploy.md` ``.

- [ ] **Step 4: Verify with grep**

Run: `grep -rn '§3b\|step 3b' .env.example lib docs app`
Expected: exactly one hit, the `## 3b.` heading/pointer in `docs/DEPLOY.md` (the heading itself reads "3b." — acceptable; no `§3b` reference elsewhere). Then `grep -c 'AUTH_RESEND_KEY' docs/resendDeploy.md` prints at least 2 (table row and prose), and `grep -n 'Preview' docs/resendDeploy.md` prints the Preview paragraph.

- [ ] **Step 5: Tests, lint, typecheck, commit**

Run: `npm test -- lib/auth-sign-in-link.test.ts && npm run lint && npx tsc --noEmit`
Expected: green (the `lib/auth.ts` edit is comment-only).

```bash
git add docs/resendDeploy.md docs/DEPLOY.md .env.example lib/auth.ts docs/open-follow-ups.md
git commit -m "docs: Resend deploy steps move to docs/resendDeploy.md; DEPLOY §3b points at it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

## Self-review

- **Spec coverage.** §E → Task 1 (wrapper + variable ladder, stage scales from it, ribbon as last child with the panel anchor, shuffle piece preserved, phone untouched, typography note accepted). §F → Task 2 (new file, pointer, every cross-reference).
- **Placeholders.** The one elided block in Task 1 Step 3 ("the eight existing pieces … unchanged") is deliberate: those lines are not edited and the file is in front of the implementer; the test enumerates them.
- **Type consistency.** Class strings in the test and the code match exactly (`[--fan-scale:.9]`, `scale-(--fan-scale)`, `top-[calc(50%+259px*var(--fan-scale))]`).
- **Review Focus.** 1 → Task 1 anchor + ladder assertions. 2 → Task 1 nine-pieces-with-stops-last assertion (the shuffle hook test already covers fade-only). 4 → Task 1 moves the testid to the wrapper; `landing.test.tsx` unchanged. 5 → Task 2 grep. 3 → noted, out of scope.
