# Shift and feedback check, 2026-11-23

This check measured layout shift (things moving on screen without being touched) across the signed-in app, on a phone and a desktop, before and after today's fixes, and looked at how every control that changes something answers when pressed. Before the fixes 76 of 104 measurements read zero; after them 89 of 104 do: the Summary route map (wherever a route can be drawn), the Globe map, the Money total's cents and the Trips carousel arrows no longer push anything, and the sweep made 55 controls show their result at once or say they are working. The two things you most need to know: the new iPhone launch only appears after Teepee is deleted and re-added, which very likely signs you out and drops the trips saved for offline (read the warning below first), and one shift turned up on trip Settings on a desktop that the before run missed: the cover photo preview keeps no space until the photo arrives, so the form below drops about 200px (older than today, and it only happens when the photo is slow). A separate review of the whole branch by another agent found nothing that had to be fixed in the app beyond two tiny follow-ups, which are in.

> **Read this before you delete or re-add Teepee on either phone.**
>
> The new launch picture and the animated launch page will not appear on the phones as they are now. iOS remembers the address an installed app opens at from the day it was added to the Home Screen, so both phones keep opening at the old address. Neither will see the animated launch page, and possibly not the launch picture either, until Teepee is deleted and added again.
>
> **Deleting Teepee will very likely sign you out and throw away the trips saved for offline use.** Do not do it close to departure. If you do it, do it on Wi-Fi, with time to sign in again and save every trip for offline again.
>
> Ship the launch part early in the week, not on the 30th. It is the only change that touches how the app opens, and it has not run on a real iPhone. It can be held back on its own by reverting one line: `start_url` in `app/manifest.ts`.

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

## Checked in a browser, before

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

## Measured after

**Whose numbers these are.** Same local dev server, same demo trip, same two screen sizes, same audit and the same rules as the "before" run above.

- **Cold loads and switches:** the first agent on this last step ran them at about 15:55 to 16:14 today, before it was stopped when the machine went offline. The cold loads ran on d9e0cb52 (the last two small fixes, 23165262 and 879eff7b, landed as that set finished); the switches ran on 879eff7b. Both runs were taken online and finished with no errors.
- **Actions, the Settings re-runs, the two extra cases and the looks in a browser:** measured for this write-up, later the same afternoon, on 879eff7b.
- **Before:** the "Measured before" run above (about 14:33 to 15:01).

**Results that were not zero before or are not zero now:**

| Moment | Where | Profile | Before (normal / slowed or held) | After (normal / slowed or held) |
|---|---|---|---|---|
| cold | Summary | phone | 0 / 0.1856 | 0 / 0 |
| cold | Summary | desktop | 0.0916 / 0.0916 | 0 / 0 |
| cold | Globe | phone | 0 / 0.2369 | 0 / 0 |
| cold | Globe | desktop | 0.0051 / 0.0051 | 0 / 0 |
| cold | Trips | desktop | 0.0006 / 0.0006 | 0 / 0 |
| cold | Money | phone | 0.0001 (one run of two) / 0 | 0 / 0 |
| cold | Money | desktop | 0.0001 / 0 | 0 / 0 |
| cold | **Settings** | **desktop** | **0 / 0** | **0.032 (one run of two) / 0. Worse: see S11** |
| switch | Journal → Summary, Activity → Summary | phone | 0.1856 / 0.1856 | 0 / 0 |
| switch | Journal → Summary, Activity → Summary | desktop | 0.0916 / 0.0916 | 0 / 0 |
| switch | Home → Plan | phone | 0.133 / 0.133 | 0.133 / 0.133 (expected, S3) |
| switch | Plan → Home | phone | 0.1336 / 0.1336 | 0.1336 / 0.1336 (expected, S3) |
| switch | Trips → trip home, trip home → Trips | phone | 0.0652 / 0.0652 | 0.0652 / 0.0652 (expected, S4) |
| switch | Trips → trip home, trip home → Trips | desktop | 0.0567 / 0.0567 | 0.0567 / 0.0567 (expected, S4) |
| switch | Plan → Day, Day → Plan, Money → Day | phone | 0.0014 / 0.0014 | 0.0014 / 0.0014 (the bell's own space, S5) |
| switch | Day → Money | phone | 0.0015 / 0.0014 | 0.0014 / 0.0014 (the cents no longer add to it) |
| switch | Calendar → Money | phone | 0.0001 / 0.0001 | 0 / 0 |
| switch | Day → Money, Calendar → Money | desktop | 0.0001 / 0 | 0 / 0 |
| action | Add a thing to do (Day) | phone | during 0, late 0.0242 | during 0, late 0.0242 (listed, S8) |
| action | Add a thing to do (Day) | desktop | during 0, late 0.0082 | during 0, late 0.0082 (listed, S8) |
| action | Add a cost (Money) | phone | during 0, late 0.0041 | during 0, late 0.0041 (listed, S10) |
| action | Add a cost (Money) | desktop | during 0, late 0.0017 | during 0, late 0.0017 (listed, S10) |

**Zeros:** 89 of 104 read zero in every mode after, against 76 of 104 before.

| | Before | After |
|---|---|---|
| Cold loads | 31 of 38 | 37 of 38 |
| Switches | 39 of 56 | 46 of 56 |
| Actions | 6 of 10 | 6 of 10 |
| All | 76 of 104 | 89 of 104 |

Every one of the 15 that are not zero after is one of the "expected" or "listed" findings below, except Settings on a desktop (S11). Nothing else reads worse than before. The Day view's phone cold load, which read 0.0014 first thing this morning (before the bell fix), reads 0 before and after.

**The action run.** It first looked for anything an interrupted run had left on the demo trip and found nothing ("recover: nothing left over from an earlier run"), and no cost named "Audit paid" was on the trip beforehand, so the stopped run left nothing behind. All ten flows put their change back (`undone`), and a snapshot of the demo trip's checklist, things to do, votes and costs was the same before and after.

**Settings on a desktop.** Run three more times: 0.032, 0, 0. So the 0.032 is real, not the dev server reloading the page mid-run. Holding the cover photo's download back 1.5 seconds gives 0.032 every time, from the same four elements; with no delay it reads 0. The cause is in S11 below.

**Two extra cases**, done the same way as before:

- **Trips list with What's new unread.** The "seen" mark was cleared, Trips measured on both sizes, and the mark put back exactly as it was (checked). Phone 0, desktop 0 (it was 0.0006, from the carousel arrows, S7).
- **Opening a trip page while its data is slow.** A cold load of the trip home over a very slow link: the loading mark showed from about 1.3 to 6.3 seconds, then the page replaced it; nothing moved on either size (0 shifts, as before). Going from Trips into a trip with the data held back 1.5 seconds: one movement, when the loading mark replaces the Trips list, 0.0652 on the phone and 0.0567 on a desktop, the same as before (S4). The step from loading mark to page moves nothing.

**Looked at in a browser:**

- **Trips header** (desktop, 1440 and 768 wide). With the demo data (ten trips) the cards overflow at both widths, so the arrows show and there is no empty space to see. "6 coming up · 4 done" stays on one line at 768. To see what the kept space looks like when there are too few trips to need arrows, the arrows were hidden by hand in the test browser (a simulation, not the app doing it): "+ New trip" stays at the right and the empty 98px sits in the header's existing blank space to the left of it. It does not read as a hole.
- **Money total.** The cents' position was recorded on every frame of the count-up on a cold load of Money. Phone: 245.7px from the left on every frame, from the first frame the total is on screen to the end. Desktop: 626.8px on every frame. They do not move at all (0px; in the before run they slid 33px on the phone and 51px on a desktop), and no shift was logged. The total's box kept one width throughout, so the heading font's digits are equal width at these sizes. One thing seen, older than today: on a cold load the card fades in showing the final total faintly for about a tenth of a second, then restarts from $0 and counts up.
- **Summary.** The loaded map is 380px tall, fills its box exactly, has its frame (2px border, rounded corners) and hard shadow, and nothing scrolls inside it, on phone and desktop; 0 normal and slowed. The demo set has one trip with fewer than two Stops that have a place set, "Blue Mountains by rail" (one, dated). Its Summary shows the "Add coordinates to your stops" card (127px), not an empty 380px box. But on a slowed phone load the card arrives late and pushes "Itinerary at a glance" 127px down (0.0597): see S12.
- **Globe.** The map fills its box exactly on both: 370 × 260 on the phone, 709 × 828 on a desktop. Nothing scrolls inside it; 0 normal and slowed.
- **Wishlist.** On a desktop, the seven cards sit in rows of three, and every card in a row is the same height as the others (241px for the first row, 267px for the second); the card fills the new wrapper exactly. On the phone the cards sit one per row, so there is nothing to line up.
- In the test browser Google Maps shows its "can't load Google Maps correctly" notice over the maps (no 3D graphics in a headless browser). That is the test setup, not the app.

Screenshots and the raw numbers are in the audit's out dir for this run (`after-run/` in the session's scratch folder): `trips-header-1440.png`, `trips-header-768.png`, the two `-arrows-hidden-simulated.png` versions, `countup-phone/` and `countup-1440/` (frame by frame), `summary-*.png`, `globe-*.png`, `wishlist-1440.png`, `wishlist-phone.png`.

