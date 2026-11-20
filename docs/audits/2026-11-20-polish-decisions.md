# Polish: decisions for Cam

Kept while the three polish branches are built. Each line is something that was a choice
and was built the recommended way so the work did not stop. Say which to change.

## Wave 1 (`chore/polish-pass`)

| Id | Built as | The other way |
|---|---|---|
| B1 | Summary and Print both show cost, labelled. | Paid on both, cost as fallback. |
| B2 | A Stop row on Summary shows cost and a nightly figure from it; paid is a smaller second figure. | Show paid first, nightly figure from paid. |
| B5 | A full Globe's share dialog reads "Your Globe is shared with the people below." | Other wording. |
| B6 | The Globe list's group is "No country". | "Nowhere", "Unplaced", other. |
| B7 | New Review summaries end on a word with an ellipsis. Old ones cut at the cap get an ellipsis when shown; stored text is not rewritten. | Rewrite old ones, or leave them. |
| B8 | Daylight length sits below the sun arc. | Keep it inside the arc with a knocked-out background. |
| B9 | What's new floats above the tab bar on the Trips list. Trip home keeps it in the page. | Reserve its space in the skeleton, or accept the shift. |
| M1, M4 | A rate under 0.005 reads the other way round ("1 home = n foreign"), and its editor with it; the figure sizes itself to its tile. The cut-off is 0.005, not 0.01, so the yen does not flip direction between refreshes. | Always one direction, with a smaller figure. |
| P2 | Phone Stop sheet: dates on their own line, nights stepper on the row below. | Smaller stepper beside the dates. |
| B9 | The floating What's new card may sit over the last Trips card until dismissed. | Add space under the list while it shows. |
| L1 | Shared trip on a phone: Stop name on its own line, days and dates under it. | Keep one line, truncate the dates instead. |

## Wave 2 (`chore/polish-wave-2`)

| Id | Built as | The other way |
|---|---|---|
| S2 | On a phone, share and bell sit on the trip-name line above the title; page-header pages lose one 24 px gap. | Put them on the h1's line. |
| K2 | The rail and Trips tab bar are the dark card colour in dark; light is unchanged. | Dark background colour. |
| K3 | Dark hard shadows use the dark border colour (2.25:1 against the page). | Black (1.29:1). |
| K3 | Stay cards: body tint 15% over the page colour, in both themes. | Keep 25% in light only. |
| H3 | "days to go" on one line; it drops under a three-digit number at 320 px. | Two lines, as before. |
| H8 | Phone and desktop money tiles use the size-aware format (cents under 1,000, compact above). | Phone only. |
| P3 | Below md every pill in a leg stack takes the column's width. | Pills keep their own widths. |
| D3 | A trip shorter than the strip centres its chips. | Left-aligned. |
| D4 | The phone placeholder always shows the full weather card, even on a travelling day's collapsed row. | Pass the phase to the skeleton. |
| E3 | Three checklist panels: the third spans both columns on desktop. | Leave a gap. |
| F1 | Field label gap 10 px everywhere. | 8 px. |
| F4 | Transport edit gains a Cancel. | Close button only. |
| G2 | Cover photo moved above the Trip details form. | Its own card. |
| G5 | Phone Globe can zoom out to level 1 so spread markers fit. | Keep level 2 and fit to the largest cluster. |
| H5 | Summary lists go two to a row from 1400 px. | Cap the column width. |
| S3 | Settings and Summary use the page header, so like Reviews after X2 they no longer show the member avatars and currency chip. | Keep the layout header there. |
| G3 | Help's lone last card no longer spans two columns (reverses LA-027); every card is one column wide unless open. | Keep the span. |
| L2 | The shared trip's map preview fills its frame from lg (slight crop); phones keep the whole image. | Crop on phones too. |
| H1 | Only "only 0 min" changed, to "no gap". The capitals (TO BOOK and the like) are in titles you typed, so no pill was built. | Recognise a fixed list of status words in titles and show them as pills. |
| O2 | Dialog titles made Title Case everywhere, as `COMPONENTS.md` says. | Sentence case everywhere, and change the rule. |
| H4 | Trip home's desktop cards keep even heights in a row; content now sits at the top, so a short card's blank space is at its foot instead of its middle. | Let each card end where its content ends, with uneven rows. |
| E1 | New trip's place steps lose their tall field too. | Keep the tall field there. |
| M2 | Each category has a usual colour and keeps it across trips; when two would clash on one trip the second takes the next free colour. Nine colours, so a trip with more than nine categories repeats. | Group the smallest categories into "Other", or add colours. |
| D1 | The Day plan title column gets 66 to 73% of a phone card; the two 44 px buttons still share the title's line. | Move the buttons under the title. |

