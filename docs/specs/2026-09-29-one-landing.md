# One Landing, fuller phone cards, clean section switches — spec (2026-09-29)

Agreed in the 2026-09-29 grilling session. Branch `feat/signin-matches-landing-2026-09-29`.

## 1. One page, one URL
- `/` is the only signed-out page. `/signin` is a permanent redirect to `/` that keeps its query string (old bookmarks, `?error=` links).
- Auth.js `pages.signIn` and `pages.error`, the `requireUser` guard, the `(app)` layout redirects, sign-out's `callbackUrl` and the legal pages' logo link all point at `/`.
- The Sign in screen (`app/signin/`) is deleted; `signin-buttons.tsx` moves to `app/landing/`.
- A signed-in visitor at `/` still goes straight to `/trips`.

## 2. Access denied
- At `/?error=AccessDenied` the Sign in panel opens by itself in a "denied" mode: title "Teepee is invite-only.", then today's neutral copy **verbatim**, then the Google controls.
- Closing the panel strips `?error` from the URL, so a refresh does not reopen it.
- Any other `error` value is ignored.

## 3. Header
- The header "Sign in" button goes on desktop and phone. Header = logo only; the pair under the hero is the one way in.

## 4. Desktop
- No change beyond the header.

## 5. Phone cards
- A staggered spread alternating left/right the whole way down. Coral stays top-left, always whole. The desktop stops strip (Tokyo → Hakone → Kyoto → Osaka) joins as a ninth piece across the middle. Something still spills off the bottom edge.
- Acceptance, by screenshot at 360×640, 390×844 and 430×932: no empty band taller than ~60px in either the left or right half of the card area; at least one piece clipped by the bottom edge; coral fully visible.

## 6. Section switches
- The old section fades out (~100ms), then the new one fades in (~160ms) — never both visible.
- The phone tab bar and top bar are explicitly layered above every transition group, so an entering section can never paint over them.
- The Day slide is untouched; reduced motion still cuts.
- Acceptance, by frames from a slowed section switch in a headless browser at phone size (e.g. Plan → Money): the tab bar fully visible in every frame; no frame shows old and new sections together.

## 7. Docs and tests
- CONTEXT.md "Landing" updated (done). ADR 0063 gains a line on why the bars need an explicit layer, not only a name. Tests follow each change.