**Tests and build.** On d9e0cb52: `npm test` 985 files and 14,563 tests passed; `npm run build` finished cleanly; `npm run test:integration` 58 files and 298 tests passed. Two small code commits came after that (23165262 and 879eff7b), so these numbers are for d9e0cb52.

_Final run after the last two fixes: to be filled in by the orchestrator_

## Shift findings

| Id | Moment | Where | Score | What moves | Cause | Verdict |
|---|---|---|---|---|---|---|
| S1 | cold, switch | Summary, phone and desktop | phone 0.1856 (slowed load; Journal or Activity → Summary), desktop 0.0916 (every load and switch) | "Itinerary at a glance" and its city cards slide 380px down, off the bottom of a phone screen, when the route map arrives | `app/(app)/trips/[tripId]/summary/page.tsx:461`: the route map (380px tall) loads only in the browser, and until it does the shared map loader draws nothing (`components/ui/map-loader.tsx:57`), so no space is kept for it. Fix: wrap the Summary map in a box 380px tall that the server draws, as the trip home now does (a454a68c). The box must also hold the map's fallback card (no coordinates, or maps unavailable) inside it, scrolling, as the trip home's box does. | fixed (263eba0c) for every trip whose route can be drawn: 0 after on both sizes, cold load and switch. A trip with fewer than two dated Stops that have a place set still moves on a slow load: S12. |
| S2 | cold | Globe, phone and desktop | phone 0.2369 (slowed load), desktop 0.0051 (every load) | Phone: "Tap the map to drop a marker" and the whole marker list slide 268px down when the map arrives. Desktop: only that caption under the map moves. | `components/globe/globe-view.tsx:126`: the Globe map loads only in the browser, and nothing keeps its height (`h-[260px]`, from lg `calc(100dvh-4.5rem)` at least 460px, set in `components/globe/globe-map.tsx:76`) before it does. Fix: wrap `GlobeMapLoader` in a box the server draws with the same heights as the map frame, holding its "map unavailable" fallback inside it too. | fixed (fbbdcf45): 0 after on both sizes, normal and slowed |
| S3 | switch | Home ↔ Plan, phone | 0.133 / 0.1336 | The page body starts 138px lower on Home than on Plan | `components/trip/trip-header-frame.tsx:37`: the trip header (name, dates, avatars, share, bell; 138px on a phone) shows on Home and is hidden on Plan, which draws its own header. | expected: two pages with different headers, swapped in one frame. A frame-by-frame recording (every 17ms, as is and with the data held 1.5s) shows Home and its header replaced by Plan in a single frame, with nothing moving before or after. Plan's cards fade in where they stand. |
| S4 | switch | Trips ↔ a trip, phone and desktop | phone 0.0652, desktop 0.0567 | Phone: the trip's top bar (57px) appears and the loading mark replaces the Trips list. Desktop: the sidebar swaps "Across trips, Trips, Globe" for the trip's own sections, pushing Trips, Globe and You below the window, and the switcher card grows about 7px as it becomes a placeholder. | The top bar shows only inside a trip (`app/(app)/layout.tsx:159`, `OnTripPath`); the sidebar's rows come from the address (`components/shell/app-shell-rail.tsx:64`). Both change at the moment the trip's loading mark replaces the Trips list (`app/(app)/trips/loading.tsx:9`). | expected: entering or leaving a trip changes the whole screen in one frame. Frames show the Trips list gone and the trip's chrome in place in the same frame; nothing slides while being looked at, and the loading mark → page step moves nothing. One part could be evened out on its own: the desktop switcher placeholder is about 7px taller than the "Back to" card it replaces. That is lost in the sidebar's full change in the same frame, so it gets no row of its own. |
| S5 | switch | Plan, Money or More ↔ Day, phone | 0.0014 | The right-hand group's own box grows 48px to the left as the bell arrives (shrinks as it goes) | `components/shell/top-bar-trip-slot.tsx:9`: the slot keeps 44px on Day paths only. | expected: only the bell's own slot appears; no other control moves |
| S6 | cold, switch | Money (Budget), phone and desktop | 0.0001 | The cents (".80") slide 33px (phone) or 51px (desktop) sideways while the total counts up from $0 | `components/money/money-count-up.tsx:55`: the whole-dollar part counts up from 0 and grows wider as it goes, and the cents sit right after it. Fix: keep the final total's width from the first frame (for example an invisible copy of the final whole value under the counting one), so the cents never move. | fixed (5a9c3daa): 0 after; the cents stay on the same pixel through the whole count-up |
| S7 | cold | Trips, desktop | 0.0006 | The header's button group grows 98px to the left when the carousel arrows appear; "+ New trip" stays put | `components/trips/trip-carousel.tsx:92`: the arrows are drawn only after the browser has measured that the cards overflow (`:38–41`, in an effect). Fix: draw the arrows from the first paint, hidden until measured, so their 98px is always kept. | fixed (eff02ee6): 0 after, including with What's new unread |
| S8 | action | Add a thing to do, Day, phone and desktop | phone 0.0242, desktop 0.0082 | The Add Item sheet slides away over the old list ("2 things"). About 230ms later, with the sheet gone, the new row appears and "Nearby from your Wishlist", "Add to this day" and the "Tonight" card jump 116px down in front of the Traveller. | `components/ui/use-server-action.ts:64` (the Item form reaches it through `components/ui/use-entity-form.ts:28`): the form closes from code that runs after an `await` inside a transition. React treats that close as urgent, so it happens at once, and the refreshed list follows as a separate, later update. Underneath that, the add is not shown at once: the row exists only once the server has answered, and nothing keeps space for it. | list: stopping it needs the new row to appear at the tap (an optimistic insert into the Day's server-drawn list, with a way back if the save fails). Neither this list nor any other in the app has that layer for a new Item, so it is more than a contained change a week before the trip. A smaller change helps only the phone: run the success callback inside `startTransition` here, so the sheet closes in the same frame as the new list arrives and the jump happens under the sheet. The audit's number would not drop, because the browser counts movement under an overlay. Success would be the first frame of the sheet leaving already showing the new row. Desktop is unchecked: its dialog is centred and the list may show around it. |
| S9 | action | Add a thing to do, Day strip, phone and desktop | part of S8 | The day's dots under the date in the Day strip move 5px left as a third dot is added (the row stays centred) | `components/trip/day/day-strip.tsx:305`: the dot row is as wide as its dots and centred under the date. This is separate from S8: even with the row shown at the tap, the dots would still slide. | left as it was: a fix was built (5fbf565e) and undone (316cccef) because it left one or two dots off-centre under every day; your choice. Undone by the orchestrator's decision after review, not at your request. The options are under "Waiting on Cam". |
| S11 | cold | trip Settings, desktop | 0.032 in one plain load of two (the before run 0; three more runs read 0.032, 0, 0) | The trip details form, the cover photo's description line and the focal-point marker drop 198px when the cover photo preview arrives | `components/trip/settings/cover-image-field.tsx:148`: the preview `<img>` (`h-auto w-full`) has no width and height, so its box is 4px tall until the photo has downloaded, then 201.5px. Proven by holding the photo's download back 1.5 seconds: 0.032 every time, from the same elements. None of today's commits made it: the image markup dates from September (3b3cd032); 040654cc only added the busy spinners to Choose photo and Remove, and 879eff7b and a8c1c125 do not touch it. It shows only when the photo arrives after the page is first drawn, so it comes and goes. | new, not fixed: a fix would give the preview a fixed shape (for example the cover's own aspect ratio) so the space is kept before the photo arrives. On the phone, Settings read 0 in every run. |
| S12 | cold | Summary, phone, a trip with fewer than two dated Stops that have a place set | 0.0597 slowed, 0 normal (not measured in the before run) | "Itinerary at a glance" and the card below drop 127px when the "Add coordinates to your stops" card arrives | `app/(app)/trips/[tripId]/summary/page.tsx:466`: the S1 fix keeps a 380px box only when the route can be drawn (so a trip that cannot draw one has no empty 380px gap). Otherwise the page still draws the map loader with no box, and the card it shows instead arrives only once the map code has loaded. That path is the same code as before today's fix, so this is not new today; the before run did not look at such a trip. | new, not fixed: a fix would draw that card from the server, or keep a box the card's height. The route map counts only dated Stops (`routeMapCanDraw` needs two with a place set), so this hits any trip that has fewer than two of them, including a Planning trip whose Stops are all still rough. |
| S10 | action | Add a cost, Money, phone and desktop | phone 0.0041, desktop 0.0017 | When the server answers, the new cost arrives at the top of "Recent costs" and the rows under it drop 44px; on desktop the "Rates to AUD" card is pushed up into view at the bottom. The dialog shuts in one frame about 100ms before this, so the jump happens in front of the Traveller. | `components/trip/other-cost-editor.tsx:349`: the dialog closes right after `await createCost(...)`, an urgent update, and the refreshed list follows later as a separate update. Underneath that, the new cost exists only once the server has answered. | list: same as S8. Stopping it needs the new cost shown at the tap (an optimistic insert into "Recent costs"), which that list does not have. The smaller change of closing the dialog inside `startTransition` would hide the jump behind the closing dialog on the phone without lowering the audit's number. |

