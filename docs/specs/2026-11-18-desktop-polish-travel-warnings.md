# Desktop polish, honest travel-time warnings, a better Day view

Source: the 19 Feedback notes open on Main on 2026-11-18 (all from Cam, 17 Nov,
mostly written at desktop widths: 1054, 1259 and 1920px). Agreed with Cam on
2026-11-18. Items marked *(default)* were Claude's call, played back and not
struck. File references are from a read-only pass on `cf76b046`; treat them as
starting points and re-read before changing.

Phones are unchanged unless a section says otherwise. "Desktop" means `lg`
(1024px) and up.

Every commit that does a note's work carries `Resolves-Feedback: <id>`. No note
is resolved until Cam confirms the deploy.

## T. Travel-time warnings

Notes: `cmwkj1hyc000e08l9ce0fvwql` (false alarms on walking routes),
`cmwkj3pnm000i08l9taojobzc` (walking mode).

Today: `resolveHop` (`lib/travel-times/hops.ts:253-278`) walks a hop only when
a stored WALK row is 20 min or less; WALK rows are fetched under 2 km straight
line (`WALK_ROW_UNDER_KM`); the Stop's **Local travel mode** is DRIVE, TRANSIT
or null; an Item has one pin; no Flag can be dismissed. The Flag is
`flagTightConnections` (`lib/flags.ts:733-816`), called from `detectFlags` and
directly from `lib/day-view-loader.ts:391-397`.

### T1. Smarter walking (automatic)

