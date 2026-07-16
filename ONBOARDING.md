# TEEPEE — Handover & Onboarding

> **TEEPEE — "A place to house your travel."** A two-person (couples') trip-planning web app: plan a trip together as a sequence of places, with transport, lodging, costs, a shared activity feed, and calendar export.

This doc gets you (a teammate, or a future session) productive fast. Last updated **2026-07-16**.

---

## 1. Stack

- **Next.js 16** (App Router, server components, server actions, `generateMetadata`/`Viewport`)
- **React 19**, **TypeScript 5**
- **Prisma 7** → **Postgres**
- **Tailwind v4** (CSS custom-property tokens mapped via `@theme inline`; `.dark` class on `<html>`)
- **Vitest** + jsdom + Testing Library
- **Radix UI**, **lucide-react**, **NextAuth** (Google OAuth + dev login)

## 2. Getting started

```bash
npm install                 # postinstall runs `prisma generate`
npm run dev                 # next dev
npm run test                # vitest run (full suite)
npx vitest run <file>       # run a single test file (preferred in CI/sandbox)
npx tsc --noEmit            # typecheck
npm run lint                # eslint
npm run build               # production build (also a correctness gate)
npm run db:seed             # seed dev data (tsx prisma/seed.ts)
```

**Env** (`.env*` is gitignored): `DATABASE_URL`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (or `ALLOW_DEV_LOGIN=true` for the dev sign-in buttons).

## 3. How we work here (READ THIS — it's mandatory, see `CLAUDE.md`)

This repo enforces a specific workflow for any non-trivial change:

1. **Spec first.** Use the **grill-with-docs** skill to interview the requester and produce the spec. **Write no code until they say "go for it"** (or similar).
2. **Plan.** Turn the agreed spec into an ordered, bite-sized plan with **superpowers:writing-plans** → saved to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`.
3. **Build.** Execute with **superpowers:subagent-driven-development** — one fresh subagent per task, each followed by a **spec-compliance review** then a **code-quality review**, then a **final whole-branch review**.

The final whole-branch review earns its keep — it has repeatedly caught cross-cutting seams the per-task reviews missed (e.g. transport legs anchored to `HEAD_SLOT` rendered only in the no-chapters layout branch, so they silently vanished once a trip used chapters — invisible to every per-task review because it spanned two tasks).

**Branch & merge discipline (sandbox guardrails — non-negotiable):**
- **Never work directly on `main`.** Branch first (`feat/<name>`), do all work there.
- **Never merge/push/deploy without explicit human say-so.** "Finished" ≠ "merge it."
- Merges into main are **`--no-ff`** with message `Merge branch '<branch>' into main`.
- **Migrations are authored but NOT run locally** (no live DB in dev sessions). They apply on deploy via `prisma migrate deploy`.

## 4. Domain model

The canonical glossary is **`CONTEXT.md`** (keep it implementation-free; update it as terms are coined). Key terms:

- **Trip** → **Phases** → **Stops**. A Stop is **rough** (just `nights`, no dates) or **scheduled** (`arriveDate`/`departDate`/`timezone`). **Firming up** dates a rough run; editing a scheduled date **ripples** forward through contiguous dated stops, except **pinned** stops (dates fixed, never moved). Core logic: `setStopDates` → `applyStopDates` (ripple) in `server/actions/stops.ts` + `lib/firm-up.ts`.
- **Chapter** (named leg), **Transport**, **Accommodation**, **Item** (wishlist/scheduled), **Cost**/**Budget** (multi-currency via snapshot `rateToHome`; convert with `convertMinor` in `lib/money.ts`).
- **Transport leg** — connects two endpoints. Each endpoint is a **stop**, **Home**, or a free **place** (typed/searched → geocoded to `depPlace`/`arrPlace` + lat/lng). A leg is **anchored** to a stop it renders *after* in the plan (`anchorStopId`); the pure resolver `lib/transport-anchor.ts` (`resolveTransportSlot`/`groupTransportsBySlot`) turns anchors into ordered per-stop **slots** (plus a `HEAD_SLOT` before the first stop). Legs are re-positioned by an edit-form picker or **drag** (`lib/reorder-transports.ts` + `reorderTransports`). There is **no** "Other transport" box — every leg has a home. Modes incl. CAR.
- **Flag** — a derived heads-up (packed day, long driving day, etc.) in `lib/flags.ts`.
- **Activity** / **Activity feed** / **notifications** (unread bell), **Calendar feed** (read-only ICS subscription), **Day map**, **Today view**.

## 5. Codebase map

```
app/                     routes; (app)/ is the authed shell (layout = chrome + auth gate)
components/              UI; components/trip/* is the planning surface (itinerary-manager, transport-form-dialog, location-combobox, ...)
lib/                     PURE modules (dates, money, geo, flags, firm-up, itinerary, transport-anchor, reorder-transports, ...) — heavily unit-tested
server/actions/          server actions (mutations) — each verifies access via lib/guards
prisma/                  schema.prisma + migrations/ (authored, deploy-applied)
docs/adr/                12 ADRs — architecture decisions w/ rationale
docs/superpowers/plans/  one plan per shipped feature
```

## 6. Testing conventions

- DB/auth/cache-touching tests mock `@/lib/db`, `@/lib/guards`, `next/cache` (and `@/server/actions/activity` for activity recording). Follow the patterns already in `server/actions/*.test.ts`.
- Pure `lib/` modules get straight unit tests.
- The full `npx vitest run` occasionally hits a **worker-pool timeout in the sandbox** — not a real failure; re-run, or run targeted files + rely on `tsc`/`build`. Current suite: **~2432 tests, all green.**

## 7. Current state (what's shipped, on `main`)

Recent features, newest first — each has a plan in `docs/superpowers/plans/`:

- **Transport locations, anchoring & Discreet removal** (2026-07-16) — From/To are now a **`LocationCombobox`** (pick a stop/Home *or* live-search a geocoded place). Legs **anchor** to a slot and render where added — the old "Other transport" box is gone; move a leg via an edit-form position picker or **drag-to-reorder**. Fixed "delete doesn't stick" (layout-scoped `revalidatePath` + optimistic delete). **Removed Discreet mode entirely** (was a cookie-only "Workspace" disguise — no DB, so no migration for the removal). Adds one column: `Transport.anchorStopId` — migration `20260715000000_add_transport_anchor` (applies on deploy; backfills `anchorStopId = fromStopId`).
- **Bold Modular redesign** (2026-07-15) — visual overhaul: Space Grotesk display font, coral primary + teal accent, chunky `rounded-3xl` cards, category-coloured chips, solid coral countdown block, and desktop **rails + width ramp** (`max-w-5xl lg:max-w-6xl 2xl:max-w-7xl`) so the planner fills wide screens.
- **Road-trip drive estimates** (2026-06-26) — offline drive-time hints + long-driving-day flag; per-trip winding factor + avg speed (2 new Trip columns). See ADR-0011.
- **TEEPEE rename** + slogan; **Mobile UX / PWA polish** (2026-06-25); **Activity feed + notifications** and hardening (2026-06-24).

## 8. Outstanding / future notes

- **Drive estimates "Option B"** — swap the offline `estimateDriveMinutes` for a real routing/distance-matrix API. Deliberately parked behind that seam; recorded in **ADR-0011**.
- **Shared UI primitives & extract-when-it-hurts rule** — see **`COMPONENTS.md`** (repo root) for the catalog of shared primitives (`useServerAction`, `useEntityForm`, `<FormDialog>`, `<RowActions>`, `<SectionHeader>`, `createMapLoader`, `useDeleteWithConfirm`, `<InlineCostFields>`), the tuned rule-of-three, and the full list of patterns deliberately left duplicated. `COMPONENTS.md` is the source of truth; do not add new shared primitives without reading it first.
- **Transport `anchorStopId` migration** (`20260715000000_add_transport_anchor`) was hand-authored (no live DB in the build sandbox) and applies on deploy via `prisma migrate deploy`. If you touch it, regenerate/confirm with `prisma migrate dev` against a dev DB.

## 9. Gotchas

- **Don't push/merge/deploy without explicit OK.** Building locally is fine; shipping is the human's call.
- The **firm-up ripple** is the trickiest domain logic — changes to stop dates/nights flow through `applyStopDates`; always reuse it rather than writing dates directly.
- **Transport leg placement** is driven by `resolveTransportSlot` (`lib/transport-anchor.ts`), not by endpoint pair-matching. When rendering or reordering legs, go through the slot resolver / `groupTransportsBySlot` — don't reintroduce a catch-all box for "unplaced" legs.
- Tailwind tokens are **HSL channel triplets** consumed via `hsl(var(--token))` — match that format when adding theme colours.