## Fixed

Before → after is the browser's score (normal / slowed or held); "before" is this afternoon's run unless it says otherwise.

- **Summary route map (S1).** The map's 380px is kept from the start, so the itinerary below no longer drops. Phone slowed load and the switches into Summary 0.1856 → 0; desktop 0.0916 → 0. 263eba0c.
- **Globe map (S2).** The map's height is kept from the start, so the marker list no longer drops 268px. Phone slowed 0.2369 → 0; desktop 0.0051 → 0. fbbdcf45.
- **Money total's cents (S6).** The total keeps its final width while it counts up, so the cents stay on the same pixel (they slid 33px on a phone and 51px on a desktop). Money 0.0001 → 0 on both; Day → Money on a phone 0.0015 → 0.0014 (what is left is the bell's own space, S5). 5a9c3daa.
- **Trips carousel arrows (S7).** Their 98px beside "+ New trip" is always kept. Trips on a desktop 0.0006 → 0, with or without What's new. eff02ee6.
- **Day view bell.** The bell's space in the top bar is kept from the first paint, and the bell sits at the left end of its group, so the search button, Globe and your picture no longer move. Day view phone cold load 0.0014 (first thing this morning) → 0. 8d02e8eb, 1320a599.
- **One map on the trip home.** A trip with no cover photo used to show a picture of the route and then the real map below it; now the real map is the header and the only map. Checked on two trips with no photo: one map, in its box, nothing below it moving while it loads (0 / 0). Two maps → one. 0a6af9f3, a454a68c.
- **Controls that change something now answer when pressed:** see "Feedback sweep" below. 5 show their result at once, 50 say they are working, and a button showing a spinner can no longer be pressed twice (a8c1c125).
- **Two follow-ups from the whole-branch review.** On the launch path, a failed lookup of the saved launch page now counts as "not saved" instead of stopping the launch (23165262). Removing a Traveller in trip Settings frees its button again if the call fails (879eff7b).

## Also built today, at your request

These were not in the original plan.

- **One map on the trip home** (0a6af9f3, a454a68c). With no cover photo, the trip home used to show a picture of the route and then the real map below it. Now the real map sits at the top, in the cover's place, and is the only map. A trip that cannot draw a route keeps its plain header, and the Past trip home on a phone keeps its map below the recap.
- **The Day strip's highlight fades** (49ad65e3). On a phone, the orange highlight on the selected day now fades out and fades in on the new day, instead of sliding across.
- **iPhone launch pictures and an animated launch page** (49342aa9, db5a71f6, 6218e455, d8c06f15, 23165262). Opening the installed app shows the Teepee mark instead of a blank screen, and then an animated mark until the app arrives. If the launch page cannot be found, it falls back to any saved copy, then to the start page, and never waits longer than the usual time limit; a failed lookup counts as "not saved" rather than stopping the launch. **Existing installs will not see it until the app is deleted and re-added: read the warning at the top before you do that.**

## Waiting on Cam

> **Before you delete or re-add Teepee on either phone, read the warning at the top of this page.** Deleting it very likely signs you out and throws away the trips saved for offline use.

### The trip home feedback note

- The note about the trip home (`cmwsfnhr5000008jofthb122n`) had two halves. The first (the page behind the Feedback panel scrolled while you wrote) was fixed by this morning's batch and is already live. The second (the map as the header) is today's single map. So the note is fully answered once this branch is live: resolve it then, not before.

### Found by this check, not fixed

- **Trip Settings on a desktop (S11).** When the cover photo is slow to arrive, the form below its preview drops about 200px. Older than today; the before run happened not to catch it. A fix is small (give the preview a fixed shape), but it is not built.
- **Summary for a trip with fewer than two dated Stops that have a place set (S12).** On a slow phone connection, "Itinerary at a glance" drops 127px when the "Add coordinates to your stops" card arrives. The same as before today. It is not rare: a Planning trip whose Stops are all still rough has no route to draw either.

### Launch

- **Ship it early in the week, not on the 30th.** It is the only change that touches how the app opens, and it has not run on a real iPhone. It can be held back on its own by reverting the `start_url` line in `app/manifest.ts`.
- Existing installs keep opening at the old address (the warning at the top). Only a re-added install shows the new launch.
- Opening the app still takes two steps (the start page, then the Trips list). That is because the offline launch opens the saved trip only from the start page. The animation now covers the wait.
- Nothing more is planned for after the trip. A simple launch page took the place of the riskier idea of changing how the app's offline helper answers.

### Weak or no signal

- **Trip home with no cover photo, in Planning and Final prep.** On a phone with weak or no signal, the top of the trip home now shows an empty box for a moment and then, with no signal, a "map isn't available" card with the Stop list. It used to show a saved picture of the route there. The Travelling home (from the day the trip starts) is unchanged.
- **Blank space under the "map isn't available" card.** Offline, Globe on a phone and the Past trip home show empty space under the card, because the map's full space is kept. It can be closed up, at the cost of a small jump when the card appears.
- **Removing a Traveller while offline** fails without any message. It did before today too.