- A hop with a stored WALK row is walked when the walk is 20 min or less
  (today's rule) **or** the walk is no more than 5 min longer than the stored
  local-mode time.
- WALK rows are fetched for hops under 3 km straight line (was 2 km). WALK
  keys still go first in the refresh queue and stay inside the daily quota.

### T2. "Walk" as a Local travel mode

- `Stop.localTravelMode` accepts `"WALK"` beside `"DRIVE"`, `"TRANSIT"` and
  null (automatic). No migration: the column is a nullable string. Validation
  in `lib/validations/stop.ts`.
- At a Walk Stop a hop is walked when its stored walk is 30 min or less.
  Beyond that it falls back to public transport (TRANSIT rows are fetched as
  for a TRANSIT Stop). The 30 is one constant, not a setting.
- Stop form (`components/trip/stop-form-dialog.tsx`): a fourth option, "Walk".
  Helper line: "Walk anything up to 30 minutes, public transport beyond."
- MCP `set_local_travel_mode` accepts `walk`; plan reads report it.

### T3. Hop mode (a mode for one hop)

- New model `HopMode`: `tripId`, `fromItemId`, `toItemId`, `mode`
  (`WALK | TRANSIT | DRIVE`), `setById`, timestamps; unique on
  (`fromItemId`, `toItemId`); cascade on Trip and both Items. Real plan only.
- A Hop mode beats T1, T2 and the Stop's mode, with no time limit. The hop
  uses the stored row for that mode; where none is stored yet, the estimate
  for that mode stands in and reads *estimated* as usual.
- The refresh wants the chosen mode's key for a hop that has a Hop mode,
  whatever its length (so a 2-hour walk gets a real WALK row and polyline).
- Day view "Getting around" (`components/trip/day-feasibility.tsx`): each hop
  row has a small chooser: Automatic, Walk, Public transport, Drive.
  Automatic deletes the row.
- It lapses silently when the two Items are no longer consecutive (the row
  stays; nothing reads it). *(default)*
- Shared between Travellers. Hidden with a Surprise like the hop itself.
- MCP: `set_hop_mode` (fromItemId, toItemId, mode incl. `automatic`); day and
  plan reads show each hop's mode and whether it was hand-set.

### T4. Ends at

- Item gains optional `endAddress`, `endLat`, `endLng`, `endPlaceId`. The
  existing pin is where the thing **starts**.
- The hop into the Item goes to the start pin; the hop out leaves from the
  end pin when one is set. Everything that builds hops (`lib/travel-times/
  hops.ts`, the Flag inputs `FlagItem`, the Day map, "spread out" style
  distance Flags) reads the end pin for the outgoing side. *(default: the
  geographic-spread Flag keeps using the start pin only.)*
- Item form (`components/trip/item-form-dialog.tsx`): an optional "Ends at"
  place field under the address, same picker. Clearing it clears all four
  fields.
- Day map: an Item with an end pin shows both pins joined by the real walking
  route, in the Item's Category colour, visibly distinct from hop lines. The
  route is one WALK travel-time key (start to end), fetched by the same
  refresh whatever the distance; a straight dashed line stands in until it
  arrives.
- Nothing checks the walk's length against the Item's start and end times.
- MCP: `add_thing_to_do` and `update_thing_to_do` accept `endsAt` (address or
  place, geocoded the way `address` is; null clears); reads return it.
- Wishlist ideas may carry it too (same fields, same form).

### T5. Marked fine

- New model `FlagDismissal`: `tripId`, `flagId` (the Flag's id, e.g.
  `tight-<prev>-<next>`), `fingerprint`, `markedById`, `createdAt`; unique on
  (`tripId`, `flagId`).
- Only tight-connection Flags (both severities) can be Marked fine. Every
  other Flag is unchanged.
- `fingerprint` = both Items' date, start time, end time, start pin, end pin,
  and the hop's minutes rounded to the nearest 5. A dismissal applies only
  while the current fingerprint matches; when it does not, the Flag shows
  again and the stale row is ignored (and replaced if marked again).
- Applied wherever tight Flags are produced: `detectFlags` (so Summary, Home
  Next steps, nav count, Reviews, Compare and MCP `get_flags` all agree) and
  the Day view's direct call. Join the dismissals in `lib/flags-loader.ts`.
- Day view "Getting around": each tight row has a "This is fine" button.
  Marked rows collapse into one quiet line, "1 marked fine" / "N marked
  fine", which expands to show them with who marked each and an "Undo".
  Summary's flag list gets the same button on tight rows.
- A Finding built from a Marked-fine Flag reads as it does when a Flag stops
  firing (existing "Fixed in the plan" behaviour). *(default)*
- MCP: `mark_flag_fine` (flagId) and `unmark_flag_fine`; `get_flags` gains a
  `markedFine` list (flagId, by, when) so Claude can see what was waved
  through.
- Server actions go in `lib/server-action-exports.test.ts`.

## D. Day view

### D1. Desktop layout: one day, page scroll, sticky right column

Notes: `cmwkhwenq000308jqhm1vhozr` (cut off, inner scroll).

Today every panel sits in a `snap-x overflow-x-auto` scroller
(`components/trip/day/day-carousel.tsx:195`) that clips the cards' hard
shadows, and the Day plan has `lg:max-h-[…] lg:overflow-y-auto`
(`day-plan-card.tsx:65`).

- From `lg` up the Day view renders only the shown day: no horizontal
  scroller, no neighbour panels, no wheel/trackpad day change.
- The Day plan card has no max height and no inner scroll on desktop.
- The right column (Weather, Tonight, Journal, credit) is `position: sticky`
  below the header; if it is taller than the viewport it scrolls with the
  page normally.
- No shadow is clipped at 1920px or at the `max-w-page-wide` cap.
- Below `lg` the three-panel carousel is unchanged.
- Amend ADR 0065: the three-panel snap carousel is the phone and tablet
  behaviour; desktop shows one day and crossfades.

### D2. Day strip as the carousel

Note: `cmwkhuwmq000208jq3r8l7znl`.

- Desktop: the selected day's chip sits at the horizontal centre of the
  strip. The highlight is fixed there; choosing a day scrolls the strip under
  it. One animation, one direction, about 250 ms. Arrow buttons at each end
  step one day; keyboard arrows keep working.
- At the ends of the trip the strip pads so the first and last day can still
  centre.
- The chip no longer fades its own background while the highlight moves (one
  coral element, not two).
- Day content changes with a short crossfade (about 150 ms), not the
  page-turn view transition. Reduced motion: no animation.
- ADR 0063 still holds: the tapped chip lights at once and the page holds
  until the next is ready.
- Phone: the strip keeps its current behaviour.

### D3. Header overlap, 1024 to 1279px

Note: `cmwkhsiel000108jwr67q25xw`.

`components/trip/day/day-header.tsx:94`: the right cluster (Share, bell,
avatars, "Add to this day") needs about 350px and its `minmax(0,1fr)` track
gets about 225px at 1054px, so it spills over the date.

- No overlap at any width from 1024px up. Below `xl` the right cluster moves
  to the row above (beside the switcher pills) or the avatars collapse to a
  count; pick whichever keeps the date centred. Verify at 1024, 1054, 1152,
  1280 and 1920.

### D4. Day map in a dialog / sheet

Note: `cmwkhtgwu000007lbcwitlfmi`. Also closes `docs/open.md:19`.

- A "Day map" button in the Day plan card header (shown when the day has
  located entries) replaces the inline "Show day map" panel on every size.
- Desktop: a `size="full"` dialog (as `PlanMapDialog`,
  `components/plan/plan-mini-map.tsx:76-104`): map on the left, the day's
  located things in order on the right; clicking one highlights its pin.
- Phone: a full-screen sheet with the map and, at the bottom, "Open today's
  route in Google Maps / Apple Maps".
- Lazy-loaded through `components/ui/lazy-loader.tsx`; offline it fails soft
  with the existing message.
- Home's "Day map" quick action and the Travelling tile land on the Day view
  with the dialog open (a `?map=1` param). *(default)*
- CONTEXT.md **Day map** updated ("opens over the Day view").

### D5. Weather scenes

Note: `cmwkhrt0i000008jwipfxlc46`.

`components/weather/WeatherCard.tsx`, `components/weather/scenes.tsx`,
keyframes at `app/globals.css:694-701`, variants in `lib/weather/theme.ts`.

- Card size, data and offline behaviour unchanged. All eleven variants
  redrawn as layered inline SVG in the site's language: palette tokens,
  crisp edges, the cards' dark outline, flat colour bands for sky (no blur,
  no glow, no photographic gradients).