### Things to know about wave 2

- The light theme did change in one place: inactive labels on the Trips tab bar are darker (contrast about 4.0:1 before, 9.6:1 now).
- The Day strip overlapping the side rail (from the audit) could not be reproduced by the builder, the reviewer or the final pass at any width. Nothing was changed for it.
- Not seen by anyone in a browser: the Review card's colour band (the demo has no Reviews), the phone Globe's map (Google Maps was over quota locally; pins were measured), Account with a photo or a connected app, and the "no gap" wording (no demo trip has a zero-minute connection). Each rests on tests.

### Not built in wave 2, waiting on you

- **K3, weather card in the dark theme.** Answered 20 Nov: keep it light for now.
- **O3, keyboard.** Import a booking and Add a stop now keep their button visible. Edit Item and Transport edit already dock to the keyboard; whether they fail needs your phone. The inline Add reminder became a dialog on phones on 20 Nov (`feat/add-reminder-dialog-phone`); trip home's has no About choice, as its form never had one.
- **K1, empty date field on an iPhone.** A desktop WebKit browser paints today's date, pale, in an empty date field. Whether your iPhone does needs a look (Settings, Hard end date, when empty). If it does, the fix is a drawn placeholder, which is a custom control, so it waits for you.
- **S9.** Not measured yet.

## Wave 3 (`chore/polish-wave-3`)

| Id | Built as | The other way |
|---|---|---|
| N1 | A trip page's loading logo sits in the full-bleed trip frame, so nothing moves when the page arrives (the logo is 16 px further left and 32 px higher than before). | Give trip pages `<main>`'s padding instead. |
| N2 | The Trips skeleton reserves the New trip button's 44 px, even for a Traveller with no trips yet. | Reserve nothing and let a first-run header move. |
| N3 | A zero-offset zone reads "GMT" everywhere. | "GMT+0", or "UTC". |
| N6 | On a Changeover day shared with a hidden Stop, no title control unless the visible Stop already has a title. | Offer the control on the visible Stop. |
| N10 | "Start a Deep Review?" / "A Deep Review takes longer than a Standard Review and thinks harder about the plan." / Start Deep Review. | Other wording. |
| S5 | Avatars overlap by 6 px with a 2 px ring in the page colour everywhere. | Keep 8 to 10 px overlap with a ring only. |
| S6 | The trip name in the phone header is hidden visually only on a Sketching trip's home. | Hide it on every phone trip home. |
| S7 | The Trips list's foot clears the Feedback button; the Day view at 320 px is unchanged. | Shrink or hide the button while scrolling. |
| S8 | What's new shows its unread count in a coral badge beside the heading; the list has no bullets. | A "New" badge on each line. |
| H6 | The route map fits its pins with 72 px on the right for the zoom buttons. | Move the zoom buttons to the top. |
| H7 | A past trip's phone cover carries the trip name on a card chip at the bottom left; sketching route nights sit in a right-hand column; a desktop warning tile is yellow like the phone's. | Name above "That's a wrap"; leave the colours. |
| T2 | Continue sits 40 px under the field on desktop. | Beside the field. |
| P6 | A rough phone card has no subtitle; Plan ranges use an en dash with a narrow no-break space before it and a thin space after; Book by is 12 px; "Drive in X" for one region, "Town (X)" loses "(X)" beside X, and a shared ", Region" tail is dropped. | Show the nights as the subtitle; leave ranges as they were. |
| D7 | An empty Day plan has no count in its header; the Journal card takes the Day plan card's padding at each width. | Keep the count and drop the body line. |
| U4 | The phone print preview drops its extra 16 px a side; a Transport's places wrap as one sentence. | Keep the inset. |
| M3 | Spare height on desktop Money goes under Where it goes, not into the Trip cost card. | Even card bottoms. |
| A1 | On desktop Activity the time sits right after its sentence; rows still fill the card. | Cap the card or the list at a reading width. |
| L3 | Legal footer links: "Back to Teepee home" and the other document. The phone landing centres hero and cards together on one screen. | A landing that scrolls. |
| O7 | Dialog headers are at least 48 px (were 72); footers pad 12 px under the buttons (were 22). | Keep 72 px for a description line. |
| O8 | The More sheet has a visible "More" title with Close beside it; Reminder text stops at a readable measure; the add form is at most 28 rem. | Keep the hidden title. |
| Leftover | Add a stop's Cancel shows from 640 px only; the phone sheet keeps one button. | Cancel on the phone too. |
| G4 | Curly apostrophes and quotes in `app/` and `components/` copy. A few strings that are also stored or compared in shared code stay straight. | Convert those too, with the code that compares them. |