### Left as it was, and why

- **Home and Plan on a phone (S3).** Home has the trip header band above the page, and the other sections do not, so going between them swaps that band. The swap happens in one frame; nothing slides while you watch. If it still bothers you, the choice is to show the band on every section, or on none.
- **Going into or out of a trip (S4).** The whole screen changes in one frame. Not changed.
- **The bell's space on the Day view (S5).** When you go into the Day view, the bell's own space appears in the top bar. No other control moves. Not changed.
- **Adding a thing to do (S8).** When the new one arrives, the rows below it drop about 116px. Stopping that properly means showing the new row before the server answers. Not built. Branch B (rows that slide in) would soften it.
- **Adding a cost (S10).** The same, by 44px.
- **The dots under a day in the Day strip (S9).** When you add a third thing to a day, its dots re-centre by 5px. A fix was built and then undone, by the orchestrator's decision after review (not at your request): it kept the dots still, but left one or two dots off-centre under every day, all the time. Your choice: leave it (dots centred, a 5px re-centre when you add one), or fill from the centre outward (one and three dots look as they do today, nothing slides, and a pair of dots sits 5px left of centre).

### Controls the sweep did not change, and why

- **Day title (F32).** When you type a title, the box closes and the old title shows until the page refreshes. Fixing it needs the typed title held on screen until the server answers.
- **Driving estimates in trip Settings (F128).** Every keystroke saves. It needs a decision: save when you leave the box, or after a short pause.
- **Confirm dialogs (F168).** They close at once, by design. The wait shows on the row that started it instead.
- **The Undo button on an undo message (F171).** It gives no sign while it runs.
- **Sign out, the menu item (F167).** The menu closes the moment it is chosen, so there is nothing to show a spinner on. The Sign out button itself now says it is working.
- **"This is fine" and its Undo on a travel-time flag (F38, F39).** They grey out as before, and now tell a screen reader they are busy. They were not made instant, because the flag moves between two parts of the page and the server checks it against the plan.
- **Pin a Stop's dates (F25).** The row dims and says it is busy, now on a phone too. Not made instant, because the planner has no way to put a pin back if the save fails.
- **Drag a thing to do to another day (F15).** The card stays on its old day until the server answers, and nothing on screen changes meanwhile (a screen reader hears the Stop is busy, and a second drop is ignored). Making it instant needs a copy of each day's list kept on the phone, plus Undo handling.
- **Pick a day for an idea in the planner (F30).** A second pick is now ignored, and a screen reader hears that the Stop is busy, but nothing visible changes while it saves.

### Behaviours to know about

- While a Stop's action is saving, that one row cannot be tapped, on a phone or a desktop. On a connection that hangs, it stays that way until the request fails. A reload frees it.
- **Past trip home on a phone.** With no cover photo, the photo band is gone and the map stays below the recap. That was your call on 23 Nov.
- **The map at the top of the trip home** takes the cover's box (224px tall on a phone) instead of its old 4:3 shape. That was the orchestrator's call; you can ask for it taller.
- **The bell on the Day view** now sits at the left end of its group in the top bar (it was between the Globe and your picture), so nothing else moves when it arrives. The orchestrator's call.
- **The phone top bar at 360px wide** has no room to spare with the bell showing: the group runs 4.5px into the edge margin. Neither of your phones is that narrow (yours are 390 and 402).
- A Day address with a date that does not exist shows its error page with an empty 48px gap where the bell would be.
- **When Google Maps cannot load**, on Globe the "unavailable" card now sits at the top of the map's full space (before, the page closed up around it). The same on Summary (380px), the trip home (224px) and the Past trip home (200px).
- **Trips list on a desktop:** 98px is always kept for the carousel arrows beside "+ New trip", even when there are too few trips to need them. With the demo's ten trips the arrows show at 1440 and 768 wide, so there is no gap. With the arrows hidden by hand in the test browser, the empty space sits in the header's blank area to the left of "+ New trip" and does not read as a hole. "6 coming up · 4 done" stays on one line at 768.
- **Wishlist cards** (a wrapper was added around each card today): on a desktop every card in a row is still the same height; on a phone they sit one per row. Nothing to do.
- **Planner moves:** dragging a Stop and a menu Move up or Move down can overlap. If both fail, the order on screen is wrong until a reload (nothing is saved wrongly).
- **Desktop Past trip home:** its map still keeps no space before it loads.
- Dark mode is parked, so the launch pictures and the launch page are light only, whatever the phone is set to.
- The audit's action set writes Activity entries on the local demo trip that it cannot remove. It now runs only when asked for by name.
- Two commit messages (4dfe069e, 24632d7f) carry a stray `Resolves-Feedback: none` line and the wrong model name. They were not reworded, because that means rewriting the branch's history. You can ask for it.

### Phone checks

Nothing below has been seen on a real iPhone. From today:

- **Day view:** the bell sits at the left of its group; the Globe and your picture do not move when you go into or out of the Day view.
- **Day strip:** the selected day's highlight fades between days; no flicker during a swipe.
- **Trip home with no cover photo:** one map at the top; nothing below it jumps when it loads. And the same page in airplane mode: what shows at the top.
- **Summary and Globe:** nothing jumps when the map appears, on mobile data.
- **Money:** the cents stay still while the total counts up.
- **Planner:** Move up or Move down on a rough Stop shows the new order at once; a second Stop's move is unavailable until the first finishes; Pin, Make rough and the Surprise actions dim the row while saving.
- **Shopping list:** tick and untick quickly; "need to buy"; moving a checklist item.
- **After deploy, on a re-added install only** (read the warning at the top of this page first): the launch picture shows; the animated mark holds until the app arrives, or flashes blank; airplane mode after one online launch opens the saved trip; the still picture lines up with the animated mark.

Still owed from earlier sessions:

- The keyboard up in the Feedback panel.
- A sheet opened on a scrolled page.
- The More sheet, then another page.
- The Summary money tile and the Stop badges.
- The trip home band and the Trips list map in airplane mode.
- Attachment links at 32pt.
- The 20 Nov and 22 Nov lists.

### Not built: Branch B

A press response on everything you can tap; rows sliding in and out of lists; the tick and toggle pop everywhere; a save tick on things that save in place. It is planned as its own branch on top of this one, merged in one go so one revert removes it, and sent to beta first.

## Feedback sweep

The sweep looked at every control in the signed-in app that changes something: 172 of them (167 on screens, plus 5 shared pieces that many screens use, such as the confirm dialog and the row of Edit and Delete icons). For each one it asked what you see between pressing it and the server answering.

- **111 already answered properly.** They showed the result at once, or showed a spinner and could not be pressed twice. Six of these (two Refresh rates buttons, deleting a file, and three Journal photo and entry buttons) now also tell a screen reader they are busy.
- **5 now show their result at once**, and go back with a message if the save fails: moving a Stop up or down in the planner, moving a plan left or right in Compare, ticking a shopping item, marking a packing item "need to buy", and moving a checklist item up or down.
- **50 now say they are working**, in one of four ways. Not all of them look different:
  - **33 show a spinner** and cannot be pressed twice.
  - **4 dim their row while saving**, now on a phone as well as a desktop: the planner's Stop row, and its Make rough and two Surprise actions.
  - **9 look as they did** (they already greyed out) **but now tell a screen reader they are busy**: the admin review permission, the Day view's round add button, how a hop is travelled, the nearby + Day and Wishlist buttons, the Globe suggestion chip, mark all read, "Doesn't need one", deleting a Wishlist idea, and deleting a cost from To pay (whose tick box also greys out now). On a phone check these will look unchanged.
  - **4 were meant to become instant but were not**, for the reasons in the table, and say they are busy instead: dragging a thing to do to another day (nothing visible changes; a second drop is ignored), pinning a Stop's dates (the row dims), and "This is fine" and its Undo on a travel-time flag (they grey out, as before).
