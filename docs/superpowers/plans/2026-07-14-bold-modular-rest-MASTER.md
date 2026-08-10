# Bold Modular Redesign — Remaining Program (MASTER ROADMAP)

**One branch `feat/bold-modular-rest`** (off `main`@`e7f9e7d`) holds EVERYTHING from here; merged to `main` **once, at the end** — and only on Cam's **explicit** go-ahead (guardrail: finishing ≠ merge permission; do NOT auto-merge).

## Locked decisions (2026-07-14)
- **Secondary screens: FULL REBUILD** to mocks (preserve all Part-C data).
- **Tier 2 ② Home order: BOTH phases** → `[hero, route, nextSteps, money, actions]`.
- **Tier 2 ⑤ primitives: APPLY GLOBALLY** — chunkier `Card` radius + pill quick-action `Button`s cascade to ~140 components.

## Hard reality — blind build
Sandbox has no DB, so `next build`/`next dev` FAIL: everything here is built **without ever rendering it**. We guarantee structural/behavioural correctness + tests + review only. **Visual fidelity across ~15 surfaces is Cam's local `npm run dev` pass.** Recommended visual checkpoint: after Plan B (⑤ primitives cascade), since it touches everything. Flagged, not gated (Cam away).

## Section plans (in order; each = its own plan file + a subagent-driven run on this branch)
- **Plan A — Home finish ② ③ ④:** `phase-planning` reorder (both phases); `budget-glance` → quiet "spent so far" strip; `next-steps-card` → filled rounded-xl severity-hue chips.
- **Plan B — ⑤ Primitives:** `Card` chunkier radius + pill quick-action `Button` variant — **cascades**. [VISUAL CHECKPOINT.]
- **Plan C — ⑥ Maps:** CARTO Positron/Dark-Matter tiles + `L.divIcon` markers across route/globe/wishlist/day maps; ADR for the tile provider (attribution).
- **Plan D — ⑦ Desktop:** TripNav underline tabs + right-rail dashboards (D-series mocks).
- **Plans E+ — Secondary screens (full rebuild):** one plan per screen or small batch — Wishlist · Day · Journal · Files · Checklists · Settings · Compare · Travelling/Past Home phases · Globe · Activity · Share/Print.

## Live status
See `.superpowers/sdd/progress.md` (ledger) and the tracker in `design_handoff/README.md`.
