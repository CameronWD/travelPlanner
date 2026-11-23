# Shift and feedback check, 2026-11-23

This check measured layout shift (things moving on screen without being touched) across the whole signed-in app, on a phone and a desktop: 76 of 104 measurements read zero, and the rest come down to ten causes: five a contained change can stop, two need more than that, and three are meant to happen. The biggest are two maps that keep no space before they load: Summary's route map pushes the itinerary 380px down, and the phone Globe's map pushes the marker list 268px down on a slow connection. Adding a thing to do or a cost makes the rows below jump just after the form closes, and stopping that needs the new row shown at the tap. The Day view bell fix and the one-map trip home both pass in the browser.

## Measured before

**How.** The local dev server, the demo trip "EU Christmas 2026", signed in as the demo Traveller. Two screen sizes: a phone the size of an iPhone 17 installed as an app (402 wide), and a desktop window 1440 wide. Three kinds of moment:

- **Cold load**: open the page fresh. It is loaded twice as normal (the worse run counts) and once on a slowed connection and processor.
- **Switch**: go from one section to its neighbour, the way a tap on the tab bar or sidebar does. Measured once as is and once with the new page's data held back 1.5 seconds.
- **Action**: tick a checklist item, add a thing to do, add a cost, vote, mark a cost paid. The server's answer is held back 1.5 seconds so that movement at the tap ("during") is told apart from movement when the answer lands ("late"). Each change is put back afterwards.

The score is the browser's own measure: how much of the screen moved, times how far. 0.1 is a lot; 0.001 is a few pixels of a small thing.

**Caveat: this is not a clean "before".** Several fixes made earlier today are already in this code: the Day view bell (1320a599), one map on the trip home (0a6af9f3, a454a68c) and the feedback sweep. The earliest numbers, before any of those, are in the three measurement reports from this morning. Two commits from other work landed while the run was going: the Day strip's highlight fade (49ad65e3) and the iPhone launch images (49342aa9 and after). Everything that could have run after them was run again: the Day cold loads, every desktop switch, the phone switches to and from the Day view, and adding a thing to do. All 38 gave the same numbers, except one held value that read 0.0015 instead of 0.0014.

**Results that are not zero:**

| Moment | Where | Profile | Score (normal / slowed or held) | Earlier today |
|---|---|---|---|---|
| cold | Summary | phone | 0 / 0.1856 | 0 / 0.1856 |
| cold | Summary | desktop | 0.0916 / 0.0916 | same |
| cold | Globe | phone | 0 / 0.2369 | same |
| cold | Globe | desktop | 0.0051 / 0.0051 | same |
| cold | Trips | desktop | 0.0006 / 0.0006 | same |
| cold | Money | phone | 0.0001 (one run of two) / 0 | 0 / 0 |
| cold | Money | desktop | 0.0001 / 0 | same |
| switch | Journal → Summary, Activity → Summary | phone | 0.1856 / 0.1856 | same |
| switch | Journal → Summary, Activity → Summary | desktop | 0.0916 / 0.0916 | same |
| switch | Home → Plan | phone | 0.133 / 0.133 | same |
| switch | Plan → Home | phone | 0.1336 / 0.1336 | same |
| switch | Trips → trip home, trip home → Trips | phone | 0.0652 / 0.0652 | same |
| switch | Trips → trip home, trip home → Trips | desktop | 0.0567 / 0.0567 | same |
| switch | Plan → Day, Day → Plan, Money → Day | phone | 0.0014 / 0.0014 | same |
| switch | Day → Money | phone | 0.0015 / 0.0014 | same |
| switch | Calendar → Money | phone | 0.0001 / 0.0001 | same |
| switch | Day → Money, Calendar → Money | desktop | 0.0001 / 0 | same |
| action | Add a thing to do (Day) | phone | during 0, late 0.0242 | same |
| action | Add a thing to do (Day) | desktop | during 0, late 0.0082 | same |
| action | Add a cost (Money) | phone | during 0, late 0.0041 | same |
| action | Add a cost (Money) | desktop | during 0, late 0.0017 | same |

**Zeros:** 76 of the 104 measurements (38 cold loads, 56 switches, 10 actions) read zero in every mode. That includes the phone Day view on a cold load, which read 0.0014 this morning and now reads 0 normal and slowed.

**Two extra cases:**

- **Trips list with What's new unread.** The card was already showing for the demo Traveller (two unread notes). I also cleared their "seen" mark so every note was unread, measured Trips on both sizes, and put the mark back exactly as it was. The phone read 0. The desktop read 0.0006, the same as before, and from the same cause as before (the carousel arrows, S7). The card floats over the page, so it moves nothing.
- **Opening a trip page while its data is slow.** Two ways. A cold load of the trip home over a very slow link: the loading mark showed for about 5 seconds, then the page replaced it. Nothing moved on either size (0 shifts). Going from Trips into a trip with the data held back 1.5 seconds: the one movement is when the loading mark replaces the Trips list (S4 below). The step from loading mark to page moves nothing on either size. Polish decision N1 holds.