- **2 were done only in part.** The Sign out button says it is working, but the Sign out menu item does not, because the menu closes the moment it is chosen. Picking a day for an idea in the planner ignores a second pick and tells a screen reader the Stop is busy, but nothing visible changes while it saves.
- **4 were left as they were**, each for a reason: the Day title edit, the driving estimates in trip Settings, the confirm dialog, and the Undo button on an undo message. They are under "Waiting on Cam".

One shared change sits under all of this: a button that shows a spinner can no longer be pressed at the same time (a8c1c125). Before, a few buttons that showed a spinner could still be pressed again.

What a press shows, before and after, across all 172:

| What you see between the press and the answer | Before | After |
|---|---|---|
| The result, at once | 31 | 36 |
| A spinner or "working" text | 80 | 113 |
| The row dims and is marked busy | 0 | 5 |
| Greys out or dims only (after: all but one also tell a screen reader they are busy) | 51 | 13 |
| Nothing visible, but a second press is ignored and a screen reader hears it is busy | 0 | 2 |
| Nothing at all | 10 | 3 |

The four left as they were sit in the last rows: the driving estimates still grey out, and the Day title, the confirm dialog and the Undo button still show nothing. Sign out counts once, by its button.

How to read the table. `Today` is what the control did before the sweep: `optimistic` showed the result at once; `loading` showed a spinner or busy text; `disabled only` greyed out and nothing else; `nothing` gave no sign at all. `Verdict` is what the sweep set out to do. `Done` is what happened, with the commit. A `File:line` is where the control was found before the sweep; lines have moved since. Rows starting `Shared:` are shared pieces; the screens they reach are rows of their own too.

