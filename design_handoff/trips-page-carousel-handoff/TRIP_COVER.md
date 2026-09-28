# Trip cover: photo, route sketch or passport stamp

Images: `images/cover-route-sketch.png`, `images/cover-passport-stamp.png`.

The cover is always a tilted polaroid of a fixed size, so cards stay aligned whatever the content. A trip never shows a grey box.

## 1. Choosing which cover to show (`trip-cover.tsx`)

```
if (trip.coverPhotoUrl)                 → Photo
else if (mainLeg(trip).stops.length ≥ 2) → Route sketch
else                                     → Passport stamp
```

An uploaded photo always wins. Removing the photo falls back to the generated cover, which is recomputed on render. Don't store the generated covers; they're pure SVG/DOM built from trip data.

## 2. Polaroid frame (shared)

| Size | Used on | Frame width | Padding (top/sides, bottom) | Inner aspect | Radius (frame/inner) | Shadow | Rotation |
|---|---|---|---|---|---|---|---|
| hero | Up next card (desktop) | 150px | 7px, 24px | 3:4 | 10px / 4px | `4px 4px 0` | `+4deg`, 12px right margin, vertically centred |
| small | Standard card (desktop) | 92px | 5px, 14px | 1:1 | 8px / 3px | `3px 3px 0` | alternate `-5deg`, `+4deg`, `-3deg` by card index |
| mobile hero | Up next (mobile) | 86px | 5px, 14px | 3:4 | 8px / 3px | `3px 3px 0` | `+5deg` |

- **Frame:** white fill, 2px ink border.
- **Inner box:** 2px ink border, `overflow-hidden`.
- **Photo:** `object-fit: cover`, `next/image` with `sizes` set to the frame width at 2x.
- **Caption strip:** the bottom padding on the hero size doubles as a caption strip, 11px bold and centred, positioned 5px from the bottom. Only the route sketch uses it.
- **Adding a photo:**
  - On hover (desktop) or long-press (mobile), an "Add photo" / "Change" pill appears over the frame.
  - It opens the existing cover uploader. That's client-only; lazy-load it.
  - On the trips page, the pill appears only when the user can edit the trip.

## 3. Route sketch (`cover-route-sketch.tsx` + `lib/trips/route-sketch.ts`)

### Picking the stops, `pickMainLeg(stops)`
1. Take the trip's stops in itinerary order. **Exclude the home base / origin.** The leg from home and the leg back home are never drawn.
2. Work out the great-circle distance of each leg between consecutive stops.
3. Split the list into clusters wherever a leg is longer than `max(1500 km, 3 × median leg)`.
4. The **main leg** is the cluster with the most nights. On a tie, pick the one with the most stops, then the earliest.
5. **Off-frame stops** are stops outside the main leg. They're never drawn; they get an edge chip instead (§3 "Drawing").
6. If the main leg has fewer than 2 stops, return `null`, and the caller shows the passport stamp.

Example, Christmas in Europe: Sydney (home) → Kuta, Bali (4n) → London … Rome (31n). Sydney is excluded. The Bali → London leg splits the stops into two clusters. Europe has the most nights, so it's the main leg, and the chip reads "+ Bali".

This is the same rule as the "current chapter" fit on the Home route map (HOME.md §6). Share the clustering code, and cover it with unit tests.

### Projection, `projectToBox(points, {w:100, h:133 | 100, pad:0.12})`
- Use an equirectangular projection with an x-scale of `cos(meanLat)`, so Europe doesn't look squashed.
- Fit to the box with 12% padding and keep the aspect ratio: scale uniformly and centre on the unused axis.
- The box is 100×133 for 3:4 (hero sizes) and 100×100 for small.
- If every point is within 5 km of each other (a same-city trip), show the stamp instead.

### Drawing
- **Background:**
  - The map-teal fill (#EAF3F2, map palette).
  - A grid of 1px ink lines at 7% opacity, 16px apart on the hero size and 12px apart on small.
- **Path:**
  - An SVG `polyline` through the points in order.
  - Stroke is ink, 1.6 in viewBox units, `stroke-dasharray: 3 2.5`, round joins, no fill.
- **Stop dots** (HTML spans positioned by %, or SVG circles), all with a 2px ink border:

  | Dot | Hero size | Small size | Fill |
  |---|---|---|---|
  | First stop | 14px | 10px | sun |
  | Last stop | 14px | 10px | coral, or the trip colour if it isn't coral |
  | Middle stops | 10px | 7px | white |

  - Show at most 14 dots. If there are more, keep the first, the last and evenly sampled stops in between. The path still goes through every point.
- **Edge chip:**
  - Bottom-left of the inner box, 5px inset. White fill, 1.5px ink border, pill shape, 9px weight 800, padding 1px 6px.
  - Text: `+ {first off-frame stop's short name}`. With more off-frame stops it reads "+ Bali +2".
  - Leave it out when there are no off-frame stops. On small sizes, show it only if the box is at least 80px.
- **Caption** (hero size only, in the polaroid's bottom strip): `{first main-leg city} → {last main-leg city}`, for example "London → Rome". Truncate with an ellipsis.
- Mark everything `aria-hidden`. The card's link name carries the meaning.

## 4. Passport stamp (`cover-stamp.tsx`)

Used when there's no photo and the route sketch returns `null` (0 or 1 stops, or a same-city trip).

- **Inner box:** paper fill (`--surface-page`), content centred.
- **Stamp:** a circle made of a 3px outer ring plus a 1.5px inner ring, 6px apart.
  - Hero size: 108px circle, rotated `-14deg`.
  - Small size: 64px circle with a single 2.5px ring, rotated `+10deg`.
- **Ink colour:** the dark shade of the trip's hue, which must pass 4.5:1 on paper. Coral uses `#B8391D` and teal uses `#2E8A88`. Add one `--hue-{name}-ink` token per ramp hue in `app/globals.css` if it doesn't exist yet.
- **Text, hero size** (centred, ink colour):
  1. "★ ARRIVED ★": 9px, weight 800, letter-spacing 0.14em;
  2. the place: Bricolage 800, 22px, line-height 1, uppercase, 3px vertical margin;
  3. the date: 10px, weight 800, letter-spacing 0.1em, 1.5px rules above and below, padding 2px 0. Format `DD MON YY`, e.g. "04 DEC 26".
- **Text, small size:** the place (Bricolage 800, 13px) with the date under it (7px, weight 800, letter-spacing 0.1em). Leave out "ARRIVED".
- **Which place to show:**
  - With 1 stop: that stop's city name.
  - With 0 stops: the trip name, or its country code if the trip has one country. For example, "New Zealand" becomes "NZ" on the small size, where anything over 8 characters is abbreviated.
  - Hero size: at most 10 characters per line and 2 lines, then an ellipsis.
- **No start date:** leave the date row out. On hero, "★ ARRIVED ★" becomes "★ SOMEDAY ★".
- Mark it `aria-hidden`.

## 5. Scope

These covers apply on the **Trips page** cards. The trip Home countdown tile keeps its no-photo layout from `home-day-design-279-handoff/HOME.md` §3–4, which is a 200px tile with "+ Add a photo". Using the route sketch there as well is a possible follow-up; it isn't part of this handoff.