- Sky bands chosen by variant and day/night.
- Two or three cloud layers at different speeds (parallax).
- Rain falls at an angle derived from max gusts, with small splashes; snow
  drifts and sways in mixed sizes; storms flash occasionally; fog is slow
  crossing bands; the sun has rays that breathe; wind shows streaks; heat
  shimmers; night has stars and a moon.
- A daylight arc along the bottom: sunrise and sunset times and, for today
  only, the sun's position.
- Snow, overcast, rain and fog get the most care (December in Europe).
- `prefers-reduced-motion`: everything still. Stale/offline and "too far"
  keep their current behaviour.
- Compact (`h-[140px]`) and the phone `weather-strip.tsx` use the same scenes.
- Delete the orphaned `components/trip/weather-daylight-card.tsx` if knip
  agrees.
- Use the frontend-design skill for this task.

### D6. Stay cards

Note: `cmwki9yiu000107lbnkbxyp1m`.

- Tonight card (`components/trip/day/tonight-card.tsx:44`), the timeline's
  check-in / check-out tiles (`components/trip/timeline.tsx:337`) and Home's
  "Tonight's stay" (`phase-travelling.tsx:208`): a solid lilac band on top
  (bed icon, "Tonight" / "Check-in" / "Check-out"), body on the Plan's faint
  lilac wash (`bg-hue-lilac/25`), dark text.
- Name large and bold; address and times in body text; confirmation number in
  mono on its own line.
- Check contrast in light and dark themes.

### D7. Surprises on the Day view

Note: `cmwki3exb000608k172o0b8qv` (the answer: only the surprise Stop's
insides are hidden, never the whole day).

- A day wholly inside a Stop that is a Surprise for the viewer: the Day plan
  body is the Plan's `SurpriseShell` ("Surprise, planned by X"); "Add to this
  day" is hidden for that viewer.
- A Changeover day shared with such a Stop: the viewer's visible things as
  now, then one line: "The rest of today is a surprise, planned by X."
- Nothing new is sent to the surprised viewer beyond the planner's name and
  the fact (both already on the Plan). ADR 0072 holds.

## P. Plan editor (desktop)

### P1. Add cards

Note: `cmwkhyxur000008k1enr83o50`.

- `components/plan/day-section.tsx`: each day ends with a full-width dashed
  "Add to Fri 11" card, the height of an Item row. It replaces the footer
  text link and the empty-state link on desktop; the header "+ Add" stays.
- It opens a menu: Something to do, Transport, Reminder (the Day view's
  `day-add-menu` plus Reminder, date preset).
- "Add a stay" / "Add another place" (`stay-panel.tsx`) and "Add an idea"
  (`ideas-box.tsx`) use the same dashed card style.

### P2. Where you're staying

Same note.

- `StayBlock` (`components/plan/stay-panel.tsx:46-121`) on desktop: a card in
  the D6 style, with three blocks side by side: **When** (check-in,
  check-out, times, nights), **Where** (address, map link), **Booking**
  (confirmation in mono, Booking state, cost and Paid/Unpaid). Notes, file
  count and the booking-confirmation marker on a quieter line beneath.
- Blocks stack when the panel is narrow (container query, as today).

### P3. Fit tile

Note: `cmwkhzk4d000108k1buhyingt`.

- Hidden when every Stop is Scheduled and slack is 0 or more. Shown when any
  Stop is Rough, the plan runs over, or the state is "unset" / "dormant".