## Checked in a browser

**A. The Day view bell. Pass.**

- A cold load of a Day view on the phone reads 0, normal and slowed (it was 0.0014).
- The first HTML the server sends for a Day view URL has `min-w-11` on `#top-bar-trip-slot`, about 11KB into the page. The browser console shows no hydration warning and no errors.
- Going Plan → Day, Day → Plan, Money → Day, Day → Money, More → Day and Day → More: the search button, the Globe link and the avatar keep the same position to the tenth of a pixel. Only the bell's own 44px slot appears or goes. The group around them grows to the left, and that box is what the 0.0014 on those switches measures.
- At 360, 390 and 402 wide, the wordmark and the right-hand group sit on one row, with the bell present. No overlap, nothing clipped, no sideways page scroll. At 390 and 402 there are 25px and 37px between the wordmark and the bell. **At 360 there is no gap at all:** the bell's box touches the wordmark's dot, and the avatar ends 11.5px from the screen edge instead of 16. It fits, but only just.

**B. One map on the trip home. Pass, with one note.**

The demo trip "EU Christmas 2026" has a cover photo, so it shows the photo case. Its phone home shows the photo, then one map lower down, and no generated cover. No trip from the demo set itself is both photo-less and able to draw a route. So the no-photo case was checked on two trips from the base seed: "AI TRIP - EU Christmas" (Final prep, 7 located Stops) and "Europe Summer 2026" (Past, 3 located Stops).

- **AI TRIP (Final prep, no photo).** Exactly one map. It comes first in the page body, under the trip header and the What's new card, in a 224px box. The map fills the box exactly. Nothing scrolls inside it. Its hard 4px shadow is there. No generated cover.
- **Europe Summer (Past, no photo).** Exactly one map, in a 200px box, with no cover band. Nothing scrolls inside it; the shadow is there.
- **EU Christmas (photo).** One photo and one map (4:3, 278px). The map's shadow is there; nothing scrolls inside it.
- Nothing below the map moved while it loaded on any of the three, normal or slowed (0 each). The audit's own phone trip home also reads 0 / 0.
- Screenshots after the page settled: `home-phone-ai-trip-eu-christmas-first-screen.png` (and `-full.png`), `home-phone-europe-summer-2026-*.png` and `home-phone-eu-christmas-2026-13-*.png` in the audit's out dir.
- Note: in the test browser, Google Maps shows its "can't load Google Maps correctly" notice over the map (no 3D graphics in a headless browser, and the key went over its quota during the run). That is the test setup, not the app.

**C. The feedback sweep.** The five actions read exactly what this morning's measurement read, value for value and element for element. The sweep changed nothing that moves.

## Shift findings