| Id | Control | File:line | Today | Verdict | Done |
|---|---|---|---|---|---|
| F1 | Admin: clear one error report (Clear button) | `app/(app)/admin/error-reports.tsx:154` | loading | ok |  |
| F2 | Admin: clear all error reports | `app/(app)/admin/error-reports.tsx:99` | loading | ok |  |
| F3 | Admin: review permission (Segmented per Traveller) | `app/(app)/admin/review-permissions.tsx:67` | disabled only | add loading (non-Button: needs aria-busy) | Looks as before (it already greyed out); now tells a screen reader it is busy. 040654cc |
| F4 | Admin: approve / dismiss access request | `app/(app)/admin/access-requests.tsx:135,148` | loading | ok |  |
| F5 | Admin: usage recording switch and Pause/Resume buttons | `app/(app)/admin/usage.tsx:180-188` | optimistic | ok |  |
| F6 | Admin: revoke allowed email | `app/(app)/admin/people.tsx:113` | loading | ok |  |
| F7 | What's new card: Dismiss X | `components/whats-new/whats-new-card.tsx:62` | optimistic | ok |  |
| F8 | New trip: Create trip (last step) | `components/new-trip/step-cover.tsx:37` | loading | ok |  |
| F9 | Globe: invite someone to your globe (Send) | `components/globe/globe-invite-button.tsx:113` | loading | ok |  |
| F10 | Globe: delete a marker (trash on marker list row, confirm) | `components/globe/marker-list.tsx:82 -> components/globe/globe-view.tsx:81` | nothing | add loading | Now says it is working (spinner, and cannot be pressed twice). 5f7fcae6 |
| F11 | Globe: save marker (add or edit dialog) | `components/globe/marker-form.tsx:303` | loading | ok |  |
| F12 | Globe: delete marker inside edit dialog | `components/globe/marker-form.tsx:278` | loading | ok |  |
| F13 | Plan: drag a stop to reorder or move into a chapter | `components/trip/itinerary-manager.tsx:1293 (via components/plan/use-plan-editor.ts:160)` | optimistic | ok |  |
| F14 | Plan: drag a chapter to reorder | `components/trip/itinerary-manager.tsx:1307 (use-plan-editor.ts:171)` | optimistic | ok |  |
| F15 | Plan: drag a thing to do onto another day of the stop | `components/trip/itinerary-manager.tsx:1282 (handleMoveItem :1119)` | nothing | make optimistic | Not made instant: the thing to do stays on its old day until the server answers, and nothing visible changes meanwhile. A second drop is now ignored and a screen reader hears that the Stop is busy. 18b50cc6, 4ca9067b |
| F16 | Plan: assign a rough stop to a chapter (picker dialog) | `components/trip/itinerary-manager.tsx:1056 (use-plan-editor.ts:195)` | optimistic | ok |  |
| F17 | Plan: minus/plus nights on a stop (header and phone sheet) | `components/trip/itinerary-manager.tsx:1148 (use-plan-editor.ts:209)` | optimistic | ok |  |
| F18 | Plan: Adjust Dates dialog, Save dates | `components/trip/itinerary-manager.tsx:2443` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 18b50cc6 |
| F19 | Plan: Firm up this chapter (button) | `components/trip/itinerary-manager.tsx:1597` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 18b50cc6 |
| F20 | Plan: Firm up the whole trip (header and empty states) | `components/trip/itinerary-manager.tsx:1710,1850` | loading | ok |  |
| F21 | Plan: remove a chapter (trash on chapter header) | `components/trip/itinerary-manager.tsx:1938` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 18b50cc6 |
| F22 | Plan: Delete a transport leg (card delete) | `components/trip/itinerary-manager.tsx:991 (card delete via card-action-cluster.tsx:139)` | optimistic | ok |  |
| F23 | Plan: Delete a stay (accommodation card / row delete) | `components/trip/itinerary-manager.tsx:1026,1039` | disabled only | add loading | Now says it is working: spinner on desktop (04a80864), the stay's row marked busy on a phone (e81df9ea) |
| F24 | Plan: stop menu, Move up / Move down | `components/plan/stop-actions.ts:138 -> itinerary-manager.tsx:773` | disabled only | make optimistic | Now instant: the new order shows at once and goes back if the save fails. Only one move at a time. 18b50cc6, 4ca9067b |
| F25 | Plan: stop menu, Pin dates / Unpin dates | `components/plan/stop-actions.ts:119 -> itinerary-manager.tsx:780` | disabled only | make optimistic | Not made instant: the planner has no way to put a pin back if the save fails. The row dims and says busy, now on a phone too. 18b50cc6, de18d2d7 |
| F26 | Plan: stop menu, Make rough (after confirm) | `components/plan/stop-actions.ts:130 -> itinerary-manager.tsx:818` | disabled only | add loading | Now says it is working: the row dims and is marked busy, on desktop and phone. 18b50cc6, de18d2d7 |
| F27 | Plan: stop menu, Make it a surprise | `components/plan/stop-actions.ts:86 -> itinerary-manager.tsx:792` | disabled only | add loading | Now says it is working: the row dims and is marked busy, on desktop and phone. 18b50cc6, de18d2d7 |
| F28 | Plan: stop menu, Reveal the surprise (after confirm) | `components/plan/stop-actions.ts:95 -> itinerary-manager.tsx:802` | disabled only | add loading | Now says it is working: the row dims and is marked busy, on desktop and phone. 18b50cc6, de18d2d7 |
| F29 | Plan: Suggest chapters from countries (plan menu) | `components/trip/itinerary-manager.tsx:1073,1078` | nothing | add loading | Now says it is working: the Chapters button shows a spinner (the menu item closes when chosen). e81df9ea |
| F30 | Plan: pick a day for a thing to do idea (idea sheet, open body) | `components/trip/itinerary-manager.tsx:1096,1105 (idea-sheet.tsx:46)` | nothing | add loading | Partly: a second pick is ignored and the Stop is marked busy for screen readers, but nothing visible changes while it saves. 18b50cc6, 4ca9067b |
| F31 | Plan: add a stop (phone sheet, Add stop) | `components/plan/mobile/add-stop-sheet.tsx:225` | loading | ok |  |
| F32 | Day: edit a day title inline (Enter or blur) | `components/trip/day-title-editor.ts:48 (inputs at components/plan/day-section.tsx:136)` | nothing | list: inline text edit closes on commit and shows the old title until the server answers; hold the typed value meanwhile | Left as it was: needs the typed title held on screen until the server answers |
| F33 | Day: Add idea to today (row buttons, two lists) | `components/trip/day-ideas.tsx:112,167` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F34 | Day: add an idea to a day (round add button in rows) | `components/trip/day/day-ideas-rows.tsx:53` | disabled only | add loading (raw button: aria-busy) | Looks as before (it already greyed out); now tells a screen reader it is busy. 04a80864 |
| F35 | Day: how this hop is travelled (menu trigger) | `components/trip/day/hop-mode-chooser.tsx:43` | disabled only | add loading (non-Button: aria-busy) | Looks as before (it already greyed out); now tells a screen reader it is busy. 04a80864 |
| F36 | Welcome: Got it / close the welcome dialog | `components/welcome/welcome-dialog.tsx:59` | optimistic | ok |  |
| F37 | Welcome: save your display name | `components/welcome/name-dialog.tsx:97` | loading | ok |  |
| F38 | Flags: Mark as fine (travel-time flag chip) | `components/trip/marked-fine.tsx:34` | disabled only | make optimistic | Not made instant: the flag moves between two parts of the page and the server checks it against the plan. It greys out as before and now tells a screen reader it is busy. 4dfe069e |
| F39 | Flags: Undo marked fine | `components/trip/marked-fine.tsx:60` | disabled only | make optimistic | Not made instant (same reason as F38). It greys out as before and now tells a screen reader it is busy. 4dfe069e |
| F40 | Nearby: + Day and Wishlist buttons on a nearby place | `components/trip/whats-around-sheet.tsx:208,209` | disabled only | add loading (raw buttons: aria-busy) | Looks as before (it already greyed out); now tells a screen reader it is busy. 04a80864 |
| F41 | Costs: add or edit an Other cost (dialog Save) | `components/trip/other-cost-editor.tsx:305` | loading | ok |  |
| F42 | Globe: add a Globe marker to the trip Wishlist (suggestion chip) | `components/trip/globe-suggestions-strip.tsx:82` | disabled only | add loading (Chip, not Button: aria-busy) | Looks as before (it already greyed out); now tells a screen reader it is busy. 04a80864 |
| F43 | Activity: mark all read (notification bell) | `components/trip/notification-bell.tsx:99` | disabled only | add loading (raw button: aria-busy) | Looks as before (it already greyed out); now tells a screen reader it is busy. 04a80864 |
| F44 | Reminders: Save reminder (add or edit dialog) | `components/trip/add-reminder-dialog.tsx:251` | loading | ok |  |
| F45 | Reminders: Delete inside the reminder dialog | `components/trip/add-reminder-dialog.tsx:235` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 4dfe069e |
| F46 | Stay: Save accommodation (add or edit dialog) | `components/trip/accommodation-form-dialog.tsx:410` | loading | ok |  |
| F47 | Stop: Save stop (add or edit dialog) | `components/trip/stop-form-dialog.tsx:511` | loading | ok |  |
| F48 | Transport: Save transport (add or edit dialog) | `components/trip/transport-form-dialog.tsx:986` | loading | ok |  |
| F49 | Thing to do: Save item (add or edit dialog) | `components/trip/item-form-dialog.tsx:1121` | loading | ok |  |
| F50 | Thing to do: Delete item inside the dialog | `components/trip/item-form-dialog.tsx:1105` | loading | ok |  |
| F51 | Thing to do: Add a photo / Replace and Remove photo | `components/trip/item-form-dialog.tsx:325,346` | loading | ok |  |
| F52 | Chapter: Save chapter (add or edit dialog) | `components/trip/chapter-form-dialog.tsx:250` | loading | ok |  |
| F53 | Files: Move a file to another item (dialog Move) | `components/trip/file-move-dialog.tsx:72` | loading | ok |  |
| F54 | Booking: "Doesn't need one" (no confirmation to attach) | `components/trip/booking-confirmation-marker.tsx:28` | disabled only | add loading (raw button: aria-busy) | Looks as before (it already greyed out); now tells a screen reader it is busy. 04a80864 |
| F55 | Chapters (Settings): delete a chapter (RowActions trash) | `components/trip/chapters-manager.tsx:104` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 5f7fcae6 |
| F56 | Chapters (Settings): Suggest chapters from countries | `components/trip/chapters-manager.tsx:139` | loading | ok |  |
| F57 | Plan/Day: Unschedule a thing to do | `components/trip/unschedule-item-button.tsx:64` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F58 | Rates: Save a manual rate (Set rate form) | `components/trip/rates-panel.tsx:229` | loading | ok |  |
| F59 | Rates: Clear a manual rate (unlock icon) | `components/trip/rates-panel.tsx:173` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F60 | Rates: Refresh all rates (Trip rates panel) | `components/trip/rates-panel.tsx:285` | loading | ok (own spinning icon and disabled, no aria-busy) | Was fine; now also tells screen readers it is busy. 04a80864 |
| F61 | Compare: move a plan left or right | `components/trip/compare-table.tsx:259,266` | disabled only | make optimistic | Now instant: the plans swap at once and go back if the save fails. 24632d7f |
| F62 | Trip: hard end date, Save | `components/trip/hard-end-date-control.tsx:77` | loading | ok |  |
| F63 | Trip: hard end date, Clear | `components/trip/hard-end-date-control.tsx:87` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F64 | Booking: Nothing to attach switch | `components/trip/nothing-to-attach-switch.tsx:51` | optimistic | ok |  |
| F65 | Plan: Delete stop (confirmation with preview) | `components/trip/delete-stop-dialog.tsx:91,117` | loading | ok |  |
| F66 | Rates: Refresh all (round button in Budget header) | `components/money/rates-refresh-button.tsx:36` | loading | ok (own spinning icon and disabled, no aria-busy) | Was fine; now also tells screen readers it is busy. c1da213b |
| F67 | Files: Delete an attachment (trash, after confirm) | `components/trip/attachment-list.tsx:264,441` | loading | ok (own spinner icon, no aria-busy) | Was fine; now also tells screen readers it is busy. 04a80864 |
| F68 | Files: Add N files (staged upload tray button) | `components/trip/staged-upload-tray.tsx:263` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F69 | Day: add a nearby Wishlist idea to a day | `components/trip/nearby-wishlist.tsx:85` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F70 | Files: Rename a file (dialog Save) | `components/trip/file-title-dialog.tsx:57` | loading | ok |  |
| F71 | Wishlist: delete an idea (card trash, after confirm) | `components/trip/wishlist-board.tsx:145 (card via item-card.tsx:194)` | disabled only | add loading (card dims, pointer-events-none, no aria-busy) | The card dims as before; now also tells a screen reader it is busy. 4dfe069e |
| F72 | Wishlist: Add to the nearest rough stop's things to do | `components/trip/schedule-item-dialog.tsx:174` | loading | ok |  |
| F73 | Wishlist: Schedule an idea (dialog Save) | `components/trip/schedule-item-dialog.tsx:277` | loading | ok |  |
| F74 | Plans: rename a plan (fork dialog Save) | `components/trip/fork-switcher.tsx:119` | loading | ok |  |
| F75 | Plans: create a plan (fork dialog Create) | `components/trip/fork-switcher.tsx:187` | loading | ok |  |
| F76 | Plans: discard a plan (confirm) | `components/trip/fork-switcher.tsx:221` | loading | ok |  |
| F77 | Packing: Save as template (dialog Save) | `components/trip/packing-templates-bar.tsx:100` | loading | ok |  |
| F78 | Packing: delete a template (confirm) | `components/trip/packing-templates-bar.tsx:180` | loading | ok |  |
| F79 | Packing: Apply Template (menu item, trigger button) | `components/trip/packing-templates-bar.tsx:243` | loading | ok |  |
| F80 | Reminders: Bring back a dismissed reminder | `components/trip/reminder-list.tsx:40` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 4dfe069e |
| F81 | Globe: Add a Globe marker to the Wishlist (dialog row) | `components/trip/add-from-globe-dialog.tsx:154` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F82 | Plans: Promote a plan to the real plan | `components/trip/promote-fork-dialog.tsx:264` | loading | ok |  |
| F83 | Costs: Save a cost (add or edit dialog) | `components/trip/cost-editor.tsx:173` | loading | ok |  |
| F84 | Costs: Delete a cost (X on the cost row) | `components/trip/cost-editor.tsx:411` | disabled only | add loading (row dims and pointer-events-none, no aria-busy) | Now says it is working (spinner, and cannot be pressed twice). 4dfe069e |
| F85 | Journal: add or replace a day photo | `components/trip/journal-editor.tsx:172` | loading | ok (own spinner icon in the label, input disabled, no aria-busy) | Was fine; now also tells screen readers it is busy. 04a80864 |
| F86 | Journal: remove a day photo (x on the thumbnail) | `components/trip/journal-editor.tsx:144` | loading | ok (own spinner icon, no aria-busy) | Was fine; now also tells screen readers it is busy. 04a80864 |
| F87 | Journal: Remove entry | `components/trip/journal-editor.tsx:431` | loading | ok (own spinner icon, no aria-busy) | Was fine; now also tells screen readers it is busy. 04a80864 |
| F88 | Journal: Save entry | `components/trip/journal-editor.tsx:451` | loading | ok |  |
| F89 | Journal: Keep off share links switch | `components/trip/journal-editor.tsx:502` | optimistic | ok |  |
| F90 | Notes: Add note | `components/trip/note-thread.tsx:169` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 4dfe069e |
| F91 | Notes: Delete note (after confirm) | `components/trip/note-thread.tsx:134` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 4dfe069e |
| F92 | Shopping: Add an item | `components/trip/shopping-list.tsx:78` | loading | ok |  |
| F93 | Shopping: tick bought | `components/trip/shopping-list.tsx:136` | disabled only | make optimistic | Now instant: the tick shows at once and goes back if the save fails; it waits while a Remove is running. 24632d7f, e76d160b |
| F94 | Shopping: Remove a packing item from the shopping list (X) | `components/trip/shopping-list.tsx:165` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 24632d7f |
| F95 | Shopping: delete a standalone item (RowActions, after confirm) | `components/trip/shopping-list.tsx:179` | disabled only | add loading (row dims, no aria-busy) | Now says it is working (spinner, and cannot be pressed twice). 24632d7f |
| F96 | Checklist: add an item (Pre-trip and Packing) | `components/trip/checklist.tsx:303` | loading | ok |  |
| F97 | Checklist: edit an item (dialog Save) | `components/trip/checklist.tsx:429` | loading | ok |  |
| F98 | Checklist: tick an item | `components/trip/checklist.tsx:634 (toggleItem :786)` | optimistic | ok |  |
| F99 | Checklist: Need to buy (basket icon on a packing item) | `components/trip/checklist.tsx:662` | disabled only | make optimistic | Now instant: the To buy badge shows at once and goes back if the save fails. 24632d7f |
| F100 | Checklist: Move up / Move down | `components/trip/checklist.tsx:675,686` | disabled only | make optimistic | Now instant: the two rows swap at once and go back if the save fails. 24632d7f |
| F101 | Checklist: Move to another list (menu) | `components/trip/checklist.tsx:700` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 24632d7f |
| F102 | Checklist: delete an item (RowActions, after confirm) | `components/trip/checklist.tsx:721` | disabled only | add loading (row dims, no aria-busy) | Now says it is working (spinner, and cannot be pressed twice). 24632d7f |
| F103 | Reminders: add a reminder (inline form on the Reminders card) | `components/trip/reminders-card.tsx:213` | loading | ok |  |
| F104 | Reminders: Got it (dismiss, with Undo) | `components/trip/reminders-card.tsx:279 (gotIt :336)` | optimistic | ok |  |
| F105 | Reminders: Bring back (Dismissed list on the card) | `components/trip/reminders-card.tsx:414` | optimistic | ok |  |
| F106 | Try list: tick an entry | `components/trip/try-list-ticks.tsx:39` | optimistic | ok |  |
| F107 | Votes: vote or clear a vote on an idea (shared control) | `components/trip/vote-control.tsx:125` | optimistic | ok |  |
| F108 | Calendar: drag a plan or Wishlist idea onto a day | `components/trip/calendar-views.tsx:163-177` | optimistic | ok |  |
| F109 | Budget: tick a cost paid or unpaid (To pay row) | `components/money/to-pay-row.tsx:96 (toggle components/money/to-pay-panel.tsx:49)` | optimistic | ok |  |
| F110 | Budget: Mark partly paid (dialog Confirm) | `components/money/paid-confirm.tsx:122` | loading | ok |  |
| F111 | Budget: Delete cost (To pay row menu, after confirm) | `components/money/to-pay-panel.tsx:122,143 (menu item in to-pay-row.tsx:143)` | nothing | add loading (menu item: row aria-busy; nothing marks the row while deleteCost runs) | The cost's tick box now greys out, and the row tells a screen reader it is busy. c1da213b |
| F112 | Settings, Calendar feed: Create calendar link | `components/trip/settings/calendar-feed-panel.tsx:147` | loading | ok |  |
| F113 | Settings, Calendar feed: Include in feed checkboxes (Transport, Accommodation, Activities) | `components/trip/settings/calendar-feed-panel.tsx:178` | optimistic | ok |  |
| F114 | Settings, Calendar feed: Alarm checkboxes | `components/trip/settings/calendar-feed-panel.tsx:197` | optimistic | ok |  |
| F115 | Settings, Calendar feed: Regenerate link | `components/trip/settings/calendar-feed-panel.tsx:236` | loading | ok |  |
| F116 | Settings, Calendar feed: Revoke link (after confirm) | `components/trip/settings/calendar-feed-panel.tsx:239` | loading | ok |  |
| F117 | Settings: Chapters switch | `components/trip/settings/chapters-switch.tsx:52` | optimistic | ok |  |
| F118 | Settings: Packing lists open switch | `components/trip/settings/packing-lists-switch.tsx:37` | optimistic | ok |  |
| F119 | Settings: What's around switch | `components/trip/settings/whats-around-switch.tsx:37` | optimistic | ok |  |
| F120 | Settings: What-if plans switch (Trip details) | `components/trip/settings/trip-details-form.tsx:259` | optimistic | ok |  |
| F121 | Settings: Save trip details | `components/trip/settings/trip-details-form.tsx:275` | loading | ok |  |
| F122 | Settings: Choose cover photo (upload) | `components/trip/settings/cover-image-field.tsx:116` | disabled only | add loading (an Uploading line of text also shows) | Now says it is working (spinner, and cannot be pressed twice). 040654cc |
| F123 | Settings: Remove cover photo | `components/trip/settings/cover-image-field.tsx:121` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 040654cc |
| F124 | Settings: tap the cover photo to set its focal point | `components/trip/settings/cover-image-field.tsx:136` | optimistic | ok |  |
| F125 | Settings: Delete trip (Danger zone, final confirm) | `components/trip/settings/danger-zone.tsx:103` | loading | ok |  |
| F126 | Settings: Your digest for this trip (checkbox) | `components/trip/settings/digest-panel.tsx:186` | optimistic | ok |  |
| F127 | Settings: Send me a test digest | `components/trip/settings/digest-panel.tsx:300` | loading | ok |  |
| F128 | Settings: Road winding factor and Average speed inputs | `components/trip/settings/driving-estimates-panel.tsx:72,89` | disabled only | list: each keystroke writes and disables the input being typed in; needs a save-on-blur or debounce decision, not just a spinner | Left as it was: every keystroke saves; it needs a choice between saving when you leave the box or after a pause |
| F129 | Settings, Travellers: Send invite | `components/trip/settings/invite-panel.tsx:222` | loading | ok |  |
| F130 | Settings, Travellers: cancel a pending invite (X) | `components/trip/settings/invite-panel.tsx:182` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 040654cc |
| F131 | Settings, Travellers: remove a member (after confirm) | `components/trip/settings/invite-panel.tsx:146` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 040654cc; if the call fails, the button frees again (879eff7b) |
| F132 | Settings, Travellers: Leave trip (after confirm) | `components/trip/settings/invite-panel.tsx:251` | loading | ok |  |
| F133 | Settings, Share links: Create share link | `components/trip/settings/share-links-panel.tsx:468` | loading | ok |  |
| F134 | Settings, Share links: Save an edited share link | `components/trip/settings/share-links-panel.tsx:369` | loading | ok |  |
| F135 | Settings, Share links: Rotate link | `components/trip/settings/share-links-panel.tsx:313` | loading | ok |  |
| F136 | Settings, Share links: Revoke link | `components/trip/settings/share-links-panel.tsx:317` | loading | ok |  |
| F137 | Settings: Save my travel number | `components/trip/settings/traveller-details-list.tsx:38` | loading | ok |  |
| F138 | Home: Got it on a Sort-these-out reminder | `components/trip/home/desktop/sort-these-out-rows.tsx:90` | optimistic | ok |  |
| F139 | Review: Run a standard review | `components/trip/reviews/review-run-panel.tsx:97` | loading | ok |  |
| F140 | Review: Run a deep review (after confirm) | `components/trip/reviews/review-run-panel.tsx:101` | loading | ok |  |
| F141 | Review: Apply / Need to pack / Need to buy / Add to checklist on a finding | `components/trip/reviews/finding-list.tsx:178-193` | optimistic | ok |  |
| F142 | Review: Dismiss a finding | `components/trip/reviews/finding-list.tsx:203` | optimistic | ok |  |
| F143 | Review: Undo an applied or dismissed finding | `components/trip/reviews/finding-list.tsx:208` | optimistic | ok |  |
| F144 | Make it fit: Apply trim | `components/trip/make-it-fit.tsx:282` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F145 | Make it fit: Drop a stop (button, then loss-preview confirm) | `components/trip/make-it-fit.tsx:318 (performDrop :186)` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F146 | Trips: Duplicate a trip (dialog) | `components/trip/duplicate-trip-dialog.tsx:110` | loading | ok |  |
| F147 | Suggestions: Suggest or Refresh activities (AI) | `components/trip/ai-activity-suggestions.tsx:93` | loading | ok |  |
| F148 | Suggestions: Add an AI suggestion to the Wishlist | `components/trip/ai-activity-suggestions.tsx:150` | disabled only | add loading | Now says it is working (spinner, and cannot be pressed twice). 04a80864 |
| F149 | Booking import: Read booking (reading screen) | `components/booking-import/booking-import-sheet.tsx:446` | loading | ok (the sheet swaps to a Reading your booking screen) |  |
| F150 | Booking import: Confirm a proposed stop, stay or leg | `components/booking-import/booking-import-sheet.tsx:484` | loading | ok |  |
| F151 | Trips: Restore a recently deleted trip | `components/trips/recently-deleted.tsx:43` | loading | ok |  |
| F152 | Account: Save display name (profile card) | `components/account/profile-card.tsx:234` | loading | ok |  |
| F153 | Account: Change photo | `components/account/profile-card.tsx:161` | loading | ok |  |
| F154 | Account: Remove photo | `components/account/profile-card.tsx:180` | loading | ok |  |
| F155 | Account: drag or tap the profile photo focal point | `components/account/profile-photo-focal.tsx:83` | optimistic | ok |  |
| F156 | Account: Save traveller details | `components/account/traveller-details-card.tsx:88` | loading | ok |  |
| F157 | Account: per-trip digest switch | `components/account/trip-digests-panel.tsx:85` | optimistic | ok |  |
| F158 | Account: Disconnect a connected app (Yes, disconnect) | `components/account/connected-apps-panel.tsx:116` | loading | ok |  |
| F159 | Account: Remove a device | `components/account/devices-panel.tsx:231` | loading | ok |  |
| F160 | Account: Enable on this device (push) | `components/account/devices-panel.tsx:342` | loading | ok |  |
| F161 | Feedback panel: Send a note (with or without pictures) | `components/feedback/feedback-launcher.tsx:814` | loading | ok |  |
| F162 | Feedback panel: delete one of your sent notes (trash) | `components/feedback/feedback-launcher.tsx:865 (handleDelete :586)` | nothing | add loading | Now says it is working (spinner, and cannot be pressed twice). c1da213b |
| F163 | Auth: Continue with Google | `app/landing/signin-buttons.tsx:60` | loading | ok |  |
| F164 | Auth: Continue as a seeded dev Traveller (dev only) | `app/landing/signin-buttons.tsx:85` | loading | ok |  |
| F165 | Auth: email me a sign-in link | `app/landing/email-sign-in.tsx:103` | loading | ok |  |
| F166 | Auth: Allow or Cancel an app connection (consent) | `app/connect/consent-form.tsx:35,38` | loading | ok |  |
| F167 | Auth: Sign out (menu item and button) | `components/ui/sign-out-button.tsx:76,88` | nothing | add loading | Partly: the Sign out button now says it is working (c1da213b). The menu item is left: the menu closes the moment it is chosen |
| F168 | Shared: Confirm button in ConfirmDialog and useConfirm (about 20 call sites; every confirm-then-act row above) | `components/ui/confirm-dialog.tsx:44` | nothing | list: closes the dialog at once by design; feedback belongs on the row or trigger that started the action (see the delete rows marked add loading) | Left as it was, by design: the dialog closes at once and the wait shows on the row that started it |
| F169 | Shared: Edit and Delete icon pair in RowActions (checklist, shopping, chapters, globe markers; reached by 4 screens here) | `components/ui/row-actions.tsx:37,53` | disabled only | add loading (give RowActions a loading or deleting prop that sets Button loading) | Now the Delete icon shows a spinner while a delete runs. 5f7fcae6 |
| F170 | Shared: Edit and Delete icons in CardActionCluster (transport, stay and thing-to-do cards, wishlist cards) | `components/trip/card-action-cluster.tsx:126,139` | disabled only | add loading | Now the Delete icon shows a spinner while a delete runs; Edit only opens a form, so it is unchanged. 04a80864 |
| F171 | Shared: Undo button in an undo toast (plan moves, unschedule, reminders, review findings; 6 screens) | `components/ui/undo-toast.tsx:28` | nothing | list: the toast action gives no sign while the inverse call runs; apply and applyUndo already show the result, and no new toasts are allowed | Left as it was: the Undo button gives no sign while it runs. Showing one would need a change to the toast, and no new toasts were allowed |
| F172 | Shared: StopRow dims while a stop menu action runs (move, pin, rough, surprise, delete) | `components/plan/stop-row.tsx:132` | disabled only | add loading (aria-busy on the row; the menu items are not Buttons) | Now the row is marked busy while it dims, on desktop and phone. 18b50cc6, de18d2d7 |
