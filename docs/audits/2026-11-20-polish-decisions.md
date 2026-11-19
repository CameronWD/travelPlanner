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

- **K3, weather card in the dark theme.** Its colours are the same in both themes on purpose and its scenes are drawn with dark outlines, so a dark card is a redesign, not a fix. Keep it light, or commission a dark palette?
- **O3, keyboard.** Import a booking and Add a stop now keep their button visible. Edit Item and Transport edit already dock to the keyboard; whether they fail needs your phone. The inline Add reminder is a form on the page: make it a dialog on phones?
- **K1, empty date field on an iPhone.** A desktop WebKit browser paints today's date, pale, in an empty date field. Whether your iPhone does needs a look (Settings, Hard end date, when empty). If it does, the fix is a drawn placeholder, which is a custom control, so it waits for you.
- **S9.** Not measured yet.

## Open questions that are not builds

- Account's Digest service status is shown to every Traveller, not only Admins. Hide it from non-Admins?
- Schedule Item's "Pick another date" link is coral and reads as an error at a glance. Change its colour?
- Two overlapping things to do show "only 0 min", the same as back-to-back ones. Say "overlaps" instead?
- `flagHardEndDate` keeps a stored date in its wording on purpose ("historic wording"). Wave 1 renders it as a day like the rest.
- Inside a Review, a finding that repeats a warning still shows the stored date form (2026-12-09). Wave 1 left Reviews alone, as X4 did. Show days there too?
- While dragging a costed thing to do to another day and back on the demo trip, a tester saw the trip's total change by one cent. Not confirmed; the suspected cause is the exchange rate being taken per date. Worth a look?
