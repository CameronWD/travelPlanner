# Layout audit — 2026-10-12

Harness: `npm run audit:layout` (`scripts/layout-audit.ts`), run on branch
`chore/hygiene-and-ui-cleanup-2026-10-12` against local `next dev` and a
scratch Postgres seeded with `npm run db:seed:demo`. Previous run:
`docs/audits/2026-09-24-layout-audit.md` (Stage 1) and
`docs/audits/2026-09-25-layout-recheck.md` (Stage 3). Twenty merges landed
between that run and this one, including the Money, New trip, Plan, Share,
Landing, Trips carousel and Day carousel redesigns, which is why the harness
needed three repairs before it could see the app again (below).

## Run

- 580 captures in the matrix, 531 captured, 45 skipped, 4 errored; 1,368
  screenshots. Screenshots live outside the repo (`/tmp/layout-audit/2026-10-12b`)
  and are not kept; each finding carries its best screenshot path and crop in
  `2026-10-12-layout-findings.json` for the record only.
- Widths 360 · 375 · 390 · 430 · 768 · 1024 · 1280 · 1440 · 1920 · 2560, light;
  dark at 390 and 1440; phase screens on one trip per Phase; an empty trip;
  print at A4; 34 overlay recipes at 360 / 390 / 1440 (+ keyboard-up variants).
- Automatic checks (leads, not findings): small-target 2302, overlap 533,
  clipped-text 170, spill 76, sideways-scroll 8, line-too-long 1.
- Ten visual reviewers, one per screen group, graded the screenshots.
  Cross-width duplicates were merged by the reviewers; cross-screen
  duplicates (the page-header squeeze, the Feedback button covering the page
  foot) are merged in the spec, not here.