| Id | Moment | Where | Score | What moves | Cause | Verdict |
|---|---|---|---|---|---|---|
| S1 | cold, switch | Summary, phone and desktop | phone 0.1856 (slowed load; Journal or Activity → Summary), desktop 0.0916 (every load and switch) | "Itinerary at a glance" and its city cards slide 380px down, off the bottom of a phone screen, when the route map arrives | `app/(app)/trips/[tripId]/summary/page.tsx:461`: the route map (380px tall) loads only in the browser, and until it does the shared map loader draws nothing (`components/ui/map-loader.tsx:57`), so no space is kept for it. Fix: wrap the Summary map in a box 380px tall that the server draws, as the trip home now does (a454a68c). The box must also hold the map's fallback card (no coordinates, or maps unavailable) inside it, scrolling, as the trip home's box does. | fix |
| S2 | cold | Globe, phone and desktop | phone 0.2369 (slowed load), desktop 0.0051 (every load) | Phone: "Tap the map to drop a marker" and the whole marker list slide 268px down when the map arrives. Desktop: only that caption under the map moves. | `components/globe/globe-view.tsx:126`: the Globe map loads only in the browser, and nothing keeps its height (`h-[260px]`, from lg `calc(100dvh-4.5rem)` at least 460px, set in `components/globe/globe-map.tsx:76`) before it does. Fix: wrap `GlobeMapLoader` in a box the server draws with the same heights as the map frame, holding its "map unavailable" fallback inside it too. | fix |
| S3 | switch | Home ↔ Plan, phone | 0.133 / 0.1336 | The page body starts 138px lower on Home than on Plan | `components/trip/trip-header-frame.tsx:37`: the trip header (name, dates, avatars, share, bell; 138px on a phone) shows on Home and is hidden on Plan, which draws its own header. | expected: two pages with different headers, swapped in one frame. A frame-by-frame recording (every 17ms, as is and with the data held 1.5s) shows Home and its header replaced by Plan in a single frame, with nothing moving before or after. Plan's cards fade in where they stand. |
| S4 | switch | Trips ↔ a trip, phone and desktop | phone 0.0652, desktop 0.0567 | Phone: the trip's top bar (57px) appears and the loading mark replaces the Trips list. Desktop: the sidebar swaps "Across trips, Trips, Globe" for the trip's own sections, pushing Trips, Globe and You below the window, and the switcher card grows about 7px as it becomes a placeholder. | The top bar shows only inside a trip (`app/(app)/layout.tsx:159`, `OnTripPath`); the sidebar's rows come from the address (`components/shell/app-shell-rail.tsx:64`). Both change at the moment the trip's loading mark replaces the Trips list (`app/(app)/trips/loading.tsx:9`). | expected: entering or leaving a trip changes the whole screen in one frame. Frames show the Trips list gone and the trip's chrome in place in the same frame; nothing slides while being looked at, and the loading mark → page step moves nothing. One part could be evened out on its own: the desktop switcher placeholder is about 7px taller than the "Back to" card it replaces. That is lost in the sidebar's full change in the same frame, so it gets no row of its own. |
| S5 | switch | Plan, Money or More ↔ Day, phone | 0.0014 | The right-hand group's own box grows 48px to the left as the bell arrives (shrinks as it goes) | `components/shell/top-bar-trip-slot.tsx:9`: the slot keeps 44px on Day paths only. | expected: only the bell's own slot appears; no other control moves |
| S6 | cold, switch | Money (Budget), phone and desktop | 0.0001 | The cents (".80") slide 33px (phone) or 51px (desktop) sideways while the total counts up from $0 | `components/money/money-count-up.tsx:55`: the whole-dollar part counts up from 0 and grows wider as it goes, and the cents sit right after it. Fix: keep the final total's width from the first frame (for example an invisible copy of the final whole value under the counting one), so the cents never move. | fix |
| S7 | cold | Trips, desktop | 0.0006 | The header's button group grows 98px to the left when the carousel arrows appear; "+ New trip" stays put | `components/trips/trip-carousel.tsx:92`: the arrows are drawn only after the browser has measured that the cards overflow (`:38–41`, in an effect). Fix: draw the arrows from the first paint, hidden until measured, so their 98px is always kept. | fix |
| S8 | action | Add a thing to do, Day, phone and desktop | phone 0.0242, desktop 0.0082 | The Add Item sheet slides away over the old list ("2 things"). About 230ms later, with the sheet gone, the new row appears and "Nearby from your Wishlist", "Add to this day" and the "Tonight" card jump 116px down in front of the Traveller. | `components/ui/use-server-action.ts:64` (the Item form reaches it through `components/ui/use-entity-form.ts:28`): the form closes from code that runs after an `await` inside a transition. React treats that close as urgent, so it happens at once, and the refreshed list follows as a separate, later update. Underneath that, the add is not shown at once: the row exists only once the server has answered, and nothing keeps space for it. | list: stopping it needs the new row to appear at the tap (an optimistic insert into the Day's server-drawn list, with a way back if the save fails). Neither this list nor any other in the app has that layer for a new Item, so it is more than a contained change a week before the trip. A smaller change helps only the phone: run the success callback inside `startTransition` here, so the sheet closes in the same frame as the new list arrives and the jump happens under the sheet. The audit's number would not drop, because the browser counts movement under an overlay. Success would be the first frame of the sheet leaving already showing the new row. Desktop is unchecked: its dialog is centred and the list may show around it. |
| S9 | action | Add a thing to do, Day strip, phone and desktop | part of S8 | The day's dots under the date in the Day strip move 5px left as a third dot is added (the row stays centred) | `components/trip/day/day-strip.tsx:305`: the dot row is as wide as its dots and centred under the date. Fix: give the row a fixed width of three dots (26px) and fill from the left. That is a small change of look: one or two dots sit left of centre. This is separate from S8: even with the row shown at the tap, the dots would still slide. | fix |
| S10 | action | Add a cost, Money, phone and desktop | phone 0.0041, desktop 0.0017 | When the server answers, the new cost arrives at the top of "Recent costs" and the rows under it drop 44px; on desktop the "Rates to AUD" card is pushed up into view at the bottom. The dialog shuts in one frame about 100ms before this, so the jump happens in front of the Traveller. | `components/trip/other-cost-editor.tsx:349`: the dialog closes right after `await createCost(...)`, an urgent update, and the refreshed list follows later as a separate update. Underneath that, the new cost exists only once the server has answered. | list: same as S8. Stopping it needs the new cost shown at the tap (an optimistic insert into "Recent costs"), which that list does not have. The smaller change of closing the dialog inside `startTransition` would hide the jump behind the closing dialog on the phone without lowering the audit's number. |

## Fixed

A later step fills this in.

## Waiting on Cam

A later step fills this in.

## Feedback sweep

A later step fills this in.
