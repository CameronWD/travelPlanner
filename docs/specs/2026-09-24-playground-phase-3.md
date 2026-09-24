# Playground reskin — phase 3 spec

Agreed with Cam, 2026-09-24. Builds on `docs/follow-ups/2026-09-24-playground-phase-3-handover.md`
(rules, traps, environment) and ADRs 0060 / 0061.

## Scope

Phase 3 = **all 17 remaining screens + the default OG image.**

Out of scope (logged in the gaps doc, not built):

- **The four emails** (magic-link, invite, trip-reminder, booking-confirmed). The app has no mail
  sender, and invites deliberately send nothing (ADR 0017). Shipping them is new capability.
- **The per-trip share OG card.** The share page is `noindex`; an unfurl card is a product decision.
- **Kit screens with no app counterpart:** landing, onboarding, invite flow, "Your people", mobile
  "More" hub, tablet layout, notification batching, email channels and new push types.
- **Wide-screen layout changes** (e.g. the kit's 340px aside, a wider content cap).

## Branching

- Umbrella: `feat/playground-phase-3`, cut from `beta`.
- Sub-branches are cut from the umbrella and merged back into it once all their gates pass.
- The umbrella merges into `beta` **once, at the end, with Cam's go-ahead**. Never `main`. Never push.

| # | Sub-branch | Contents | Reference |
|---|---|---|---|
| 1 | `p3/boundaries` | 3× not-found, `global-error`, terms + privacy (`legal-page`), admin, notification bell | handoff drop-ins in `design_handoff/playground-2/{app,components}` |
| 2 | `p3/core` | **first task: `Card` hue tones**; then trips list, new trip, trip home, wishlist, calendar, day-nav | `DTrips`, `DHome`, `DWishlist`, `DDays`, `forms.jsx` |
| 3 | `p3/together` | activity, journal, checklists, files, compare, print (light pass), globe | `together.jsx`, `onthego.jsx` |
| 4 | `p3/admin-kit` | account, help (both routes), what's-new, share page | `admin.jsx`, `share.jsx` |
| 5 | `p3/og-default` | `app/opengraph-image.tsx` + `lib/og-card.tsx` + two `.ttf` fonts | handoff `app/opengraph-image.tsx`, `lib/og-card.tsx` |

## Fidelity rule

- **Strict visual match** to the kit: layout, spacing, type, surfaces, iconography.
- **No new features.** A control, section or datum the kit shows that we lack → a gaps-log entry,
  not code. Something we have that the kit lacks → keep it, styled with the nearest kit pattern.
- **Copy:** kit copy by default (headings, empty states, labels, microcopy). Ours wins where it's
  more accurate about real behaviour: shared-pot money wording (never splitting), privacy wording
  (never reveal a trip exists). The bell's in-app copy follows `docs/notifications.md` for the
  notification types we actually send.
- **Emoji used as illustration** → the kit's treatment (`ErrorPanel` art, or lucide via
  `components/ui/icon.tsx`). Emoji in user-entered content is untouched.
- **Tests pinned to old copy** are updated in the same task, visibly in the diff, never weakened.
- **Print:** swap the raw palette classes for tokens and use print-appropriate styling (no offset
  shadows). No kit match required.

## `Card` hue tones (first task of `p3/core`)

- Extend `Card`'s `tone` with the nine hues from `lib/hues.ts` (`tone="hue-sky"` etc.).
- A hue tone = `island` + `bg-hue-*` + `text-on-accent` (the chip text token — a solid fill, not
  the `soft` tint, so **not** `onSoft`).
- Existing tones (`coral|sun|teal|lilac|ink|white|paper`) are unchanged.
- Migrate the weather card off `className="island bg-hue-sky"` onto `tone="hue-sky"`.

## Named exemptions (amend ADR 0060's exemption list)

1. **`lib/og-card.tsx`:** inline style objects and hex are allowed (Satori can't read CSS variables
   or classes). Its hex must equal the `globals.css` token values **computed from the HSL, not the
   rounded comments**, and a unit test pins the equality.
2. **`app/global-error.tsx`:** inline styles are allowed (it replaces the root layout, so the
   stylesheet and theme can't be relied on). **No raw hex:** colours come from CSS variables it
   declares locally, and those follow the tokens.

## Fidelity gate (per screen task)

The implementer takes Playwright screenshots into the scratchpad (never the repo), in **light and
dark**, at:

| Width | Compared against kit? | Check |
|---|---|---|
| 390 | yes (mobile kit) | strict fidelity |
| 1280 | yes (desktop kit, drawn at 1280×800) | strict fidelity |
| 1440 | no | wide-screen checklist |
| 1920 | no | wide-screen checklist |

**Wide-screen checklist:** nothing stretches edge to edge that shouldn't; text lines stay a
readable length; grids and cards don't balloon or leave odd gaps; the rail and content stay
aligned; the page background fills the whole viewport. A failure is fixed within the existing
layout.

The spec reviewer compares the screenshots side by side. Any intentional difference must be either
a logged gap or something we have that the kit lacks; anything else is a defect.

Leaflet screens wait on `.leaflet-marker-icon` and assert a count; never wait on `networkidle` alone.

## Gates

- **After every task:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- **At the end of each sub-branch:** `npm run audit:contrast` must be `RESULT: PASS`. The baseline
  passed clean on 2026-09-24 at `9e19400`, with the 4 Leaflet zoom exemptions. Accept a new
  node-count baseline only when you know why.

## Docs

- **Gaps log:** `docs/follow-ups/2026-09-24-playground-phase-3-gaps.md`, one section per
  sub-branch. Each entry records the kit file/screen, what the kit shows, what we have, and why it
  wasn't built (new feature / needs a data model / product decision). Seeded on day one with the
  out-of-scope list above. Written for Cam to decide from.
- **Handoff defects** (e.g. the 36px stepper) go into section D of
  `docs/follow-ups/2026-09-23-playground-design-ask.md`, not the gaps log.
- **ADR 0060:** amended with the two exemptions.

## Standing constraints (from the handover)

Shared-pot money; Server Components stay Server Components; motion via `tp-*` / `motion` with
`ease: [0.2, 0.8, 0.2, 1]` and `useReducedMotion()`; 3px focus ring, 44px targets, `aria-current`,
labelled icon buttons, body text ≥4.5:1 in both themes; Tailwind v4 token classes only; no new hex
outside the named files; keep `@source not "../design_handoff";`. Never run `feedback:resolve`;
subagents never run `feedback:pull`. Don't commit `next dev`'s `CLAUDE.md` block.
