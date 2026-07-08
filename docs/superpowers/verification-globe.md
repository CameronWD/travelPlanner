# Globe + Wishlist Mobile UI Audit

**Audited surfaces:** Globe page (`app/(app)/globe/page.tsx`), globe components (`components/globe/globe-view.tsx`, `globe-map.tsx`, `globe-map-loader.tsx`, `marker-form.tsx`, `marker-filters.tsx`, `marker-list.tsx`, `globe-invite-button.tsx`), trip/wishlist components (`components/trip/globe-suggestions-strip.tsx`, `add-from-globe-dialog.tsx`, `nearby-wishlist.tsx`, `wishlist-board.tsx`, `wishlist-map.tsx`, `wishlist-map-loader.tsx`), shared UI primitives (`components/ui/dialog.tsx`, `select.tsx`, `popover.tsx`, `sheet.tsx`, `toast.tsx`), and `app/globals.css`.

**Method:** Static code-level read — no browser available in sandbox. Every finding is grounded in specific file:line references. Date: 2026-07-08.

**Verified good:** `app/globals.css` line 17 (`isolation: isolate` on `.leaflet-container`) correctly confines Leaflet's internal stacking context so maps sit below the z-50 dialog layer. Not re-reported.

---

## Static UI Audit Findings

### F1 — AddFromGlobeDialog: unbounded marker list with no scroll container

**Location:** `components/trip/add-from-globe-dialog.tsx` lines 115–152

**Issue:** The marker list is rendered as a bare `<ul className="flex flex-col gap-2">` with no `max-height` or `overflow-y-auto`. The wrapping `DialogContent` correctly caps itself at `max-h-[90dvh]` and applies `overflow-y-auto` on its inner scroll wrapper (dialog.tsx line 70), so the list does scroll — but only because the entire dialog body scrolls. If the user has many markers (tens to hundreds) the filter controls (`MarkerFilters`) scroll away with the list and are no longer visible. Users lose access to the search/category/country filters as soon as they scroll even slightly, forcing them to scroll back to the top to refine the list.

**Surface:** Mobile (bottom-sheet; 90dvh cap is tight) and desktop (85vh cap).

**Severity:** Major — filters disappear on scroll; the workaround is to scroll back, but it is clearly broken UX.

**Confidence:** High — the `DialogHeader` uses `sticky top-0` (dialog.tsx line 98) to stay put, but `MarkerFilters` is placed inside the scrollable body (add-from-globe-dialog.tsx line 109) not inside `DialogHeader`, so it scrolls away.

**Proposed fix:** In `add-from-globe-dialog.tsx`, move `<MarkerFilters …/>` into the `<DialogHeader>` block, or wrap just the `<ul>` in `<div className="max-h-64 overflow-y-auto">` so filters remain above it and always visible.

---

### F2 — GlobeMap and WishlistMap: fixed pixel heights don't adapt on small screens

**Location:** `components/globe/globe-map.tsx` line 144 (`style={{ height: 440 }}`); `components/trip/wishlist-map.tsx` line 172 (`style={{ height: 360 }}`)

**Issue:** Both Leaflet containers use a hard-coded inline `height` in pixels. On a 375 px viewport the globe map (440 px) is taller than the visible area above the fold, and consumes nearly the full viewport height, pushing the filter row and marker list far below. The wishlist map (360 px) uses a slightly lower value but still fills most of the screen. Because the height is set via an inline `style` (not a Tailwind class), responsive breakpoints (`sm:h-60`, etc.) cannot override it without additional CSS specificity tricks.

**Surface:** Mobile (primary concern — 375 px–430 px viewports); not an issue on desktop where 440 px is a comfortable fraction of the screen.

**Severity:** Major — the map monopolises the entire viewport on mobile, making page navigation feel broken. The list / filters require significant scrolling to reach.

**Confidence:** High — the inline style value is plainly readable.

**Proposed fix:** Replace the inline `style` with a responsive Tailwind height class. In `globe-map.tsx` line 143–147: remove `style={{ height: 440 }}`, add `className="... h-56 sm:h-[440px]"` (224 px on mobile, 440 px on desktop). Apply the same change to `wishlist-map.tsx` (`h-52 sm:h-[360px]`).

---

### F3 — MarkerFilters inside AddFromGlobeDialog: native `<select>` elements may not respect dialog z-stacking on iOS

**Location:** `components/globe/marker-filters.tsx` lines 23–50

**Issue:** `MarkerFilters` uses two native HTML `<select>` elements (not the Radix `<Select>` component). On iOS Safari, native `<select>` dropdowns render as a system picker wheel overlaid by the OS, which is unaffected by CSS z-index — so this is not a stacking problem. However, inside a scrolling dialog body the native picker can sometimes misalign or cause the dialog to scroll unexpectedly on iOS (known WebKit behaviour with fixed-positioned ancestors). Additionally, the select elements have no explicit `max-width`, so on very narrow screens (320 px — iPhone SE) the three-item flex row (input + two selects) may overflow even with `flex-wrap` if country names are long, because the selects have no `min-w-0`.