- `npm run audit:contrast`: **FAIL, 77 failures.** 66 are the Share page in
  dark (the light-only root does not set its own ink, so the saved dark
  theme's cream text lands on white cards), 5 are Trips phase chips in dark,
  3 the New trip preview in dark, 2 the Money category segment (one per
  theme), 2 Day-page labels in dark, and 2 the Landing's decorative coral
  full stop (2.7:1 at 88px, both themes). Node-count baseline regressions on
  Share (390 to 118) and Money (336 to 112) are the redesigns, not a loss.

### Harness repairs made on this branch

- Trip cards are an empty overlay anchor with the name in `aria-label`
  (`trip-card.tsx`), so `trips.ts` reads `aria-label` before `textContent`.
  Without it every trip was a coverage gap and 300 captures were skipped.
- `/trips/new` is a four-step flow; `ensureEmptyTrip` fills "Trip name",
  presses Continue three times, then Create trip.
- The Day view is a paged carousel (ADR 0065) that renders the previous and
  next days offscreen with their own "Show day map" toggles; `revealMap`
  clicks the one inside the viewport, not the first in the DOM.

### Coverage gaps left open

- Checklists at 360 / 375 / 390 (light and dark): `page.screenshot` refused
  the clip ("Clipped area is either empty or outside the resulting image").
  The page measures normally outside the harness (1829px tall, 360 wide); not
  chased. Phone Checklists judgements rest on the 430 capture.
- Overlay recipes that no longer find their trigger after the Plan and shell
  redesigns: command-palette, trip-actions and traveller-menu on phones (the
  tab bar replaced them), and stop-edit, stop-menu, item-add,
  accommodation-add, transport-add, cost-add and make-it-fit on Plan. Update
  the recipes when the harness is next touched.
- Share's "Day by day" section reveals on scroll (`share-reveal.tsx`); the
  full-page capture never scrolls, so it is blank in every Share capture.
- Admin rendered the not-found page (the dev login is not an admin).
- The 1440 overlays were captured over whichever page the previous recipe
  left open, so a few dialog captures sit on an unrelated page.

## Findings

**126 findings — 14 Broken, 40 Ugly, 72 Polish** (plus 3 struck as capture artefacts, kept for the record). Ids run LA-101 onward; LA-001–055 were the September run.

### Trips, New trip, Account

- `LA-151` **Ugly** — Map filter chip row runs off the right edge of the 'Your travels' card _(Trips; at 768, 1024, 1280, 1440px, dark)_
- `LA-152` **Ugly** — New-trip wizard scrolls sideways at tablet widths; preview card hangs off the viewport _(New trip; at 768, 1024px)_
- `LA-153` **Ugly** — Feedback FAB sits on top of the last digest toggle at the bottom of Account _(Account; at 360, 375, 390, 430px, dark)_
- `LA-216` **Polish** — Tally card stretches to map height, leaving a large empty block mid-card _(Trips; at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-217` **Polish** — Tally stats cramped at 768: '947 km' breaks across two lines, 'nights away' wraps _(Trips; at 768px)_
- `LA-218` **Polish** — Phone stats strip uses different vocabulary and set of stats from the desktop Tally _(Trips; at 360, 375, 390, 430px, dark)_
- `LA-219` **Polish** — On-the-road hero card says 'Day 4 of 7' twice _(Trips; at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-220` **Polish** — Map markers render underneath the 'Your travels' label pill on phones _(Trips; at 360, 375, 390, 430px, dark)_
- `LA-221` **Polish** — Wizard step pills crowd the logo and Cancel at 768 _(New trip; at 768px)_
- `LA-222` **Polish** — 'Fills in as you answer' caption is nearly invisible in dark theme _(New trip; at 1440px, dark)_
- `LA-223` **Polish** — Empty-state headings inconsistent: 'No devices yet' vs 'Nothing is connected yet.' _(Account; at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-224` **Polish** — Feedback sheet mixes left-aligned title with a centred empty-state line _(Feedback sheet; at 360, 390, 1440px)_

### Home and Today

- `LA-105` **Broken** — Sketching countdown card clips its last line: 'Tokyo' is cut in half at the card bottom _(Home (desktop, sketching phase); at 1440, 2560px)_
- `LA-106` **Broken** — At 768 a blank cream panel covers the quick-action pills and Reminders list at page bottom _(Home (tablet rail); at 768px)_
- `LA-127` **Ugly** — 'Sort these out' nudges are truncated to one line with an ellipsis and no way to read them _(Home (desktop); at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-128` **Ugly** — Past trip on desktop: stray full-width black rule under the stat tiles and an empty lower half _(Home (desktop, past phase); at 1440, 2560px)_
- `LA-129` **Ugly** — Desktop hero badge says PLANNING in sketching and final-prep phases; mobile says the real phase _(Home (desktop); at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-175` **Polish** — Shared pot card has a large dead gap and its layout changes between phases _(Home (desktop); at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-176` **Polish** — Hero countdown card has an empty middle at 1024–1440; the stat tiles only appear from 1920 _(Home (desktop); at 1024, 1280, 1440px, dark)_
- `LA-177` **Polish** — Route map popup truncates the stop name and sits on top of marker 6 _(Home (desktop); at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-178` **Polish** — Quick-action pills wrap into two ragged rows on phones _(Home (mobile); at 360, 375, 390, 430px, dark)_
- `LA-179` **Polish** — Cover block is a 225px-tall empty gradient with nothing in it and no way to change it _(Home (mobile); at 360, 375, 390, 430, 768px, dark)_
- `LA-180` **Polish** — Feedback floating button overlaps the bottom-right corner of the last card _(Home / Today; at 360, 375, 390, 430, 768, 1024, 1440, 2560px, dark)_
- `LA-181` **Polish** — Journal counter shows a leading orphan separator: '· 0 / 500' _(Today (travelling phase); at 375, 768, 1440, 2560px)_
- `LA-182` **Polish** — At 1024 the trip switcher pill floats above the title, separate from the rail _(Home (desktop 1024); at 1024px)_

### Plan

- `LA-107` **Broken** — Page header: 'Plan' heading breaks letter-by-letter and trip name wraps one word per line _(Plan; at 360, 375, 390, 768px, dark)_
- `LA-108` **Broken** — 768: header actions row spills 113px past the viewport, page scrolls sideways, '+ Add a stop' cut off _(Plan; at 768px)_
- `LA-109` **Broken** — Add-a-stop sheet on phone: the 'Where to?' input collapses to a thick black line, no field visible _(Add a stop (sheet); at 360, 390px)_
- `LA-110` **Broken** — Mobile timeline: long 'Drive A → B  Tue 22 Sep 08:00' transport pills run off the right edge and cause sideways scroll _(Plan (past trip); at 375px)_
- `LA-111` **Broken** — 1024/1280: stop header starves its title; 'Rov…', 'Mu…', 'L…' and chips collide with the date/stepper column _(Plan; at 1024, 1280px)_
- `LA-130` **Ugly** — 1024: 'Booked' chip overlaps the plan title in day rows ('Northern Lights snowmobile hun[Booked]') _(Plan; at 1024px)_
- `LA-131` **Ugly** — Dialog titles run under the Close button: 'Adjust dates for Rovaniemi (Laplan[X]' _(Adjust dates (dialog); at 1440px)_
- `LA-132` ~~Ugly — Desktop, scrolled to the page bottom: stop cards render without their number badge and name (Paris card blank)~~ — struck: harness artefact: in a real 1440×900 viewport scrolled to the end (programmatic and wheel, light and dark) every stop row paints its badge, name and chips; the full-page capture's viewport resize left the row's left column unpainted
- `LA-133` **Ugly** — Dark theme: the expanded-stop chevron button is a washed-out tan square with an almost invisible chevron _(Plan; at 1440px, dark)_
- `LA-183` **Polish** — Edit stop and Adjust dates use native mm/dd/yyyy date inputs and a different Exact/Roughly toggle than Add a stop _(Edit stop / Adjust dates (dialogs); at 1440px)_
- `LA-184` **Polish** — 'Fits your dates' rail card: 'right / on it' wraps into two lines beside the big 0; mobile pill keeps it on one line _(Plan (Fits your dates card); at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-185` **Polish** — '+ Add an idea' is a tall empty dashed box filling the right half of the expanded stop _(Plan (expanded stop); at 1440, 1920, 2560px, dark)_
- `LA-186` **Polish** — Mobile stop cards truncate the accommodation line so the plans count is lost; at 360 the stop name truncates too _(Plan (mobile list); at 360, 375, 390, 430px, dark)_
- `LA-187` **Polish** — Same-day stop shows '11–11 Oct' and '0n' on mobile where desktop says 'Same day' _(Plan (mobile list, travelling); at 375, 768px)_
- `LA-188` **Polish** — Delete-stop warning truncates the accommodation line mid-sentence: '…(Santa's Resort) (h…' _(Delete stop (dialog); at 1440px)_

### Day and Calendar

- `LA-103` ~~Broken — Day page content is shifted sideways: previous day's panel peeks in on the left, current day runs off the right~~ — struck: harness artefact: in a real 390px viewport the carousel sits at scrollLeft 390, exactly one page, with no sideways overflow; the full-page capture resizes the viewport under a snap-x carousel
- `LA-104` **Broken** — At 768 the page title 'Calendar' is squeezed to one letter per line and the toolbar overflows the viewport _(Calendar (Month); at 768px)_
- `LA-124` **Ugly** — Page title breaks mid-word ('Cale/ndar', 'Calen/dar') on phones because it shares a row with the toolbar _(Calendar (Agenda); at 360, 375, 390px, dark)_
- `LA-125` **Ugly** — Day cells break city names mid-word, truncate the country and clip the 'things' chip _(Calendar (Month); at 768, 1024, 1280px)_
- `LA-126` **Ugly** — Rovaniemi cells: two-line city name pushes 'Finland' under the '1 thing' chip _(Calendar (Month); at 1440px, dark)_
- `LA-168` **Polish** — Day subtitle 'Rovaniemi (Lapland) · GMT+2 · night 1 of 4' is ellipsised, losing 'night 1 of 4' _(Day; at 360, 375, 390px, dark)_
- `LA-169` **Polish** — Check-in / Check-out titles have a double-height gap between their two lines _(Calendar (Agenda) and Day plan; at 360, 375, 390, 430px, dark)_
- `LA-170` **Polish** — Redundant 'Agenda' heading followed by a large empty gap before the first day card _(Calendar (Agenda); at 360, 375, 390, 430px, dark)_
- `LA-171` **Polish** — 'Open today's route: Google Maps / Apple Maps' wraps into three two-line columns _(Day; at 375px)_
- `LA-172` **Polish** — Leaflet attribution wraps and pokes outside the map's rounded frame _(Day; at 375px)_
- `LA-173` **Polish** — Journal card says 'Opens on the day' yet shows an entry written 13 minutes ago _(Day; at 360, 375, 390, 430px, dark)_
- `LA-174` **Polish** — Floating feedback button covers the last Agenda card's flight route text _(Calendar (Agenda); at 360, 375, 390, 430px, dark)_

### Money

- `LA-101` **Broken** — Mobile page header: 'Money' breaks one letter per line, trip name runs under the Real plan pill _(Money; at 360, 375, 390, 430px, dark)_
- `LA-102` **Broken** — Tablet header: title/subtitle wrap word-by-word and at 768 the action row spills off-screen _(Money; at 768, 1024px)_
- `LA-117` **Ugly** — Trip cost hero figure is clipped behind the Before/On-the-trip stat box _(Money; at 1024, 1280px)_
- `LA-118` **Ugly** — Feedback FAB covers the last 'Where it goes' amount at the page bottom on phones _(Money; at 360, 390px, dark)_
- `LA-119` **Ugly** — Desktop 'Where it goes' shows only 6 of 11 categories with no scroll cue; 'To pay' has a dead gap _(Money; at 1280, 1440, 1920, 2560px, dark)_
- `LA-120` **Ugly** — Leaves/Arrives datetime fields clip the time on phones ('12/06/2026, 0') _(Transport leg sheet; at 360, 390px)_
- `LA-157` **Polish** — 'To pay' rows truncate to 'Flight · Rov…' when the side column is narrow _(Money; at 1024, 1280px)_
- `LA-158` **Polish** — 'Cost' section heading is immediately followed by a 'Cost' field label _(Transport leg dialog; at 1440px)_
- `LA-159` **Polish** — Phone layout uses different chrome from desktop: '35 left >' link, dot rows, no paid column, no Rates card _(Money; at 360, 375, 390, 430px, dark)_
- `LA-160` **Polish** — Category chips wrap leaving 'Other' orphaned on its own line _(Add Item dialog; at 1440px)_
- `LA-161` **Polish** — 'Mon 7 Dec' date wraps onto two lines beside the route chips at 360 _(Transport leg sheet; at 360px)_

### Summary, Compare, Print

- `LA-115` **Broken** — Feedback FAB covers the last Budget summary row at the bottom of the page on phones _(Summary; at 360, 390px, dark)_
- `LA-144` **Ugly** — Stop names in 'Itinerary at a glance' break mid-word, one letter per line, on phones _(Summary; at 360, 375, 390, 430px, dark)_
- `LA-145` **Ugly** — 'Compare plans' page title breaks mid-word ('Com / pare / plan / s') on phones and tablet _(Compare plans; at 360, 390, 768px, dark)_
- `LA-146` **Ugly** — Promote dialog lists paid costs by raw database id ('Cost cmv5tglj9001265qoexnigkbw') _(Promote what-if plan dialog; at 360, 390, 1440px)_
- `LA-147` **Ugly** — 'Make this the real plan anyway' button label wraps to three lines and overflows the pill _(Promote what-if plan dialog; at 360, 390px)_
- `LA-148` **Ugly** — Accommodation name is ellipsised while the ISO date range beside it is shown in full _(Summary; at 360, 375, 390, 430px, dark)_
- `LA-149` **Ugly** — 'Paid so far' stat value truncates to '$18,795.…' at 768 _(Summary; at 768px)_
- `LA-150` **Ugly** — Print preview on phones: hotel names wrap one word per line beside the address; flight Ref drops to a second line _(Print preview; at 360, 375, 390, 430px, dark)_
- `LA-206` **Polish** — Flags stat renders count and icon jammed together ('2ℹ', '1⚠ 5ℹ'), unlike Compare's 'ⓘ 2' _(Summary; at 360, 375, 390, 768, 1440, 2560px, dark)_
- `LA-207` **Polish** — Hotel ranges and Trip-health notes use ISO dates while the rest of the page uses '7–11 Dec 2026' _(Summary; at 360, 768, 1440, 2560px, dark)_
- `LA-208` **Polish** — Leg header shows two unlabeled amounts ('$7,067.68  $4,515.10') in grey and teal _(Summary; at 360, 768, 1440, 2560px, dark)_
- `LA-209` **Polish** — Print page shows the trip header twice: app header, then the same title/dates again inside the preview _(Print preview; at 360, 375, 390, 430, 768, 1440, 2560px, dark)_
- `LA-210` **Polish** — Day-by-day time ranges split across lines leaving orphans like '– 20:00)' _(Print preview; at 360, 375, 390, 430px, dark)_
- `LA-211` **Polish** — 'Make it fit' button sits flush against the 'WARNINGS (2)' label with no spacing _(Summary; at 375, 1440, 2560px)_
- `LA-212` **Polish** — Stat cards become unequal heights at 768 when 'COST BUDGET' wraps to two lines _(Summary; at 768px)_
- `LA-213` **Polish** — What-if card headers lay out differently side by side; third card spans full width at 768/1024 _(Compare plans; at 768, 1024, 1440, 2560px, dark)_
- `LA-214` **Polish** — Dark theme: what-if cards keep full light pastel fills with black ink text and black buttons _(Compare plans; at 390, 1440px, dark)_
- `LA-215` **Polish** — Real plan shows 'Nights 0' while Summary says 34 nights; what-if deltas are computed against that 0 _(Compare plans; at 360, 768, 1440, 2560px, dark)_

### Checklists, Files, Journal, Activity

- `LA-121` **Ugly** — Page h1 breaks mid-word on phones and at 768 because the Real plan pill squeezes the title column _(Checklists / Files / Journal / Activity (shared page header); at 360, 375, 390, 430, 768px, dark)_
- `LA-122` **Ugly** — Floating feedback bubble sits on top of the 'Add item' button at the bottom of the page _(Checklists; at 430, 768px)_
- `LA-123` **Ugly** — File cards on phones: four action icons squeeze the name to 'trip-…' and the meta line onto four rows _(Files; at 360, 375, 390, 430, 1024px, dark)_
- `LA-162` **Polish** — Linked transport label renders a bare '?' for a missing origin: '? → Rovaniemi (Lapland)' _(Files; at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-163` **Polish** — Activity feed is capped at ~760px and leaves the right half of the page empty, unlike sibling pages _(Activity; at 1440, 1920, 2560px, dark)_
- `LA-164` **Polish** — Packing 'Templates' row wraps 'Save as template' onto a second line at 1024 _(Checklists; at 1024px)_
- `LA-165` **Polish** — Edit Item text field opens scrolled to the end so the start of the item text is hidden _(Checklists — Edit Item sheet; at 360, 390px)_
- `LA-166` **Polish** — Due-date inputs show the native 'mm/dd/yyyy' US pattern while the app writes dates as 'Fri 16 Oct' _(Checklists (new item and Edit Item forms); at 360, 390, 430, 768, 1024, 1440, 1920, 2560px, dark)_
- `LA-167` **Polish** — Pre-trip card is stretched to the Packing card's height, leaving dead space under its form _(Checklists; at 1440, 1920, 2560px, dark)_

### Settings, Help, More, Admin

- `LA-114` **Broken** — Trip Help header squeezes title into a ~90px column beside the toolbar; 'Teepee' breaks mid-word _(Trip Help; at 360, 375, 390, 430px, dark)_
- `LA-138` **Ugly** — Trip Help title still cramped at tablet widths: heading wraps to three lines beside trip switcher _(Trip Help; at 768, 1024px)_
- `LA-139` **Ugly** — At 1024 the 'What the buttons mean' card is squeezed by the On-this-page rail; sidebar list labels collide _(Trip Help; at 1024px)_
- `LA-140` **Ugly** — Share link and Calendar feed action rows wrap with 'Revoke' orphaned on its own line _(Settings; at 360, 375, 390, 430, 1024, 1280, 1440px, dark)_
- `LA-141` **Ugly** — Cover photo file input shows the browser's raw 'Choose File N…en' label, truncated mid-word _(Settings; at 360, 375, 390, 430px, dark)_
- `LA-142` **Ugly** — Floating Feedback button covers the Danger zone 'Delete trip' button at the bottom of Settings _(Settings; at 360, 390px, dark)_
- `LA-143` **Ugly** — Dark theme: native date inputs draw a black calendar icon on the dark field _(Settings; at 390, 1440px, dark)_
- `LA-197` **Polish** — Driving estimates: intro paragraph butts against 'Road winding factor' label, and the closing note repeats it _(Settings; at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-198` **Polish** — Danger zone is pinned to the bottom of the right column with a large empty gap above it _(Settings; at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-199` **Polish** — Two checkbox styles on one page: native blue checkbox for Round trip, ink-styled ones for Digest and Calendar feed _(Settings; at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-200` **Polish** — Pending invite row truncates the email to 'friend@exam…' at phone widths _(Settings; at 360, 375, 390px, dark)_
- `LA-201` **Polish** — Offline card shows a disabled 'Save again' button when offline saving is not available _(Settings; at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-202` **Polish** — Empty-state copy in Share links and Calendar feed is set larger than the rest of the card text _(Settings (empty trip); at 375, 1440px)_
- `LA-203` **Polish** — Sidebar 'Back to' trip switcher truncates the trip name to 'Great Ocean R…' on every desktop width _(Sidebar (Help, What's new, Not found); at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-204` **Polish** — 'Share your Globe' dialog says 'Invite someone' but shows no invite control _(Globe share sheet; at 360, 390, 1440px)_
- `LA-205` **Polish** — More sheet is a plain text list with no icons and the Close button sits inside the first row's tap area _(Mobile More sheet; at 360, 390px)_

### Wishlist and Globe

- `LA-116` **Broken** — Wishlist header collapses at tablet widths: title one letter per line, toolbar overflows page _(Wishlist; at 768, 1024px)_
- `LA-154` **Ugly** — 'Wishlist' page title breaks mid-word ('Wis/hlist', 'Wishli/st') on phones _(Wishlist; at 360, 375, 390px, dark)_
- `LA-155` **Ugly** — Location filter chip row repeats the same place many times (Rovaniemi x3, Munich x3, London x3...) _(Wishlist; at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-156` **Ugly** — Globe map is a short box above a huge empty column while the marker list runs 3x taller _(Globe; at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-225` **Polish** — Wishlist map zoom control stays light-theme in dark mode; Globe's is themed _(Wishlist; at 390, 1440px, dark)_
- `LA-226` **Polish** — Phone header stacks a lone 'Add from Globe' button, then a lone right-aligned List/Map toggle _(Wishlist; at 360, 375, 390, 430px, dark)_
- `LA-227` **Polish** — Sidebar 'Back to' trip name truncates ('Great Ocean R...') with no title/tooltip _(Globe; at 1280, 1440, 1920, 2560px, dark)_
- `LA-228` **Polish** — Add Item dialog: Category chip row orphans 'Other' alone on a second line _(Add Item dialog (Wishlist); at 1440px)_

### Landing, Share, Privacy, Terms

- `LA-112` ~~Broken — Day by day section is invisible on phone and tablet: a 1800px blank scroll before the footer~~ — struck: harness artefact: the section reveals on scroll (share-reveal.tsx) and the full-page capture never scrolls; a real viewport paints it
- `LA-113` **Broken** — Dark theme: page stays light but headings use the dark-theme ink, leaving stop names near-invisible _(Share; at 390, 1440px, dark)_
- `LA-134` **Ugly** — Trip title breaks mid-word and mid-number: 'EU Christmas 202 / 6', 'Christ / mas 20 / 26' _(Share; at 360, 1024, 1280, 1440px, dark)_
- `LA-135` **Ugly** — Scrolled to the bottom, the hero card is painted over the Day by day sidebar and stop cards _(Share; at 1024, 1280, 1440, 1920px, dark)_
- `LA-136` **Ugly** — Collage cards cropped by the yellow panel edges at 1024 and 1280 _(Landing; at 1024, 1280px)_
- `LA-137` **Ugly** — At 2560 the collage's top row is cut off above the viewport and the city ticker disappears _(Landing; at 2560px)_
- `LA-189` **Polish** — Yellow panel has an empty band under the city ticker _(Landing; at 1024, 1280, 1440, 1920px, dark)_
- `LA-190` **Polish** — Phone hero: ~100px dead gap above the collage, side cards clipped at the screen edge, cream band below ticker _(Landing; at 360, 375, 390, 430px, dark)_
- `LA-191` **Polish** — At 768 the collage shrinks to a 400px island with a 160px void above it _(Landing; at 768px)_
- `LA-192` **Polish** — Landing page ignores the dark theme entirely _(Landing; at 390, 1440px, dark)_
- `LA-193` **Polish** — Logo mark loses its outline in dark theme and renders as a bare orange chevron _(Privacy / Terms; at 390, 1440px, dark)_
- `LA-194` **Polish** — 'Rovaniemi (La…' truncates in the Day by day sidebar although the column has room _(Share; at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-195` **Polish** — Phone and desktop share pages disagree on header, badge and button copy _(Share; at 360, 375, 390, 430, 768, 1024, 1440px)_
- `LA-196` **Polish** — About 200px of empty space between the last stop card and the 'View only' footer line _(Share; at 1024, 1280, 1440, 1920, 2560px, dark)_

## Coverage notes from the reviewers

**Money**

- Skipped (trigger not found on the Money page): overlay/accommodation-add/360-light, overlay/accommodation-add/390-light, overlay/accommodation-add/360-light-kbd, overlay/accommodation-add/390-light-kbd, overlay/item-add/360-light, overlay/item-add/390-light, overlay/item-add/360-light-kbd, overlay/item-add/390-light-kbd. Mobile Add Accommodation / Add Item sheets therefore not judged.
- overlay/transport-edit/1440-light, overlay/accommodation-add/1440-light, overlay/item-add/1440-light and overlay/notes-popover/1440-light were captured over the Plan page, not Money; the dialogs themselves looked fine (accommodation-add, notes-popover: no issues).
- deep/budget/deep/768-light-part1 shows a blank gap between the To pay card and Where it goes where the Rates card appears in the -end capture; treated as a capture artefact, not a finding.
- Auto 'spill' hits on the -ml-2.5 checkbox buttons (every width) are the deliberate negative margin on the 44px tap target; not reported. Auto 'overlap' hits on dialog sticky footers vs scrolled-under form content, and title vs absolute Close button, are false positives.
- The 'Where it goes' desktop card cut at 6 rows may be an intentional inner-scroll container; graded on what a Traveller sees (no affordance).

**Checklists, Files, Journal, Activity**

- Errored (no files): deep/checklists/deep/360-light, deep/checklists/deep/375-light, deep/checklists/deep/390-light, dark/checklists/deep/390-dark — page.screenshot clipped-area error. The Checklists phone findings are from 430 only; the h1 wrap (finding 1) will be worse at 360-390.
- deep/checklists/deep/1024-light-part2.png and empty/checklists/empty/375-light-part2.png are near-blank tails of the page; nothing to judge.
- Overlay auto 'overlap' on checklist-edit/1440 (Edit Item heading vs Close button) is a false positive: the close button sits clear of the heading.
- 54 small-target hits not judged individually; the file-card icon row and reminder delete icons are the likely true positives.
- Journal deep captures show only the 'Opens on day 1' gate (trip not started), so no journal entry layout was reviewable.

**Day and Calendar**

- Errored (locator.click timeout, no screenshot): deep/day/deep/768-light, 1024-light, 1280-light, 1440-light, 1920-light, 2560-light; phase/day/final-prep/768, 1440, 2560; phase/day/travelling/768, 1440, 2560; phase/day/past/768, 1440, 2560; dark/day/deep/1440-dark. The Day page was therefore not seen at any width above 430 or in dark at desktop.
- Skipped n/a (no dated days): phase/day/sketching/375, 768, 1440, 2560; empty/day/empty/375, 1440.
- phase/day/past/375-light auto sideways-scroll (scrollWidth 444) had no visible cause in the captures; likely the same day-carousel issue as finding 1 but could not be confirmed from the images.
- overlay/schedule-item/1440-light overlap hit (title vs Close) is not visible in the screenshot; treated as a false positive. The Schedule Item sheet looked fine at 360, 390 and 1440.
- Phone captures of the Calendar were all taken in Agenda view, desktop captures in Month view, so Month view was not seen on phones and Agenda was not seen on desktop.

**Home and Today**

- Home and Today captures are byte-identical in every set except the travelling phase (the /today route renders the Home page outside travelling), so findings are reported once under Home and apply to Today as well.
- phase/home/travelling/1440-light and phase/home/travelling/2560-light errored (locator.click timeout) and have no files; the travelling phase at those widths was judged from phase/today/travelling instead.
- phase/home/travelling/768-light part1 shows the yellow rail starting part-way down the page; this is the sticky rail in a stitched tall capture, not a page defect, and was not reported.
- Map tiles are absent in the sandbox (API KEY REQUIRED watermark); map colouring in dark theme was not judged.
- The 257 overlap hits are the cover-photo link / pot-card link covering their own text and the small-target count (172) was treated as noise per the brief.

**Plan**

- overlay/stop-edit/360-light, overlay/stop-edit/390-light, overlay/stop-edit/360-light-kbd, overlay/stop-edit/390-light-kbd were skipped by the collector ('coverage gap: no stop on the page') even though the deep Plan page has six stops; the phone Edit-stop sheet is unreviewed.
- overlay/save-template captures were taken on the Checklists page, not Plan; they looked fine and are included only via the shared dialog-header finding.
- The desktop '-end' captures (1024/1440/1920, light and dark) show stop cards missing their left column; reported as a finding but it may be a capture-timing artefact of an enter animation - verify in a real browser before fixing.
- Route map panel shows only the header (no tiles in the sandbox), so the map itself was not judged.
- Widths 375, 430, 1280 part2/end and 1920 part2 were skimmed only where they differed from neighbouring widths.

**Landing, Share, Privacy, Terms**

- No capture in this packet errored or was skipped; all 46 captures have files.
- Map tiles on the Share page show the CARTO 'API KEY REQUIRED' watermark and a grey left strip at 768 (sandbox has no tile network) — ignored per instructions.
- The Share 'Day by day' invisibility on phone/tablet (finding 1) and the hero-over-sidebar overlap in the desktop '-end' captures (finding 4) are consistent across widths but could be capture-side effects (reveal-on-scroll not firing in headless; sticky repaint after scroll-to-bottom). Both need a real-browser check before fixing.
- Landing dark captures are identical to light; reported as Polish since the wrapper is main.light and may be deliberate.
- Privacy and Terms were checked at 360, 768, 1440, 2560 light and 390/1440 dark (all parts); no layout faults found beyond the dark logo mark. 375/390/430/1024/1280/1920 light were skimmed via their siblings and not opened individually.
- Small-target count (95) was not investigated; the collector counts the 44px tap-target pseudo-element.

**Settings, Help, More, Admin**

- deep/admin/none/* and dark/admin/none/* render the 'Nothing here' not-found page at every width (the audit user is presumably not an Admin), so the Admin screen itself could not be judged.
- overlay/globe-share at 360/390 (with and without keyboard): the sheet extends below the viewport, so anything after the Current members list was not captured; the no-invite-control finding is based on the complete 1440 modal.
- Map tiles / 'API KEY REQUIRED' attribution behind the Globe share overlay ignored per instructions.
- Help and What's new at phone widths have no top app bar, but the Trips page at 360 has none either, so this was treated as house style for across-trips pages.
- Small-target hits (579) were not individually reviewed; nothing I could see visually looked under-sized apart from the native file input and the sidebar switcher.

**Summary, Compare, Print**

- No captures in this packet errored or were skipped.
- empty/compare/empty/375-light and empty/compare/empty/1440-light show the Plan page ('No stops yet') rather than a compare page — the route appears to redirect when a trip has no stops, so the empty compare state itself could not be judged.
- Not layout, but noticed: Budget summary categories differ between Summary and Print for the same trip (Summary: Accommodation $14,846.00, Transport $7,479.10; Print: Accommodation $15,130.81, Transport $2,264.00) while the totals match ($30,558.38). Worth a look by whoever owns the budget rollup.
- Map tiles / 'API KEY REQUIRED' watermark ignored per instructions. The Route map stays a light surface in dark theme; treated as the map canvas, not a theme defect.
- Overlay 'overlap' auto hits on promote-fork are the dialog's own scrolled list under the sticky footer (false positives); the Close button vs title overlap at 1440 is not visible as a real overlap.
- Skimmed but not individually reported: summary 375/430/1024/1280/1920, compare 375/430/1280/1920, print 375/390/430/1024/1280/1920 — no issues beyond those listed above at the neighbouring widths.

**Trips, New trip, Account**

- overlay/traveller-menu/360-light and overlay/traveller-menu/390-light were skipped by the collector (trigger button 'Open traveller menu' not found on phone widths); the traveller menu was only judged at 1440.
- deep/new-trip/none/1024-light full-page capture shows no top bar (logo, step pills, Cancel) and an empty preview pane; the -end capture of the same page shows them. Likely a capture timing artefact rather than a page bug, but worth a manual check.
- deep/account/none/768-light-end.png is a 60px sliver of the card bottom; the bottom-of-page state at 768 (FAB placement) could not be judged.
- The overlap hits on trip cards (link overlay vs headline/date text) and the Feedback 'Close' button are the expected full-card link pattern and were treated as false positives.
- The sidebar 'Back to Great Ocean R…' clipped-text hits at >=1280 are the intended truncation of a long trip name in a fixed-width sidebar control and were not reported.
- The grey column on the left of the map at >=1024 and the 'API KEY REQUIRED' watermark are tile-network artefacts and were ignored per instructions.

**Wishlist and Globe**

- No captures errored or were skipped in this packet; all 40 captures were reviewed (priority widths and every overlay/empty/dark capture in full, other widths skimmed).
- Every deep Wishlist capture is in Map view; the List view (item cards) only appears blurred behind the wishlist-add and add-from-globe overlay backdrops and was not judged. The 'Add an idea' button is reachable there on phones (the overlay collector clicked it at 360/390) but does not appear in the phone header in Map view.
- Automatic overlap hits on the mobile overlays (fields vs Cancel/Save in the sticky footer, h2 vs Close at 1440) are the dialog body scrolled under the sticky footer / the close button sitting inside the title's box; no visible overlap in any screenshot, not reported.
- The 596 small-target hits were not individually checked; the visible chips and icon buttons all look 36px+.
- Map tiles, the 'API KEY REQUIRED' watermark and the white Leaflet attribution strip were ignored per instructions; the dark-mode zoom-control inconsistency was reported because the Globe map proves it is styled separately.

