# Feedback batch 2026-09-29b — spec

Sixteen Feedback notes from the inbox pulled 2026-09-29, agreed with Cam in the
session interview. Every task's commit carries `Resolves-Feedback: <id>` for the
notes it closes; `feedback:resolve` runs only after Cam confirms the deploy.

## Small fixes

- **Trips carousel scroll** `cmumcg1u9000004l0rjio27w6`. The carousel track is the
  same fixed height as the cards but has bottom padding, and horizontal overflow
  forces vertical overflow to auto. Give the track room for the cards plus their
  hard shadow and clip vertical overflow. No vertical scrollbar at any width.
- **Focus ring overlap** `cmumcjr3i000304l08xwwegwg`. The shared Input and Select
  focus style loses its 2px outline offset so the ring hugs the box. The lift and
  shadow stay. Applies app-wide.
- **Globe wraps** `cmumcnbmn000004l7h5efbdl0`. The Globe map takes the same bounds,
  viscosity, min zoom and no-wrap tiles the Travel map already uses. A test pins
  it, as the route map's does.
- **Pointer cursor** `cmumcrjs1000304l71nj6l4fk`. One global rule: buttons and links
  get a pointer cursor, disabled buttons don't. Fixes the notification bell, the
  Feedback button, and everything else at once.
- **Edit-item photo section** `cmumcvsu8000004jkjtit9tvs`. The photo dropzone's
  thumbnail, buttons and hint centre within the full-width field.
- **Sort these out** `cmumcpixx000204l7pjg6h945`. Six rows on desktop, four on
  phone. "See all" stays pinned to the bottom.

## Medium

- **Greeting removed** `cmumchfzu000104l0cv755cz8`. "Hey Cam" goes from the trips
  header. The first-run "Welcome to teepee" line stays.
- **White cards** `cmumchso1000204l0s15n8asx`. Passport stamp and route sketch get a
  soft wash of the Trip colour behind them. On phones, where the cover is hidden,
  standard cards get a slim Trip-colour strip. The card surface stays white.
- **Account layout** `cmumcobiy000104l71fkyacxo`. Desktop: You in a narrower left
  column, Devices and Digests stacked in a wider right column. Phone unchanged.
- **Profile photo focus point** `cmumd56py000004kygdjtwl7s`. Upload stops
  centre-cropping and keeps the compressed original. User gains focal X and Y,
  mirroring the cover focal fields. A "Reposition" control on the Account profile
  card opens the same drag-to-frame picker the cover uploader uses. Every avatar
  renders with the focus point via object-position. Existing photos default to
  centre. Glossary: **focus point** on Profile photo.
- **Trip home stats** `cmumctx4r000504l7lkixq9us`. Inside the desktop countdown
  tile, between the status chip and the big number, a row of stat tiles: nights,
  Stops, countries, and Chapters when the toggle is on. Desktop only. Nights and
  Stops leave the header meta line, which keeps dates and currency.

## Large

- **New trip polish** `cmumckjjn000404l0pazekm5w`. Same fields, same single page.
  One consistent column grid at every width, header aligned with the form,
  tightened spacing. The cover field becomes a proper dropzone with a preview once
  a photo is chosen, its text centred. Checked at phone and desktop widths.
- **Persistent rail** `cmumclo5t000004jyyll3imed`. The Dock and Sidebar move up to
  the outer app layout and never unmount. The Trip layout publishes its nav rows
  and Trip name into a shared store when it loads; until then the rail shows a
  small skeleton where the Trip rows go. Covers desktop sidebar and tablet Dock.
  ADR 0062 amended; ADR 0063's nav audit must still pass.
- **Sidebar contents** `cmumd26ny000104jywgykrva2`. Desktop sidebar lists all 13
  Trip rows, no "More": Plan it (Home, Plan, Days, Calendar, Money, Wishlist),
  Keep (Journal, Checklists, Files, Summary, Activity), then Settings and Help.
  Each row gets the phone tab bar's icon. "All trips" heading becomes "Across
  trips". Tablet Dock keeps text plus More. Help legend updated to match.
- **Help audit** `cmumd0ulr000104jkpo7i9q27`. Every section checked against the
  current app and corrected. Short new sections for features the guide doesn't
  cover. The 60-second version becomes a single vertical column of numbered
  steps, each with an icon and colour accent, replacing the two-column split. The
  nav-label guard test keeps passing.
- **Feedback vetting** `cmumcswf7000404l75wwuptxb`. New status `NEEDS_REVIEW`. At
  write time, a note whose author is not an Admin is born Needs review; Admin
  notes stay Open. The author's panel shows it as Open. New script
  `feedback:accept -- <id>` moves it to Open. Declining is the existing resolve
  script with `--wontfix`. The inbox gets a "Needs review" section after Open, and
  CLAUDE.md tells the main session to lead with Open and never work Needs-review
  notes. ADR 0040 amended. Glossary: **Needs review** status.

## Assumptions

- The avatar focus-point picker reuses the cover picker's drag interaction.
- The persistent rail is the riskiest task. If the nav audit or a transition
  breaks, the fallback is to keep the two rails and ship the rest.
- ADR text for the rail and vetting decisions is written as part of the build.
