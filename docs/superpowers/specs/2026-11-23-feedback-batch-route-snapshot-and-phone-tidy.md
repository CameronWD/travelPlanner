# Feedback batch, 23 Nov 2026: route snapshot cover, locked sheets, and phone tidy-ups

Agreed with Cam on 2026-11-23 from seven open Feedback notes, all written on main
from his iPhone on 22 Nov. Freeze is Mon 30 Nov; the trip leaves 4 Dec.

No migration is expected. Beta follows main.

## A. Route snapshot replaces the route sketch

Notes: `cmwsfnhr5000008jofthb122n` (second half).

- A Trip with no cover photo shows the **route snapshot**: a Google static map.
  A cover photo still wins everywhere.
- It replaces the sketch in all four places: the Trip home band (phone and
  desktop), the desktop countdown polaroid, the Trips list cards, and the shared
  page's hero.
- Framing follows the sketch's rules (CONTEXT.md **Trip cover image**):
  - framed on the Trip's main cluster of located Stops;
  - Stops outside the frame are named in the existing chip ("+ Denpasar");
  - the legs from and to Home are left out;
  - numbered pins in each Stop's colour, joined by the route line, formatted
    like the snapshot the shared page and print page already draw
    (`lib/map/static-map.ts`).
- Too few located Stops to picture (none, one, or all in one city): the existing
  passport stamp.
- Google unreachable, over the daily static-map cap, or offline with nothing
  kept: the passport stamp.
- The phone keeps the last snapshot it loaded, so offline shows that one.
- The snapshot is a still picture. It is not draggable.
- The route sketch component and its tests are deleted.

## B. The page behind a sheet stays still

Notes: `cmwsfnhr5000008jofthb122n` (first half), `cmwsfo6wr000208johd9jfkui`.

- On a phone, while any modal sheet or dialog is open, the page behind it does
  not scroll.
- With the keyboard up, nothing of the page shows between the sheet and the
  keyboard.
- Fixed in the shared sheet and dialog, so it covers every one of them.
- Unchanged: from tablet width up, the Feedback panel is docked beside a usable
  page on purpose.

## C. Feedback panel: Pictures and Send on one row

Note: `cmwsfnxf3000108jof4iqs2r8`.

- Pictures on the left, Send on the right, on one row.
- Chosen thumbnails sit above that row.
- The character count keeps a fixed place and does not move Send.

## D. Phone Day view: the trip switcher row goes

Note: `cmwsfp865000007id5ytcu5bc`.

- On a phone, the Day view no longer shows the trip switcher pill, and the row
  it sat in is removed (about 56 points back).
- The bell moves into the app's top bar, between Globe and the avatar, on the
  phone Day view only. It stays still while the day scrolls and while days
  swipe (ADR 0065).
- Share is removed from the phone Day view. It stays on Home and the other
  trip pages.
- Tablet and desktop Day views are unchanged.

## E. Attachments on day rows sit closer

Note: `cmwsfpzmc000107id1m2rwcd7`.

- One attachment per line, each line 32 points tall, no gap between lines.
- Applies wherever attachment links show on day rows: Transport,
  Accommodation, check-in and Items.
- Accepted trade: the tap target is 32 points tall, not 44.

## F. Summary matches the rest of the app

Note: `cmwsfrd36000207idtevik3tk`.

Built from the shared pieces Home and the Day view already use. Layout and
content stay as they are.

1. Stop cards carry the Stop's own colour: the number badge and a card accent.
2. Transport rows use the Day view's mode tile, not a grey pill.
3. The Flags tile uses the app's icons, not system emoji.
4. Stat tiles are rebuilt on Home's stat tile, with display numerals.

Not changing: the number font for money and dates, which matches the Money
pages.

## G. Reminders: text full width on a phone

Note: `cmwsfs69u000307idsn5nc3qy`.

- On a phone, a Reminder's text takes the full width.
- The last line carries the Stop chip and the date on the left, and the pencil
  and Got it on the right.
- Notes expand under that line.
- Applies to the Reminders card on both Checklists and Trip home.
- Desktop rows are unchanged.

## H. Consistency sweep

Asked for by Cam on 2026-11-23, not tied to a note. Runs last, after A to G.

- Scope: phone width, light theme, every trip page plus the Trips list.
- Screenshots come from the demo trip, never the real one.
- Checked against the rules F applies to Summary: Stops carry their colour,
  Transport uses the mode tile, the app's icons and never emoji, stat tiles and
  cards are the shared pieces, and every page uses the same page header.
- Fixed in this batch: a swap to a shared piece that changes looks only.
- Listed for Cam and not built: anything that would change layout, wording or
  what a page shows. The list goes in `docs/audits/`.

## Closing the notes

Each commit that does a note's work carries `Resolves-Feedback: <id>`.
`cmwsfnhr5000008jofthb122n` covers both A and B and is resolved only when both
are live. Nothing is resolved until Cam confirms the deploy.

## Not in this batch

- A consistency audit at tablet or desktop widths, or in the dark theme.
- Any change to what Summary shows.
- Cam's phone checks still owed from the 22 Nov batch.
