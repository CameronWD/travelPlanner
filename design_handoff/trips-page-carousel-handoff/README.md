# Teepee design handoff: Trips page (carousel, first run, generated covers)

Put this folder in the repo root as `trips-page-carousel-handoff/`. It's reference only. It replaces the current `/trips` index page on desktop and mobile. It builds on `home-day-design-279-handoff/`: the same app shell, visual language and ground rules. Read that README first if you haven't.

## Fidelity
High fidelity. The sizes, colours, type and copy are final. Rebuild them in the repo's stack (Next.js 16 App Router, Tailwind v4 tokens, shadcn/Radix, `cn`, lucide-react). The HTML in `reference/` is a design mock, not code to copy. Swap in lucide icons where the mock uses unicode glyphs (⌕ ✈ ☾ ▦ ◎ ☺).

## What to build, in order
1. **Shell tweaks for trips-level pages.** See `TRIPS_PAGE.md` §1.
2. **Trip cover system:** photo, route sketch or passport stamp. See `TRIP_COVER.md`. Build this first, because every trip card uses it.
3. **Trips page, desktop:** header, trip carousel, travels map and Tally. See `TRIPS_PAGE.md` §2–6.
4. **First-run state, desktop.** See `TRIPS_PAGE.md` §7.
5. **Mobile, both states.** See `TRIPS_PAGE.md` §8.

## Images (`images/`)
The images are for reference. The markdown is the source of truth: if an image and the text disagree, follow the text. The grey diagonal-striped boxes in the images stand for uploaded photos.

| File | Resolution | Shows |
|---|---|---|
| `trips-desktop-carousel.png` | 1440×900 @1x | Trips page with 4 trips (3 upcoming, 1 done). Fits 900px tall with no page scroll. |
| `trips-desktop-first-run.png` | 1440×900 @1x | First run: no trips, nothing travelled |
| `trips-mobile.png` | 390×844 @2x | Mobile, with trips |
| `trips-mobile-first-run.png` | 390×844 @2x | Mobile, first run |
| `cover-route-sketch.png` | 918×318 @2x | Generated cover: route sketch on the hero card, and the stamp fallback on a 0-stop card |
| `cover-passport-stamp.png` | 918×318 @2x | Generated cover: passport stamp on both card sizes |

## Proposed files
Server Component unless marked **client**.

```
app/(app)/trips/page.tsx                    Server. Fetches trips, stats and pins; picks populated vs first-run layout
app/(app)/trips/actions.ts                  Server Actions: createTrip(name), createPastTrip(...)
components/trips/trips-header.tsx           Greeting, h1, meta line, carousel arrows slot, + New trip
components/trips/trip-carousel.tsx          client. Scroll-snap row, arrow buttons, page dots, keyboard support
components/trips/trip-card-hero.tsx         "Up next" coral card (600px)
components/trips/trip-card.tsx              Standard card (300px); variants: planning | idea | done
components/trips/trip-cover.tsx             Picks photo → route sketch → stamp; renders the polaroid frame
components/trips/cover-route-sketch.tsx     SVG sketch from projected points (no client JS)
components/trips/cover-stamp.tsx            Passport stamp
components/trips/travels-map.tsx            client. Leaflet map, all trips' pins, trip filter chips
components/trips/tally-card.tsx             client (Planned / Been toggle only)
components/trips/first-trip-card.tsx        client. Name input + Start planning → createTrip
components/trips/past-trip-card.tsx         "Already been?" tile / row
lib/trips/route-sketch.ts                   Pure: pickMainLeg(), projectToBox(). Unit-test this
lib/trips/tally.ts                          Pure: planned vs been aggregates
lib/trips/trip-status.ts                    Pure: status, sort order, "sleeps to go"
```

If the repo already has a polaroid or cover uploader from the Home handoff, reuse it inside `trip-cover.tsx`. Don't duplicate it.

## Ground rules
The same rules as `home-day-design-279-handoff/README.md`:
- Tokens only, no raw hex in components.
- 2px ink borders and hard offset shadows.
- Bricolage Grotesque 800 for headings and numbers; Plus Jakarta Sans for everything else.
- Dates go through `formatDay()` / a `formatRange()` helper and never show as ISO.
- Touch targets are at least 44px.
- Respect `prefers-reduced-motion`.

**New rule:** every label, chip and pill is `whitespace-nowrap shrink-0`, because pills in flex rows broke onto two lines in review.

## Reference
`reference/Trips Fix.dc.html` is the live mock. Open it in a browser next to `support.js`. The screens are:
- 3a / 3b: generated covers
- 2a–2d: final page states
- 1a: the earlier scrolling layout, now superseded by 2a

The card to the right of each group lists the reasoning behind that group.
