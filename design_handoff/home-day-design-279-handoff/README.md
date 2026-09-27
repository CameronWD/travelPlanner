# Teepee design handoff — Home, Day view, Weather card

Drop this folder into the repo root as `home-day-design-279-handoff/`. It is reference only. These specs override any earlier designs for the desktop nav, Home, the Days page and the weather card.

## What to build, in order
1. **App shell** — the full sidebar on desktop ≥1280. See `HOME.md` §1.
2. **Home (desktop)** — `HOME.md`.
3. **Weather card** — `WEATHER_CARD.md`. Build this before the Day view, because the Day view uses it.
4. **Day view (desktop + mobile)** — `DAY_VIEW.md`.

## Images (`images/`)
The images are for reference. The markdown is the source of truth: if an image and the text disagree, follow the text.

| File | Shows |
|---|---|
| `home-desktop-photo.png` | Home, trip with a cover photo |
| `home-desktop-no-photo.png` | Home, no cover photo |
| `day-desktop.png` | Day view, desktop 1440, empty day |
| `day-mobile-empty.png` | Day view, mobile 390, empty day |
| `day-mobile-planned.png` | Day view, mobile 390, travel day with plans |
| `weather-core.png` | Weather cards: sunny, overcast, rain, snow, clear night |
| `weather-more.png` | Weather cards: partly cloudy, fog, storms, windy, scorcher, too far out, loading, offline, and the code map |

## Ground rules (apply to every file)
- Tailwind v4 tokens from `app/globals.css`. Add new tokens there (listed in `WEATHER_CARD.md` §2). Never put raw hex values in components.
- Use className-based components with `cn()` from `@/lib/cn`, lucide-react icons, and Radix/shadcn primitives from `components/ui/`.
- Components are Server Components by default. Add `"use client"` only where noted: trip switcher, search/⌘K, map, cover uploader, day strip scroll/swipe, and the journal editor.
- **Style:**
  - Borders are 2px ink.
  - Shadows are hard offsets with no blur: `5px 5px 0` on cards, `3px 3px 0` on small cards, `4px 4px 0` on mobile cards.
  - Headings and numbers use Bricolage Grotesque 800. Everything else uses Plus Jakarta Sans.
  - Text on coloured fills is always ink, except on the ink (night) weather card, where it's paper.
- **Dates:** always go through `formatDay()` ("Sat 12 Dec"). Never show an ISO date.
- **Accessibility:** 4.5:1 contrast, the global focus ring, touch targets of at least 44px, and `prefers-reduced-motion` respected.
