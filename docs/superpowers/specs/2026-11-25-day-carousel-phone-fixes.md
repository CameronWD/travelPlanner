# Day view on a phone: four fixes, 2026-11-25

From Cam's screen recording of the live site on his iPhone over 5G, swiping the Day view forward from Fri 4 Dec to Sat 12 Dec. He asked for all four to be fixed.

## 1. The weather card that shows a placeholder, then vanishes

**Seen:** on 11 Dec a grey placeholder for about 0.75 s, then no card at all, and the Day plan jumps up by the card's height. 10 Dec shows "— / —" with an Overcast picture. 12 Dec shows "Typical for Dec".

**Cause:** the forecast service covers today and the next 15 days. `lib/weather.ts` asks it for day 16 too (`out <= FORECAST_WINDOW_DAYS`, 16). That request fails, the reading is null, and a null inside the window renders no card. Day 15 comes back with empty values, which the card draws as dashes with a fallback illustration. The rest of the code already assumes 15 (`forecastOpensOn`, the "15 days before" copy).

**Fix:**
- A forecast is requested only for today through 15 days out.
- When a forecast request fails, or returns no temperatures, the typical-for-the-month reading is used instead, shown as it is beyond the window ("Typical for Dec").
- When there is still no reading inside the window (both sources failed, or offline with nothing cached), the card is drawn in its normal footprint with daylight and the words "No forecast right now", not removed.
- So a day that shows a weather placeholder always ends with a card of the same height. A day that has no weather card at all for a structural reason (no place to look up) shows no placeholder either.

## 2. Two days lit in the date strip

**Seen:** after two quick swipes the day just left stays pale red while the new day is full red.

**Cause:** the highlight and the chip's background both fade over 200 ms in both directions, so during a run several days are part-way through a fade.

**Fix:** only the day becoming lit fades in; a day losing the highlight switches off at once. At most one day is coloured.

## 3. Header text slides under the arrow buttons

**Seen:** while a page is moving, the title and date travel sideways and are drawn underneath the two arrows, which hold still.

**Cause:** the heading track is translated as one piece and clipped only at the screen's edges; nothing clips it to the space between the arrows.

**Fix:** each moving heading is clipped to the gap between the arrows' inner edges, so text leaves behind an arrow's edge instead of passing under it. The heading still travels with the body (ADR 0065, amendment 2026-11-22).

## 4. The header is blank for up to a second after a swipe

**Seen:** after landing on a day, the eyebrow, title, date and sub-line are empty while the arrows, the strip (new day selected) and the body are present.

**Not a state problem:** a probe of the carousel showed that a settle commits once. In the microtask after the settle, one render carries the strip, the new day's heading at rest and the body together (React 19.3 renders its Sync, InputContinuous and Default lanes in one pass). No commit leaves the heading empty, so changing which state the heading reads would change nothing. The earlier guess, that the heading and the day in view commit apart, is disproved.

**Hypothesis (unconfirmed):** the settle frame removes the outgoing panel, takes the incoming one from absolute to static, and in the same frame tears down the track's composited layer (`translate3d`) and the heading's clips. Safari then skips repainting the title block until something later touches the header.

**What was built:** below `lg`, nothing is torn down at rest:
- the track, the arrows and the top bar keep an identity transform;
- the area keeps its clip;
- the title blocks keep a clip that cuts nothing.

From `lg` nothing changes. ADR 0065, amended 2026-11-25, has the details.

**If it is still blank:** the blank set (eyebrow, title, date, sub-line) is exactly the contents of the header's `day-heading-text` ViewTransition. Check in Safari Web Inspector whether a view transition runs on the commit where the navigation lands.

This one can only be confirmed on a phone. It goes to beta for Cam to swipe through a dozen days.

## Not in this work

- The pause on landing more than one day away while days two and three out are fetched (NAV-03, `docs/open.md`).
- Any change at wide screens, where only the day in view is rendered and the heading does not move.

## Documents to bring into line

- ADR 0015 says a weather failure renders only daylight; the 2026-09-27 weather-card spec says it renders no card and closes the gap. This work settles it: inside the forecast window the card always holds its place.
- ADR 0065 gains an amendment for the heading clip and the layer the heading keeps through a settle.
- The 2026-11-23 shift-and-feedback audit records the strip's fade; note the change there.