**Surface:** Mobile — particularly 320 px–375 px viewports and iOS Safari.

**Severity:** Minor — usable, but alignment may be off on smallest phones.

**Confidence:** Medium — the `flex-wrap` on the parent container (marker-filters.tsx line 15) mitigates overflow for most cases; actual misbehaviour needs browser confirmation on iOS.

**Proposed fix:** Add `min-w-0 flex-shrink` to both `<select>` elements in `marker-filters.tsx` (lines 23 and 37) so they compress gracefully before wrapping.

---

### F4 — WishlistBoard header action row: button row may overflow or wrap awkwardly on narrow screens

**Location:** `components/trip/wishlist-board.tsx` lines 249–274

**Issue:** The header action row renders `<div className="flex items-center gap-3">` containing a `Segmented` control, an "Add from Globe" button, and an "Add item" button — three sibling elements with no wrapping allowed (`flex` defaults to `nowrap`). On a 375 px screen all three need to fit in the right half of a `sm:flex-row` header. If the "Add from Globe" button's label is longer than ~80 px the row clips or the buttons overlap the heading.

**Surface:** Mobile primarily; also narrow tablets.

**Severity:** Minor — the button labels are short ("Add from Globe" is ~100 px at 14 px font, "Add item" ~65 px), so they likely fit at 375 px, but there is no defensive `flex-wrap` or `min-w-0` to handle edge cases.

**Confidence:** Medium — depends on exact rendered font metrics; needs browser confirmation.

**Proposed fix:** Add `flex-wrap gap-2` to the action `<div>` at wishlist-board.tsx line 249 so the row wraps to two lines rather than overflowing on very narrow screens.

---

### F5 — MarkerForm candidate list: no max-height on search results

**Location:** `components/globe/marker-form.tsx` lines 185–199

**Issue:** The place-search candidate `<ul>` (`className="flex flex-col gap-1 rounded-lg border border-border bg-card p-1"`) has no `max-height` and no `overflow-y-auto`. If the geocoder returns many results (the API can return 10+), the list expands in-place inside the dialog body, pushing the Title, Category, Timing, Link, and Note fields — and the Save/Cancel footer — further down. On mobile the footer may be reachable by scrolling (the dialog body is `overflow-y-auto`), but the experience is disorienting: the form's fields disappear below a tall candidate list.

**Surface:** Mobile and desktop.

**Severity:** Minor — Save is not fully unreachable (dialog body scrolls), but the UX is poor. The list rarely contains >5 results in practice.

**Confidence:** High — no max-height class is present on the `<ul>`.

**Proposed fix:** Add `max-h-48 overflow-y-auto` to the `<ul>` in `marker-form.tsx` line 186.

---

### F6 — Toast viewport z-index (z-100) vs. dialog z-index (z-50)

**Location:** `components/ui/toast.tsx` line 20 (`z-100`)

**Issue:** `ToastViewport` is `z-100`, which places it above the dialog overlay and content (`z-50`). This is intentional and correct — toasts should appear over dialogs. Confirmed good.

**Note for completeness:** No issue here. `Select` content is also `z-50` (select.tsx line 74), matching the dialog level. Since both are portalled to `<body>` by Radix, DOM order determines paint order when z-index is equal — the last-opened portal wins, which is the correct behaviour for a Select opened inside a Dialog.

---

## Summary

| ID | Severity | Confidence | Surface |
|----|----------|------------|---------|
| F1 | Major | High | Mobile + Desktop |
| F2 | Major | High | Mobile |
| F3 | Minor | Medium | Mobile (iOS) |
| F4 | Minor | Medium | Mobile |
| F5 | Minor | High | Mobile + Desktop |
| F6 | — (verified good) | High | — |

**Totals: 0 Blockers, 2 Major, 3 Minor.**

The `DialogContent` primitive itself is well-constructed: `max-h-[90dvh]` on mobile, `overflow-y-auto` on the scroll body, sticky `DialogHeader` — the dialog shell does not itself cause viewport overflow. Issues F1 and F2 are the highest-priority items because F1 hides controls during normal use and F2 makes the globe feel broken on a phone.

---

## Fixes applied (branch `fix/globe-search-and-mobile-ui`)

| Item | Change | Commit |
|------|--------|--------|
| Location search 403 | `lib/geocode.ts` no longer sends the blocklisted `contact@example.com`; warns when `NOMINATIM_CONTACT` is unset; adds `searchPlacesWithStatus` (error vs. empty) | `dd8e765` |
| Search UI feedback + copy | Globe place search now shows "temporarily unavailable" vs. "no matching places"; header points at **Add marker** for place search; on-page box relabelled "Filter your markers…" | `b23311d` |
| F1 | AddFromGlobe marker list wrapped in a `max-h-64 overflow-y-auto` scroller so filters stay visible | `a18eacd` |
| F2 | Globe/Wishlist maps use responsive heights (`h-56 sm:h-[440px]` / `h-52 sm:h-[360px]`) instead of fixed inline px | `a18eacd` |
| F3 | Marker-filters native `<select>`s get `min-w-0` | `a18eacd` |
| F4 | Wishlist board action row gets `flex-wrap` | `a18eacd` |
| F5 | Marker-form candidate list gets `max-h-48 overflow-y-auto` | `a18eacd` |

