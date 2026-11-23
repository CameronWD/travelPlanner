# Phone consistency sweep, 23 Nov 2026

Every Trip page of the demo trip (EU Christmas 2026) and the Trips list, at 402 x 874 in WebKit, light theme. Each page was checked against five rules:

1. A Stop shows its own colour wherever it is named with a number or a badge.
2. A Transport shows the mode tile.
3. Icons are the app's own, never emoji.
4. Stat tiles and cards are `StatTile` and `Card`.
5. The page uses `PageHeader`, with the trip name as eyebrow and the shared trailing cluster.

Pages covered: Home, Plan, a Stop (the phone Stop sheet, Munich), Day (11 Dec), Money (To pay and All costs too), Checklists, Summary, Reviews, Settings, Files, Help, Wishlist, Calendar, Journal, Activity, More, and the Trips list. Today redirects to Home on this trip.

Rule 3 has no breaches: the app draws no emoji anywhere. Rule 5 has none either: every page with a `PageHeader` passes the trip name and `TripHeaderTrailing`. Home, Day and the Trips list have no `PageHeader`, by their own design (see the last table).

Nothing here re-raises a decision from `docs/audits/2026-11-20-polish-decisions.md`.

## Fixed

| Page | Rule | What changed | Commit |
|---|---|---|---|
| Summary | 4 | The Stop cards (Itinerary, Not yet scheduled, and a date-less Trip's list) were hand-made, with a 1 px border and a 28 px radius. They are now the shared `Card`, with a 2 px border and a 20 px radius like every other card. | `c6ff9fdd` |
| Summary | 1 | In the two-column Itinerary (1400 px and up), a long name such as Rovaniemi (Lapland) wrapped under its badge and left the number alone on a line. The badge now stays beside the name. | `6aa765b3` |
| Plan (phone row and Stop sheet) | 1 | Both had their own copy of the number badge. They now use the shared `StopBadge` at their old sizes (36 px and 44 px). Measured on the demo: same size, colour and font as before, so nothing visible changed. The number can no longer drift from Summary or the desktop Plan. | `dba0a6b5` |

From the browser pass, also on this branch: `7a9c14dc`, Reminders on a phone keep Edit and Got it together (Checklists and Trip home).

## For Cam to decide

None of these is built. Each one would change the layout, the wording, or what a page shows.

| Page | What is inconsistent | Recommended change | The other way |
|---|---|---|---|
| Money: Where it goes, by Place | Each Stop's dot takes its chapter's colour, or the next colour on a ramp. It is not the Stop's own colour. Munich is sky blue here, but yellow (2) on Plan and Summary. | Colour each Place row with the Stop's own colour, as Plan, Summary and the maps do. | Keep chapter colours here, so that Place and Chapter read alike. |
| Money: To pay, All costs, Recent | A Transport cost reads "Flight · Munich → London" as text, with no mode tile. Day, Calendar and Summary show the tile. | Put the small neutral mode tile in front of Transport rows. The checkbox stays first. | Leave it as text. These rows are about money, not travel. |
| Plan (phone and desktop) | A leg between Stops is a pill with a plane icon, not the mode tile used on Day, Calendar and Summary. | Leave it. The pill is the Plan's own leg control. P3 already settled its width. | Swap the icon for the tile inside the pill. |
| Files: Booking confirmations to add | A Transport row ("Rovaniemi (Lapland) → Munich, Transport") has the same yellow paperclip tile as everything else, not its mode tile. | Leave it. The paperclip means "needs a file", and that is the point of this list. | Use the mode tile for Transport rows and the category tile for things to do. |
| Home (travelling phase) | The "Paid so far" glance (`SpendSoFarCard compact`) is a stat tile built by hand inside a `Card`, not a `StatTile`. Its padding is 16 px instead of 14 px, its label is grey and is a heading. No one has seen it in a browser: no demo trip is travelling today. | Swap it to `StatTile`, so it matches the tiles beside it. The label stops being a heading. | Leave it, and keep the heading for screen readers. |
| Wishlist, Calendar (agenda) | A Stop's name (a Wishlist group heading, or a Calendar day header such as "Munich, Germany") has no colour and no number. Rule 1 asks for colour only where a number or badge is shown, so this is not strictly a breach. | Leave it. | Add the Stop's colour dot, or its badge, to these headings. |
| Summary, date-less Trip | The rough Stop cards under "Stops added so far" have no colour band. The dated view's rough cards do have one. | Add the band, so a rough Stop looks the same in both views. | Leave it. A date-less Trip has no order to colour by yet. |
| Day (phone) | With the trip switcher row gone, the Day header starts 24 px lower than a `PageHeader` page. Its eyebrow sits at 105 px; other pages' trip names sit at 81 px. The page's own top padding is now the only thing above it. | Drop the 24 px top padding on the phone Day view, so its first line sits where other pages' trip names do. | Leave the extra air. |
| Home, Day, Trips list | No `PageHeader`. Home has its own hero with the trip name as its h1. Day has its own date header (ADR 0065). The Trips list is not a trip page. | Leave them. | Fold Home's hero into a `PageHeader`. |

## Not swapped, because nothing would change

These pieces use the shared look already, written out by hand. Swapping them would change no pixel, so they were left alone:

- Help's walkthrough and key cards. Their classes match `Card` exactly, and the Help tests already check the look.
- The Day view's Journal card. It is `Card` with a larger radius and shadow from md up.

## Seen and not seen

- Seen in WebKit at 402 x 874: all the pages listed above. Screenshots are kept with the task report, not in the repo.
- Not seen: Home in the travelling phase, because no demo trip runs through today. Also not seen: Summary's rough Stop cards on a dated Trip, because no demo trip has a rough Stop with dates set on the Trip.
