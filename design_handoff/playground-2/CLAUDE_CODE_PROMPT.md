# Prompt for the Claude Code session

Paste everything below the line into Claude Code, opened at the root of `CameronWD/travelPlanner`, with the `handoff/` folder copied to `design_handoff/playground/`.

---

We're reskinning TEEPEE to the new "Playground" visual system. This is a **restyle, not a rebuild**: data, routes, server actions and behaviour stay as they are unless a step below says otherwise.

**Read first:** `design_handoff/playground/README.md` (install order, token map, component map, routes, known gaps), then `CONTEXT.md`, `SPEC.md`, `COMPONENTS.md`, and ADRs 0026, 0027, 0029 and 0006. The shared primitives stay the reference patterns and must keep their APIs: FormDialog, useEntityForm, RowActions, SectionHeader, and InlineCostFields.

**Rules**
- Tailwind v4 classes only, using the tokens in `design_handoff/playground/app/globals.css`. No inline style objects and no new hex values, with three exceptions: `lib/map-palette.ts` (Leaflet), `app/global-error.tsx` (globals.css isn't loaded) and the OG files (Satori). Accent colour as text on neutral surfaces must use `text-coral-text`, `text-teal-text`, and the other `*-text` tokens. Category and chapter colour goes through `categoryClasses()` / `chapterColourMeta()`; never build `bg-${x}-100` strings.
- **Design reference:** `design_handoff/playground/reference/` has every screen (`ui_kits/*/index.html`, source in `ui_kits/shared/*.jsx`), plus specs, guidelines and `Gap Specs.dc.html`. Read the JSX for exact values.
- Keep Server Components as Server Components. Only files already marked `"use client"` (or leaves that need state or handlers) are client. Don't push `"use client"` up the tree.
- Restyled `components/ui/*` files must keep their exports and props. When a test asserts on class names, update the assertion rather than the behaviour.
- Motion: CSS `tp-*` utilities, or `motion` with `ease: [0.2, 0.8, 0.2, 1]`. Honour `useReducedMotion()`. Animate transform and opacity only.
- Accessibility: keep the 3px focus ring, 44px touch targets, `aria-current` on nav, and labels on icon-only buttons. Body text must be ≥ 4.5:1 in both themes.
- Money is a shared pot. There's no per-person splitting and none should be added.
- Don't add features that aren't in the repo, except the explicit "new" items in step 6.

**Steps.** One commit per step. Run `tsc`, `lint`, `test`, then `next build` after each step, and stop to fix failures before moving on.
1. **Tokens.** Replace `app/globals.css` with the handoff version, keeping any repo-only rules (e.g. `.leaflet-container`) and `--tp-tab-bar-h`. Check light and dark on /trips and one trip page.
2. **Fonts and PWA.** Swap in the handoff `app/layout.tsx` (Bricolage Grotesque replaces Space Grotesk; keep the existing providers) and `app/manifest.ts`. Copy `public/` in and remove the superseded `app/icon.*` files.
3. **Primitives.** Copy the restyled `components/ui/*` files (button, card, badge, input, segmented, dialog, empty-state, skeleton, logo + logo-paths), then add the new ones (chip, count-badge, progress-bar, stat-card, list-row, stepper, switch, checkbox, icon, offline-banner, error-panel, skeletons). Restyle the remaining ui files per the README's "Restyle by hand" list. Then copy `lib/hues.ts`, `lib/categories.ts`, `lib/chapter-colours.ts`, `lib/map-palette.ts` and `lib/map-pins.ts`, and migrate every `${color}-…` category or chapter class string to the helpers (grep `categoryMeta(`, `chipClass`, `dotClass`, `pinHex(`, `swatch`). Pass `isDark` into the pins and polylines in day-map, route-map, globe-map and wishlist-map.
4. **Navigation.** Replace `components/trip/mobile-tab-bar.tsx` with `ui/tab-bar.tsx`. Add `ui/dock.tsx` for md and up. Breakpoints are md 768 and lg 1024.
5. **Screens.** Restyle each route against the matching screen in `reference/ui_kits`. Go in this order: trips, trip home, plan, calendar/day, budget, wishlist, settings, account, share. Then today, summary, globe, checklists, files, journal, activity, compare, print, account, help, whats-new and signin. Also the plan-editor details: home base, chapter bands, rough-stop drag, missing legs, projected end and Make it fit. Then the screens with no kit screen (README table): admin, privacy and terms via `LegalPage`, trip help, the notification bell, and the feedback FAB class string. Leave discreet mode's behaviour as it is and restyle it only with tokens. Pages keep their data fetching.
6. **New.**
   - Per-route `loading.tsx` using the five archetypes in `ui/skeletons.tsx` (README mapping).
   - `error.tsx` and `not-found.tsx` via `ErrorPanel`.
   - The handoff `app/global-error.tsx`.
   - OfflineBanner in the trip layout.
   - A ⌘K search dialog using a server action over trip entities.
   - The OG images (`app/share/[token]/opengraph-image.tsx`, `app/opengraph-image.tsx`, `lib/og-card.tsx`). Add the two TTFs to `app/fonts/`.
7. **Emails.** Port `emails/*.html` to the existing email sender. The copy rules are in `design_handoff/playground/docs/notifications.md`.

When done, write `docs/adr/00NN-playground-visual-system.md` recording the change, and list anything you skipped or couldn't match.
