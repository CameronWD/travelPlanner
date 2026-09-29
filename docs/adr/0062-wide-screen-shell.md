# Wide-screen shell: rail pinned left, content grows to ~1600px

## Status

Accepted 2026-09-24. Supersedes the phase-3 gaps-log entry "content capped at `max-w-7xl`, with no
use of the extra width on 1440/1920 — product decision" and amends the rail placement in ADR 0061.
Built on `fix/layout-audit-findings` (2026-09-25).

## Decision

The trip rail is pinned to the left edge of the viewport at full height, and the app top bar spans
the full width. Content widens with the screen up to about 1600px, stepping from one column to two
or three, then centres in the space right of the rail; prose keeps a readable measure inside it. A
small set of shared page widths replaces each page picking its own `max-w-*`.

Until now the rail and content sat together inside a centred `max-w-5xl/6xl/7xl` container, so on
a widescreen monitor the rail floated in mid-screen with blank space to its left, and page width
jumped between 768px and 1280px from page to page. Cam wants the desktop to stay responsive on a
widescreen, not collapse into a small island.

## Considered options

- **Keep the ~1280px cap, just make it consistent** — rejected: still leaves the rail floating and
  most of a 2560 screen blank.
- **Content left-aligned beside the rail** — rejected in favour of centring the capped content in
  the remaining space, which balances the spare room.
- **No cap at all** — rejected: grids and cards balloon and lines get unreadably long at 2560.

## Amendment — 2026-09-29: one rail, mounted once, for every signed-in page

**Context.** The rail was two components: the app layout mounted a Dock and
Sidebar for trips-level pages and the trip layout mounted its own pair, each
hiding when the other applied. Crossing the boundary — "Back to {trip}" from
New trip, or Trips from inside a Trip — unmounted one and mounted the other,
so the whole left edge re-rendered (Feedback `cmumclo5t000004jyyll3imed`).

**Decision.** `AppShellRail`, mounted once in `app/(app)/layout.tsx`, is the
only md+ rail. It reads the pathname: on a Trip path its rows are built from
the URL's trip segment (slug or id), which is all `tripRailItems` needs; the
Trip's name, default Days date and Plan/Wishlist counts arrive from the trip
layout through `RailTripPublisher`/`RailTripProvider`, and the switcher card
shows a small skeleton until they do. Off a Trip path it shows Trips/Globe/You
and the Back-to card. The trip layout renders content only; `data-trip-shell`
stays on it for `<main>`'s full-bleed rule.

**Consequences.** The rail's DOM persists across every navigation; only rows
and the switcher slot re-render. A boundary above the trip layout
(`not-found`, `trips/error`) no longer needs to supply a rail; a Trip that
404s shows URL-built rows and a skeleton switcher, never a blank strip. ADR
0063's "sibling navigation holds the current page" now extends to the rail
across the trip boundary. `npm run audit:nav` remains the browser check.