---

## Manual Browser Verification Checklist

> The sandbox that produced this branch has **no browser, Postgres, or Docker**, so the live drive could not run here. Run this checklist locally to confirm the fixes. It should take ~10 minutes.

### Setup (local)

1. Start Postgres and make sure the schema is applied:
   - `docker compose up -d`
   - `npx prisma migrate deploy` (this branch adds **no** migration — this just ensures your DB is current)
2. Seed demo data (gives you a trip with stops so suggestions/nearby have something to show): `npm run db:seed:demo`
3. Set the two env values this checklist needs (in your `.env.local`, your choice — the repo intentionally ships none):
   - `ALLOW_DEV_LOGIN="true"` — enables the passwordless traveller sign-in
   - `NOMINATIM_CONTACT="you@your-real-domain.com"` — **a real email or your app's URL.** Placeholder/`example.com` values are 403-blocked by Nominatim (this was the original bug).
4. `npm run dev`, open the app, sign in via dev-login.
5. Test at **two widths**: a phone (~375 px — DevTools device toolbar, "iPhone SE"/"iPhone 12") **and** desktop.

### A. Location search (the original bug)

- [ ] Globe → **Add marker** → type a city (e.g. "Kyoto") in **"Search for a place…"** → **Search** → a list of real candidates appears. *(This is the core fix — it was returning nothing before.)*
- [ ] Pick a candidate → Title auto-fills, a "City, Country" caption shows, the candidate list closes.
- [ ] Search a nonsense string (e.g. "zzzzzzzz") → **"No matching places found."** (not silence).
- [ ] Force the failure path: temporarily set `NOMINATIM_CONTACT=""`, restart dev, search → **"Place search is temporarily unavailable."** Then restore your real contact. *(Confirms failures are no longer silent.)*
- [ ] The on-page **"Filter your markers…"** box filters existing markers only, and the header sentence points you to **Add marker** for adding a place (no longer misleading).

### B. Globe marker flow (mobile + desktop)

- [ ] Add / edit / delete a marker each work and the map updates.
- [ ] **Tap the map** to drop a pin → dialog opens pre-filled with a reverse-geocoded place name.
- [ ] Category / country filters and the grouped marker list behave.
- [ ] **[F2]** On the phone, the map does **not** eat the whole screen — the filter row + list are reachable without endless scrolling.
- [ ] **[F5]** A search returning many results keeps the candidate list to a scrollable box; the Title/Save stay reachable.
- [ ] Category `Select` dropdown and any toast render **above** the open dialog (not behind the map).

### C. Trip Wishlist surfaces (mobile + desktop)

- [ ] Open a seeded trip → **Wishlist**. The "Suggested from Globe" strip shows markers matching the trip's countries; "Add" copies one into the wishlist; "+N more" opens the browser.
- [ ] **Add from Globe** dialog: browse markers, one-tap add shows "✓ Added".
- [ ] **[F1]** In the Add-from-Globe dialog on a phone, scroll the marker list — the **search/category/country filters stay pinned in view** (don't scroll away).
- [ ] **[F4]** On a narrow phone, the Wishlist header buttons (view toggle, "Add from Globe", "Add item") wrap to a second line instead of overflowing/overlapping the title.
- [ ] **[F3]** On a very narrow phone (~320 px), the filter row's dropdowns compress/wrap without spilling off-screen.

### D. Cross-check no regressions

- [ ] Trip route map, Day map, and Summary map still render at sensible heights on both widths (F2 only touched globe + wishlist maps, but eyeball these).

---

## Outstanding items (for the user)

1. **Set `NOMINATIM_CONTACT` in Vercel** — a real contact is now set in local `.env.local` and **verified working** (live Nominatim request returned HTTP 200 with the app's exact User-Agent, vs 403 for the old placeholder). The remaining step is to add the same `NOMINATIM_CONTACT` env var in the **Vercel** project settings and redeploy — otherwise production location search *and* all background geocoding (trip stops, accommodation, transport) stay 403-blocked. `.env.example` documents the variable for other environments.
2. **Run this checklist in a real browser** — it could not be executed in the sandbox (no browser/DB). The audit above is code-level; these fixes are high-confidence but unverified against pixels.
3. **Invite/reconciliation flow** needs a *second* account to fully verify (invite a partner to the Globe, accept by email match). A single dev-login user can't exercise the accept side.
4. **Merge/deploy** are held pending your go-ahead per the working guardrails — nothing on this branch has been merged or shipped.
