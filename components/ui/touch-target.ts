/**
 * `Button size="sm"` is 36px tall to match the kit's small button — short of
 * the 44px touch-target floor (global constraints). On a coarse pointer this
 * invisible `::after` overlay grows the hit area to 44px without changing
 * the button's visible size (same technique as Segmented / RowActions /
 * Switch / devices-panel.tsx's Remove button — design-ask D1).
 *
 * Pulled out to its own zero-dependency module (rather than left as a local
 * const in devices-panel.tsx, or duplicated per file as most other call
 * sites in the codebase do) so a component that needs it — e.g.
 * profile-card.tsx — doesn't have to import devices-panel.tsx itself and
 * drag in its whole module graph (server/actions/devices, .../push, and
 * their `lib/db` import, which throws without `DATABASE_URL` set) just for
 * one class string.
 */
export const SM_HIT =
  "relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1 pointer-coarse:after:content-['']";