### Things to know about wave 3

- Not seen by anyone in a browser: Deep Review's confirmation (the demo trips hide the Review buttons, and a real click costs money), a real Surprise day without its "Add a title" control, a Book by pill with a date, a drive within one region. Each rests on tests.
- Straight apostrophes remain where the words come from shared code: Help's section blurbs, What's new, warning sentences, a Checklists hint.
- Print shows the trip name in the top bar as well as its own heading, so it has two headings on screen. Probably older than this work.
- Activity can still read oddly when a thing's own name ends in its kind ("... test reminder reminder") or starts with "The" ("updated the The ..."). It is the data, not a layout fault.

### Not built in wave 3, waiting on you

- **N4, repeated prefetching on an idle Day page.** Not changed. Prefetching is part of what makes swiping fast, and the fix on offer was to stop the Day strip and arrows prefetching at all. Too close to the trip to touch without a measurement on the live site.
- **N8, a stray scroll correction when a desktop window is dragged across 1024 px on the Day view.** Not changed. The fix is inside the carousel that was rebuilt on 19 Nov, and a desktop-resize edge case is not worth the risk to it before the trip.
- **S7 at 320 px.** The Feedback button still covers the weather card's sunset time on a 320 px wide phone (neither of yours). Padding cannot fix it. Options: a smaller button, tuck it away while scrolling, or move it on the Day view.
- **N7.** No build needed: the Day page for the 36-day trip was 124 KB gzipped (46 KB with brotli) on 19 Nov, well under the 300 KB line.
- **N12.** The install nudge stays at the foot of the phone Trips list.
- **G4.** Copy that is also stored or compared in shared code keeps straight apostrophes for now. Convert it later?
- **N9.** The proxy now answers a failed session lookup at once and reports the error afterwards, with a plain log line first. Whether the deferred report reaches the error sink on Vercel is not proven; it needs a deploy and a forced failure to see. The page a Traveller gets is unchanged either way.

## Open questions that are not builds

- Account's Digest service status is shown to every Traveller, not only Admins. Hide it from non-Admins?
- Schedule Item's "Pick another date" link is coral and reads as an error at a glance. Change its colour?
- Two overlapping things to do show "only 0 min", the same as back-to-back ones. Say "overlaps" instead?
- `flagHardEndDate` keeps a stored date in its wording on purpose ("historic wording"). Wave 1 renders it as a day like the rest.
- Inside a Review, a finding that repeats a warning still shows the stored date form (2026-12-09). Wave 1 left Reviews alone, as X4 did. Show days there too?
- While dragging a costed thing to do to another day and back on the demo trip, a tester saw the trip's total change by one cent. Not confirmed; the suspected cause is the exchange rate being taken per date. Worth a look?
- Going from trip home to Plan on a phone measures a layout shift of 0.133 (the page swap itself, not the loading logo). Was it there before, and does it show on your phone?
- `driving-estimates-panel.test.tsx` fails now and then under load (typing "1.8" registers as "18"); it passes alone. A flaky test, not a fault in the app. Worth steadying after the trip.
- Answered 20 Nov: beta follows main.