- The "over" segment draws inside the bar (`fit-tile.tsx:45-50`).
- Bar and pill derive from the same numbers (`lib/plan-overview.ts:65-80`):
  the bar never shows an overrun unless the state is "over".
- PLAN.md §6.2 updated to match.

### P4. Reminders: edit and delete

Note: `cmwki0dss000208k1tqlmbq00`.

- `components/trip/reminder-list.tsx` (Stop extras dialog, Transport form,
  Item form): each row gets Edit and Delete. Edit reuses
  `AddReminderDialog` prefilled and calls `updateReminder`; Delete calls
  `deleteReminder` with a confirm.
- Past reminders are listed (dimmed, under "Earlier") and can be deleted,
  here and on the Checklists Reminders card.

### P5. "Doesn't need one"

Note: `cmwki2fz3000508k1dh2yuo00`.

- `components/trip/booking-confirmation-marker.tsx`: the line reads "No
  booking confirmation yet" with a small outlined button "Doesn't need one"
  (no underline). After pressing, an "Undo" toast for about 6 s reverses it.
- The edit dialog's "Nothing to attach" switch keeps its name.

## E. Elsewhere

### E1. Trips carousel arrows

Notes: `cmwkhnqw0000008jq8bpbs717`, `cmwkhobht000108jqtc4jp242`.

- `components/trips/trip-carousel.tsx:64-75`: measure cards relative to the
  track (`c.offsetLeft - el.offsetLeft`, or make the track the offset
  parent). One press moves one card at 1024, 1259, 1280 and 1920.
- The test stops mocking `offsetLeft` in a way that hides the page offset.
- The disabled arrow reads as disabled, not as missing.

### E2. Next payment

Note: `cmwkhozjr000008l4a9l2sh9z`.

- `components/trip/home/desktop/trip-cost-tile.tsx:107-130`: the Trip
  currency amount stays at display size; the original currency moves to a
  small line beneath ("Rp 1,000,000"), never beside it. Nothing clips at
  1024 to 1920, with and without a cover.
- Zero-decimal currencies (IDR, JPY, KRW, VND at least) format without
  ".00" (`CURRENCY_DECIMALS`, `lib/money/money.ts`).
- The phone card (`upcoming-payments-card.tsx`) gets the same two-line form.

### E3. Share-link fields

Note: `cmwkibgfe000207lbq61tyndj`.

- `components/trip/settings/share-links-panel.tsx` (five label + input
  pairs in `space-y-1`): use `<Field>` or its 6px gap so the focus ring
  clears the label.
- Sweep for any other label within 6px of `Input` / `Textarea` / `Select`.

### E4. Pills

From note `cmwkigdgs000407lbfsdcsv5m`.

- `components/ui/badge.tsx:11`: 12px text and slightly more padding from
  `lg` up; 10px below. Sweep the desktop pages for wrapping or clipped pills
  (35 files use it) and fix what breaks.

### E5. Calendar month grid (desktop)

Same note.

- `components/trip/month-grid.tsx`: every week row is the height of the
  month's tallest day; nothing overflows.
- A day lists up to three things by name with their time ("10:30 Louvre"),
  timed first, then "+N more".
- Each Stop is a coloured band across the top of its days, name shown once
  per week row.
- Day number and transport / check-in / check-out icons stay on one line.
- Clicking a day opens its Day view (as now). A Surprise's things are not
  listed for the surprised viewer.
- Below `lg` the compact grid is unchanged.

## Glossary

CONTEXT.md gains **Ends at**, **Hop mode**, **Marked fine**; **Local travel
mode** gains Walk; **Day map** and **Flag** are touched up.

## Not building

- A per-Stop walking-distance setting.
- Marking any other Flag fine.
- A "wander" Item type.

## No-build notes

- `cmwkhxwir000408jqxbsq8mne` (wrong pass on the Frankfurt day): the München
  to Strasbourg boarding pass was moved to the Munich to Strasbourg Transport
  on 2026-11-18. Resolve with that as the Resolution once Cam says so.

## After the deploy (Claude, through the Claude connection)

- Set "Ends at" on: Tower Bridge + South Bank walk (Westminster Bridge),
  Oxford Street & Regent Street (Marble Arch), The Mall to Trafalgar Square
  (start pin to Buckingham Palace, ends at Trafalgar Square), Hot chocolate
  hunt.
- Re-pin Englischer Garten at the park, near the Eisbachwelle.
- Consider setting Paris to Walk.
