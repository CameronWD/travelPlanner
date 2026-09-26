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
