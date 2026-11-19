# Polish audit, 20 November 2026

Whole-site browser sweep of `main` at `a5d92bbe` (the 19 November notes merged), run overnight on `chore/polish-pass`. Previous audits: `2026-10-12-layout-audit.md`, `2026-09-24-layout-audit.md`.

**How to use this.** Every item has an id. Strike what you do not care about (or just send the ids to drop or keep); anything left becomes the spec for the polish branch. Nothing here is built except the six fixes under *Fixed overnight*, which are on `chore/polish-pass`, unpushed, for you to accept or reject. Pictures for each item are in a local page that is not committed: `.superpowers/polish/index.html` (open it in a browser).

## Before reading the list

1. **Check the deploy.** `main` was pushed at about 21:45 on 19 Nov. Open the Day view on your phone and swipe a few days. Beta is not pushed and the eight Feedback notes are not resolved; both wait for your word that main is live.
2. **Things only a real iPhone can settle**, none of which the sweep can see: the Feedback panel above the real keyboard; whether the top bar is as see-through as the screenshots make it (S1); a finger fling while a day's real header replaces its stand-in; rotating on a late day of the trip; a swipe in airplane mode.

## Run

- 2,640 screenshots: the real trip (a local copy, signed in as its owner) and the demo data; phones in the WebKit engine at iPhone 17 and iPhone 12 sizes, installed and browser-tab heights; desktop in Chromium at 768, 1024, 1280, 1440, 1512 (MacBook Pro 14") and 1920; dark theme; 46 overlay recipes with keyboard-up variants; loading states; a resize crawl from 2560 to 320 px and back on 30 routes.
- Looked at by eye: 821 images, iPhone 17 and MacBook Pro 14" in full, by ten reviewers. Every other size was opened only where an automatic check flagged it. 203 raw findings, merged below. 57 of 345 captures were clean.
- Automatic checks (leads, not findings): small-target 3,371, overlap 653, clipped-text 219, line-too-long 101, spill 9, sideways-scroll 5. Most overlaps are the deliberate full-card link.
- Layout shift on the real trip, throttled: Trips 0 (was 0.29 before the notes branch), trip home 0, Plan 0, Day 0.03 (one shift of the whole page body, the same unthrottled).
- Not covered: a real phone; safe-area insets and installed mode (the emulation has neither); the Admin screen (the dev login is not an Admin); Transport add, Cost add and Make it fit dialogs (no trigger in either data set); the lower half of long sheets.
- The Surprise Stop: reviewers judged layout only on its dates and wrote nothing about it. Three careful "possible leak" flags were checked and none was one: each was the Stop's place name or the train in and out, which a surprised Traveller is meant to see.

## Fixed overnight (6)

Plainly broken, one evident fix, no wording or look decided. Each was reviewed with instructions to reject anything that made a choice for you. On `chore/polish-pass`, unpushed. Full suite green (13,573 tests).

| | Fix | Commit | What was wrong |
|---|---|---|---|
| X1 | Activity: a long file name stays inside its row | `2a8e1764` | The row had no word-wrapping, so an unbroken name ran under the timestamp and pushed the page sideways on phones. |
| X2 | Reviews shows one header | `0a3cb3a1` | The page draws its own header but was missing from the list that tells the layout not to draw a second, so share and bell appeared twice. Side effect: the member avatars and currency chip no longer show on Reviews, as on its sibling pages. |
| X3 | Each Transport shows its own icon | `9a03f244` | Summary and the desktop trip home tile drew a plane for every leg. They now use the same mode icons as Plan. |
| X4 | Warning and stay dates read as days | `4d577ece` | Warnings that name a day, and Summary's stay lines, printed dates as stored (2026-12-09). They now read as days where a Traveller sees them. Stored text, the Claude connection and Reviews keep the stored form. Note: the stay line now shows no year, like the trip's date range elsewhere. Three other warning types are not covered (W1). |
| X5 | Share your Globe: a long email stays in its card | `6c818f14` | The text column could not shrink, so the Member badge was pushed past the card's border. |
| X6 | Delete stop: the stay warning can be read in full | `10f97a3f` | The line was set to truncate; it now wraps. Its sibling lines still truncate (P7). |

**Tried and reverted (2).** The reviewer judged these to be choices, so they are back as they were and on the list: the Rates tile (M4) and the phone money format (H8).

## Bugs confirmed in the code (9)

Reviewers flagged fourteen things as possible bugs; each was checked against the code, read-only.

| | Bug | What happens | What it needs |
|---|---|---|---|
| B1 | Summary and Print disagree on budget category totals | Summary's category list shows cost; Print shows paid on some rows and cost on others. A wrong-looking number on a page you may print. | Needs your call: which measure both pages show. Suggested: cost on both, labelled. |
| B2 | Summary: a Stop's per-night figure does not match the amount beside it | The rate is always worked out from cost, but the amount shown switches to paid once anything is paid. | Needs your call: work the rate out from the amount shown, or always show cost. |
| B3 | Activity says "updated the transport transport" | When a leg has no label the word "transport" is used as its name and then the noun is added again. (Entries that look like ids are booking references, which is intended.) | One evident fix. |
| B4 | Plan's "Jump to" rail highlights the wrong Stop | The scroll tracking only watches the top of the screen, so it never reaches the last Stops on a long plan. | One evident fix. |
| B5 | Share your Globe always says "Invite someone" | The invite form only shows while there is room for another member, but the description offers it regardless. | Copy: needs a line for when the Globe is full. |
| B6 | Globe lists a marker that is on the map under "Unpinned" | The group really means "no country"; a marker somewhere with no country lands there. | Copy: rename the group. |
| B7 | Review summaries are cut mid-word | Summaries are cut at 200 characters when written, with no word boundary and no ellipsis. Reviews already saved stay cut. | One evident fix for new Reviews; old ones need a decision. |
| B8 | Weather card: the daylight length is printed over the sun arc's dots | Label and arc share one box. | Small layout choice: knock the label out of the arc, or move it below. |
| B9 | Trips list: cards drop when the What's new banner arrives | The loading skeleton has no slot for the banner, so for anyone with unread notes the cards move down by its height. | Needs your call: reserve the space, or accept it. |

**Checked and not bugs (5).**

- "Paid so far" can exceed a trip's total cost. By design: paid and cost are separate amounts added up independently (ADR 0037).
- Schedule Item opens with a red "Pick another date". By design: it is a coral link, not an error. It reads as an error at a glance, which may be worth a look.
- Warnings say "only 0 min". A true back-to-back gap. Caveat: two things that overlap also show as 0, which hides how bad it is. Wording is H1.
- Settings: Hard end date looks filled on a phone and empty on desktop. Local artefact: the browser's own empty date field draws differently in each engine.
- Account: the Digest status shows a red error twice. Local artefact: the schedule never runs on this Mac. Open question: that status is shown to every Traveller, not only Admins.

## The list (66: 4 broken, 45 rough, 17 nits)

*Broken* means something cannot be read or used. *Rough* is what a designer would fix. *Nit* is small.

### Shell

- **S1 · rough · Phone top bar looks see-through when a page is scrolled** *(reported 8 times)*  
  every scrolling page · phone. Eight of ten reviewers saw page content showing through the top bar and colliding with the logo, search, Globe and avatar. The bar is 60% opaque with a blur behind it; the screenshot engine did not draw the blur, so this is probably milder on a real iPhone. Look at it on the phone first. If it is busy there too: raise the bar's opacity (about 90%) and keep the blur.
- **S2 · rough · Phone trip pages open with 150 to 300 px of empty space above the title** *(reported 8 times)*  
  Activity, Money, Calendar, Plan, Checklists, Files, Journal, Wishlist, More, Help · phone. Share and bell sit alone on a row of their own, then the title starts well down the screen. Seven reviewers flagged it. Proposal: put share and bell on the title's row and drop the empty row.
- **S3 · rough · Two different page-header styles across trip pages**  
  Reviews, Settings, Print, Summary versus the rest · phone and desktop. Some trip pages use the trip header (avatars, share, bell), others a plain title row. Pick one per kind of page. (The Reviews page drawing both at once is in Fixed overnight.)
- **S4 · rough · Desktop sidebar: trip name cut short, may not fit a short window, shifts on load** *(reported 5 times)*  
  all pages · desktop. The trip switcher truncates the trip name although the rail has room. At 860 px tall the rail's last links (Settings, Account) may sit below the fold with no scroll. The rail's items jump about 10 px when the switcher's skeleton resolves. Proposals: let the name use the width; make the rail scroll; give the skeleton the switcher's real height.
- **S9 · rough · Tapping a tab or link shows nothing for up to 800 ms**  
  navigation between pages · phone and desktop. Low confidence: the app shows a progress bar after 300 ms by design, and the development server exaggerates the wait. Worth one look on the deployed site on a slow connection.
- **S5 · nit · Overlapping avatars clip the first person's initials** *(reported 3 times)*  
  trip header · phone and desktop. The second avatar covers part of the first one's letters. Proposal: smaller overlap or a ring between them.
- **S6 · nit · The trip name appears three times at the top of a phone trip page**  
  trip home · phone. Switcher, page header, then the hero card. Proposal: drop it from one of them.
- **S7 · nit · Feedback button covers row controls on some phone pages**  
  Globe, Money, Activity, trip home · phone. Already known for card corners and the Globe pill; reviewers also saw it over row actions. Proposal: lift it above the tab bar's safe zone or let it tuck away on scroll.
- **S8 · nit · What's new marker is a tiny floating dot**  
  trip header · phone and desktop. Reads as a stray pixel. Proposal: a proper badge or none.

### Trip home

- **H1 · rough · Warnings read like debug output**  
  Next steps (phone), Sort these out (desktop), Summary's Trip health. Lines say "only 0 min" and carry a status tag in capitals inside the title. (The raw dates in them are in Fixed overnight.) Proposal: "no gap" or "back to back" for zero, and the status as a pill, not in the sentence.
- **H2 · rough · Truncation hides the part that matters** *(reported 7 times)*  
  Upcoming payments, Still to book, Next payment, Sort these out · phone and desktop. Names are cut to about ten characters on the phone while amounts and dates keep their width; on desktop the Next payment name is cut mid-word in a card with room to spare; Still to book truncates where Next steps wraps. Proposal: let titles wrap to two lines, and decide one rule for these lists.
- **H3 · rough · Hero card: the stat chips crowd the big number**  
  trip home hero · phone and desktop. The chips sit hard against the countdown or the "Pick your dates" headline, and "days to go" wraps to two lines.
- **H4 · rough · Desktop cards stretch with large blank bands**  
  trip home (travelling), Trip cost card · desktop. Wide cards pin content top and bottom and leave the middle empty.
- **H5 · rough · "Add Reminder" looks disabled and is indented off the card's edge** *(reported 3 times)*  
  Reminders card on trip home and Checklists · phone and desktop. Greyed and inset further than the text above it. Proposal: align it with the card's content and give it the normal link colour.
- **H8 · rough · Phone trip home shows money with one decimal place**  
  trip home money tiles · phone. The phone tiles use the compact money format on purpose (it writes large amounts as 184k), and that format prints an amount under 1,000 with a single decimal. Tried overnight and reverted, because which format the phone uses is a rule you set. Options: keep compact but give amounts under 1,000 two decimals; or use the desktop tiles' format on the phone too.
- **H6 · nit · Map cards: attribution clipped by the rounded corner, zoom buttons crowd content** *(reported 3 times)*  
  trip home, Summary, Wishlist maps. The Google attribution row is cut by the card's corner; the zoom control sits over the Home marker on the route map.
- **H7 · nit · Smaller trip home roughness** *(reported 5 times)*  
  past, sketching and empty trips · phone. Past trip's phone hero is a tall empty gradient with no title; the sketching route list has ragged columns; empty-state copy wraps to a one-word last line; a warning's icon is grey on desktop and yellow on phone.

### Trips

- **T1 · rough · Trips list at tablet and small-laptop widths: controls clipped**  
  Trips · 768 to 1440 px. The Planned/Been toggle is clipped at 768, the map's filter pills are clipped between about 1040 and 1440, and the Up next chip truncates its text.
- **T2 · nit · New trip on desktop: Continue sits far from the input**  
  New trip · desktop. The button is at the far edge of a wide card.

### Plan

- **P1 · broken · Desktop Plan: a thing to do's title is cut to a few letters while its note gets the row**  
  Plan day rows · desktop, about 1040 to 1760 px. The title is the one thing you need to read and it loses the width fight to the note. Proposal: the title keeps its width and the note truncates.
- **P2 · broken · Phone Stop sheet: the dates are squeezed to about three characters**  
  Stop sheet header · phone. The date line is cut to a fragment beside the nights stepper, whose ring also touches the title. Needs a layout choice: dates on their own line under the name, or a smaller stepper.
- **P3 · rough · Phone Plan cards and Transport pills cut off the word that matters**  
  Plan · phone. A pill gives its width to the date and truncates the destination; pills have ragged widths.
- **P4 · rough · Stay address and Stop note are clipped with no way to read them**  
  Plan · desktop. Truncated to one line even on wide screens where the card has spare room, with no tooltip or expand.
- **P5 · rough · "Add a title" is amber text on an amber band**  
  Plan day headers · desktop. Low contrast; placeholder titles on the yellow day cards have the same problem.
- **P6 · nit · Smaller Plan roughness** *(reported 5 times)*  
  Plan. Rough Stops on phones repeat "Drag to reorder" as their only subtitle; the Firm up button overlaps its banner's border on desktop; date ranges mix spaced and unspaced dashes; Book by pills use smaller type than the pill beside them; a same-region drive is labelled with the region twice.
- **P7 · nit · Delete stop: the cost, attachment and note lines still truncate**  
  Delete stop dialog · desktop. Only the stay line was fixed overnight. Same one-word fix for its siblings.

### Day

- **D1 · rough · Phone Day plan: titles are squeezed into a narrow column**  
  Day plan card · phone. The time and icon columns take their width first, so longer titles wrap to three or four lines while the card has room. Proposal: narrower gutter, or the icon inline with the title.
- **D2 · rough · Group labels sit against the row above them**  
  Day plan card · phone and desktop. "Anytime", category labels and the like hug the previous row instead of the group they head. Proposal: more space above the label than below.
- **D3 · rough · Desktop Day strip leaves half a chip and a label fragment beside the arrows**  
  Day view · desktop. Alongside the known overlap with the side rail at some widths.
- **D4 · rough · While a Day page loads, two empty boxes stand in for the weather and the plan**  
  Day view · slow loads. This is the trade made on 19 Nov: every loaded day is wrapped the same way so a double swipe cannot wipe typed text, and the cost is a brief placeholder on slow loads. Options: accept it; make the placeholder look like the cards it replaces; or revert to content-first and live with the double-swipe rebuild.
- **D5 · rough · Check-in card wraps its booking status awkwardly and truncates differently from the Tonight card**  
  Day view · phone. The same stay is shown two ways on one screen.
- **D6 · rough · Phone "Add to this day" menu is small plain rows that cover the next card's title**  
  Day view · phone. Proposal: a sheet, like the app's other phone menus.
- **D7 · nit · Smaller Day roughness** *(reported 3 times)*  
  Day view. Day plan card has dead space and says "nothing" twice when empty; the Journal card's padding differs from its neighbours; the phone Day plan header is cramped (Day map and the count squeezed beside the title).

### Summary

- **U1 · rough · Trip health: "This is fine" sits outside its warning card** *(reported 3 times)*  
  Summary · phone and desktop. The button squeezes the text and gives the list two right edges. Long trips also get a wall of identical "Nothing scheduled" notes, and Make it fit touches the section label. Proposal: button inside the card, and collapse the repeated notes into one line with a count.
- **U2 · rough · Phone Summary cards lose the right edge of their hard shadow** *(reported 4 times)*  
  Summary, Print · phone. The offset shadow is cut at the screen edge; a stat tile's amount also truncates at the narrowest widths.
- **U3 · rough · Desktop Summary rows are stretched full width with one short line each**  
  Summary · desktop. Reads as the phone layout stretched.
- **U4 · nit · Print preview wraps awkwardly on a phone and sits offset on desktop**  
  Print (on screen). Only matters if the on-screen preview is used; the printed page was not reviewed.

### Money

- **M4 · broken · A long exchange rate spills out of the Rates card and off the screen**  
  Money rates · about 1024 to 1040 px wide. Tried overnight and reverted: making the tile shrink kept it inside the card but broke the number across three lines, which reads worse than the spill. It needs a choice together with M1: a smaller figure, an inverted rate, or a wider tile.
- **M1 · rough · A very small exchange rate is unreadable**  
  Money rates · desktop. A rate shows as a long string of zeros. (Its tile spilling out of the card is in Fixed overnight.) Proposal: show the rate the other way round when it is under 0.01.
- **M2 · rough · Categories share colours, so rows cannot be told apart**  
  Money · phone and desktop. Two or more categories use the same colour in the bar and the list.
- **M3 · nit · Trip cost card has a large empty block under its bar on desktop**  
  Money · desktop.

### Calendar

- **C1 · rough · Phone Agenda: wrapped Check-in and Check-out titles get double line spacing** *(reported 3 times)*  
  Calendar agenda · phone. Also a duplicated heading and a large gap before the first day.

### Checklists

- **K1 · rough · Reminders list on phone: long, with small packed action icons** *(reported 6 times)*  
  Checklists · phone. The date field also renders differently on phone and desktop and looks pre-filled; desktop columns end unevenly; empty states nest a dashed box inside a dashed box.

### Files

- **F1 · rough · "Booking confirmations to add" is a bare list of unstyled lines** *(reported 5 times)*  
  Files · phone and desktop. Some lines end abruptly. File names are truncated at the end, which hides the part that tells similar files apart; each phone file card is about 400 px tall; on desktop the drop zone is a narrow box above a full-width empty state.

### Activity

- **A1 · nit · Desktop Activity rows are one very long line with the time far from the text**  
  Activity · desktop.

### Reviews

- **R1 · rough · Desktop Review text runs past 100 characters a line**  
  Reviews · desktop. Buttons in a Review card are not aligned with its text, and the card border style changes with severity.

### Forms

- **E1 · rough · The same kind of field has two looks** *(reported 5 times)*  
  Settings (Home base), Add Marker, Add Accommodation, Transport and Stop sheets. Place-search inputs and the first field of several sheets are taller, bolder and shadowed, unlike every other input. Six reviewers noticed. Proposal: one input style; if place search must look different, do it with an icon.

### Settings

- **E2 · rough · Settings: order and spacing** *(reported 4 times)*  
  Settings · phone and desktop. Save changes sits above Cover photo; share-link rows are laid out three different ways; empty-state lines are larger than the helper text above them; the Danger zone is pushed down a long empty column on desktop.

### Account

- **G1 · rough · Account page: avatar actions unaligned, Connected apps line cut off** *(reported 3 times)*  
  Account · phone and desktop. The avatar and its three actions are styled as three different things; on phones the Connected apps detail line is truncated and hides its date; on desktop the right-hand cards stretch very wide.

### Globe

- **G2 · rough · Globe on a phone opens on empty ocean**  
  Globe · phone. The first view shows one marker at the edge. Proposal: fit the view to the markers.

### Help

- **G3 · rough · Help's desktop card grid is ragged** *(reported 6 times)*  
  Help, trip Help · desktop. Rows of uneven height with uneven gaps, and one wide card with text in its left half only. Legend rows are inconsistent and some phone cards wrap to a one-word last line.

### Copy

- **G4 · nit · Straight and curly apostrophes are mixed**  
  Help, Privacy, Terms, Settings, Share. One evident fix (curly everywhere), but it touches a lot of copy, so it is left for a yes.

### Warnings

- **W1 · rough · Three kinds of warning still show a raw date**  
  Summary, trip home, Day view. The overnight fix covers warnings that name one day. Transport that leaves or arrives outside its Stop's dates, and a return after the hard end date, build their text differently and still print dates as 2026-12-09. Same evident fix, in three more places.

### Share

- **L1 · broken · Shared trip on a phone: Stop names in the day-by-day list are cut short**  
  Share page · phone. At phone width the name loses room to the day count; at the narrowest widths every name shrinks to about four letters. This is the page other people see. Proposal: name on its own line.
- **L2 · rough · Shared trip on desktop: map does not fill its card, and there is a large empty area** *(reported 5 times)*  
  Share page · desktop. The map renders as a centred strip (may be a capture artefact: check in a browser), most pins pile into one cluster when one Stop is far from the rest, and the hero card is followed by a blank area beside the tall route list.

### Landing

- **L3 · nit · Landing page on a phone has large blank bands; Terms and Privacy just stop** *(reported 4 times)*  
  public pages. Terms and Privacy end with no footer or way onward. The landing and shared pages also ignore dark theme (the shared page is light-only by an earlier decision).

### Sheets

- **O1 · rough · Labels touch or are overlapped by the heavy-bordered input below them**  
  Save template, Wishlist add, Transport edit, Stop edit, Accommodation add · phone and desktop. The thick focus border sits on top of the label. One spacing fix in the shared field, but it changes every form, so it is left for a yes.
- **O2 · rough · Dialogs and sheets are inconsistent with each other** *(reported 7 times)*  
  about twelve dialogs and sheets. Two Cancel styles (bare text and outlined pill); titles in Title Case and sentence case; Import a booking has its own footer; Add a stop's primary button is not pinned and is cut off on desktop; Add and Edit stop colour their segmented control differently; "Delete leg" sits inset and unframed; From/To pickers repeat their label.
- **O3 · rough · With the keyboard up in a browser tab, several sheets leave almost no room** *(reported 3 times)*  
  Edit Item, Import a booking, Add from Globe, inline Add reminder, Transport edit · phone browser tab. The focused field or the Save button ends up off screen. This is the shorter browser-tab height with a simulated keyboard; the installed app has more room. Check the worst two on a real phone before deciding.
- **O4 · rough · Long text in a one-line field is scrolled to its end**  
  Checklist item edit, Reminder edit. You see the end of the text with the first letters clipped. Proposal: a growing text area for these two.
- **O6 · rough · Notifications popover on a phone touches the screen edge and covers part of the tab bar**  
  Notifications · phone.
- **O7 · nit · Dead space in dialogs**  
  several dialogs and sheets. A big gap between a sheet's title and its first field, and small dialogs with an empty band under the buttons.
- **O8 · nit · Smaller dialog roughness** *(reported 7 times)*  
  various. Add from Globe's filter box has a blank where the magnifier should be; the desktop inline Add reminder form stretches across the whole card; Reminders run very long lines on desktop; the More sheet's rows are indented plain text with a floating close; the Day map dialog's first list row has a clipped top edge; Delete stop shows the browser's blue focus ring; the trip switcher's bottom actions do not line up with the trip names.

### Feedback

- **O5 · rough · Phone Feedback panel squeezes each note into half the width**  
  Feedback panel · phone. "Show resolved" also has an empty space where its toggle should be.

### Dark theme

- **K2 · rough · Dark theme: the tab bar and side rail stay tan, with low-contrast labels**  
  Trips, Globe, Account, Help tab bar; desktop rail on every page. Trip pages get a dark tab bar; the Trips-level pages do not. Likely one missing token, but it is the look of the whole theme, so it is left for a yes.
- **K3 · rough · Dark theme: light-only surfaces and vanishing shadows** *(reported 3 times)*  
  weather card, stay cards, most pages. The weather card stays light, the hard offset shadows disappear against the dark page, and muted text on the purple stay cards is hard to read.

## Carried over from the notes branch

Found while building or reviewing the 19 November notes and deliberately left.

- Trip home shifts once on a slow load on the demo data (0.055 throttled, one late shift); the Day view shifts once on every load (0.03).
- The Trips skeleton sits about 6 px high and its dots row is blank.
- A hydration mismatch on Plan (a timezone label reads "GMT+0" on the server and "GMT" in the browser).
- Idle Day pages prefetch their neighbours and four other pages three times each.
- A Reminder brought back by the other Traveller or by Claude stays hidden on an open Reminders card until it reloads.
- A surprised Traveller sees an "Add a title" control on a Surprise day; the server refuses the write. A dead control.
- A Day page for a 36-day trip is about 1.5 MB of HTML before compression; compressed size not measured yet.
- Dragging a desktop window across 1024 px wide on the Day view can trigger one stray scroll correction.
- The proxy waits for its error report before answering a failed session lookup, so a database outage costs two timeouts.
- Reviews: "Standard Review" and "Deep Review" start on one tap, with no confirmation.
- The glossary says nothing counts dismissed Reminders; Checklists now shows "Dismissed (n)". Does the glossary want a word on it?
- The "install this app" nudge is now the last thing on the phone Trips list.

## Decisions made on your behalf on the notes branch

The ones that change what you asked for or what you will see. The full ledger is kept locally in `.superpowers/polish/`.

- The Day view fills seven days (the shown day and three either side), not every day of the trip: filling all of them made the page about eight times heavier.
- The date reaches the Day page through a rewrite so the address stays the same and a day change rebuilds nothing. You chose this over navigating after a rest.
- Every loaded day is wrapped the same way so a double swipe cannot wipe typed text. Cost: on a very slow cold load the day shows a placeholder for about a second (D4).
- "Got it" has an Undo, and Checklists lists dismissed Reminders with Bring back, because a general Reminder could otherwise not be recovered in the app.
- Delete for a Reminder lives only inside Edit, on trip home and in Plan.
- A check-in or check-out with a time keeps its time column; only untimed ones span the card.
- The Claude connection's get_reminders takes includeDismissed so a dismissed Reminder can be found and brought back.
- A failed session lookup answers with a small "Try again" page instead of "Trip not found". Hardening on reasoning; the symptom was never reproduced.
- The install nudge moved to the bottom of the phone Trips list because its space could not be reserved before the page paints.
- No redirect was added for a hand-typed internal Day address.
