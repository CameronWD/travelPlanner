# Weather card

The card has one fixed layout. The weather sets its **fill colour** and a **scene** in the top-right corner, made from plain circles and pills with 2px ink outlines. References: `images/weather-core.png`, `images/weather-more.png`.

## 1. Files
- `lib/weather/theme.ts`: `getWeatherTheme(day, opts) → ThemeKey`. Pure function, unit-tested.
- `components/weather/WeatherCard.tsx`: a Server Component, with `size: "regular" | "compact"`.
- `components/weather/scenes.tsx`: one small component per scene (`<SunScene/>`, `<CloudScene/>`, …). Pure CSS, no images and no SVG, except the lightning bolt, which uses `clip-path`.
- `components/weather/WeatherCardSkeleton.tsx`.

Data comes from Open-Meteo, as it does today:
- daily: `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_probability_max`, `wind_gusts_10m_max`, `sunrise`, `sunset`, `uv_index_max`, `snowfall_sum`;
- plus `is_day` and current `temperature_2m` for the Today view.

## 2. New tokens (add to `globals.css`, light + dark)

| Token | Light | Use |
|---|---|---|
| `--wx-sunny` | `#FFD166` (= `--accent-money`) | sunny |
| `--wx-partly` | `#FFE8A8` | partly cloudy |
| `--wx-overcast` | `#D9D4CA` | overcast |
| `--wx-fog` | `#E4DFD4` | fog |
| `--wx-rain` | `#5BC0BE` (= teal) | rain |
| `--wx-snow` | `#E6DBFF` | snow |
| `--wx-storm` | `#C7A2FF` (= lilac) | storms |
| `--wx-wind` | `#BFE6E4` | windy |
| `--wx-heat` | `#FF6B4A` (= coral) | scorcher |
| `--wx-night` | `#1D1D1B` (= ink) | clear night |
| `--wx-sun-disc` | `#FF9F5A` | sun disc on the sunny card |
| `--wx-cloud` | `#FFFFFF` | cloud fill |
| `--wx-cloud-back` | `#EFEBE4` | the back cloud on overcast |
| `--wx-cloud-storm` | `#A9A298` | storm cloud fill |

**Dark mode:** keep the same fills. The card is a coloured object, like the other accent tiles. The border and shadow stay ink. Don't invert colours on the night card.

## 3. Choosing the theme (in priority order)

1. **Offline or stale** (fetch failed, cached data older than 1h): show the last cached theme's fill with **no scene**, plus an ink chip reading "Offline · updated 2h ago".
2. **No forecast yet** (the date is more than 16 days away), with no climate data either: use the **Too far out** card (§6).
3. **Clear night:** Today view only, when `is_day = 0` and the code is 0–2.
4. **Scorcher:** max ≥ 35° and code 0–2.
5. **Windy:** max gusts ≥ 40 km/h and code 0–3.
6. Otherwise, by weather code:

| Code | Theme |
|---|---|
| 0, 1 | sunny |
| 2 | partly |
| 3 | overcast |
| 45, 48 | fog |
| 51–67, 80–82 | rain |
| 71–77, 85–86 | snow |
| 95–99 | storm |

When the date is beyond the forecast range but we have a climate normal, use the theme for the normal's typical code and add the chip "Typical for Dec".

## 4. Layout

| | Regular (desktop, tablet) | Compact (mobile) |
|---|---|---|
| Size | full width of the column × 236px | full width × 140px |
| Padding | 20px 22px | 14px 16px |
| Radius / shadow | 24px / `5px 5px 0` | 20px / `4px 4px 0` |
| Eyebrow | "SAT 12 DEC · STRASBOURG" (11px, weight 800, tracked) | hidden (the page header already shows it) |
| High | 60px Bricolage 800, line-height .9, −0.04em | 44px |
| "/ low" | 26px Bricolage 800 | 20px |
| Condition | 20px Bricolage 800, plus one chip | 17px, plus the chip at 10px |
| Daylight labels | 12px, weight 700: "↑ 08:12", "8h 22m daylight", "16:33 ↓" | 11px, with the middle label shortened to "8h 22m" |
| Scene | full size | the same scene at `scale(.62)`, `origin-top-right` |

Contents, top to bottom: eyebrow, then the high/low row, then the condition row, then the daylight bar pinned to the bottom (`mt-auto`).

- **Card:** `relative overflow-hidden`, 2px ink border, theme fill. All text sits above the scene (`relative`).
- **Chip** (exactly one): white pill, 2px ink border, 11px weight 700, padding 2px 8px. It shows the single most useful fact:
  - storms or rain: "Rain 70% · after 2pm";
  - sunny: the UV warning when UV ≥ 8;
  - snow: the snowfall amount;
  - windy: gusts and feels-like temperature;
  - scorcher: the heat warning;
  - otherwise "Typical for Dec" or "Clears by noon".
  If there's nothing useful to say, show no chip.
- **Daylight bar:**
  - 12px tall (10px compact), pill shape, 2px ink border, white track = night.
  - The daylight segment is `left = sunrise/24h`, `width = (sunset − sunrise)/24h`, filled `--wx-sunny` with 2px ink borders on its left and right edges.
  - On the sunny card the segment uses `--wx-sun-disc`, so it stands out against the yellow card.
  - `role="img"` with the label "Daylight 08:12 to 16:33, 8 hours 22 minutes".
- **Attribution:** "Weather by Open-Meteo" goes in the Day view's info tooltip / page footer, not inside the card.

## 5. Scenes (positions are for the 420×236 regular card)

All scene parts are `absolute` and `aria-hidden`.

**Cloud recipe** (a 170×92 box). A cloud is three shapes: a pill of 160×50 at (0,40), and circles of 60 at (30,10) and 70 at (75,0).
- First draw all three shapes with a 2px ink border.
- Then draw the same three shapes again on top, with no border, inset by 2px (pill 156×46 at 2,42; circles 56 at 32,12 and 66 at 77,2), in the cloud fill.
- The second layer hides the inner outlines, so you get one clean outline.
- Build it as `<Cloud fill="…" className="…"/>`.

| Theme | Scene |
|---|---|
| **sunny** | A 120px circle in `--wx-sun-disc` with a 2px ink border, at right:−6 top:−6. Around it, a 176px circle with a 3px **dashed** ink border and no fill, at right:−34 top:−34. |
| **partly** | A 110px `--wx-sunny` disc at right:30 top:−10, with a white Cloud in front at right:−20 top:50. |
| **overcast** | A white Cloud at right:−10 top:14. A smaller back cloud (110×60: pill 100×32 at 0,26 and circle 44 at 22,4) in `--wx-cloud-back` at right:92 top:74. |
| **fog** | Four white pills, 20px tall with a 2px ink border, staggered (width/right/top): 190/−20/24, 150/40/56, 170/−30/88, 110/60/120. |
| **rain** | A white Cloud at right:−10 top:10. Seven ink drops (4×18, radius 2, `rotate(18deg)`) scattered between x 230–360 and y 106–152. |
| **snow** | 12 white dots with 2px ink borders, 8–18px, scattered across the right half. No cloud. |
| **storm** | A Cloud in `--wx-cloud-storm` at right:−10 top:10. Under it, a lightning bolt, 48×78, `clip-path: polygon(55% 0,0 58%,40% 58%,25% 100%,100% 36%,58% 36%,80% 0)`, drawn twice: first ink, offset +4px x and +4px y (the hard shadow), then `--wx-sunny` on top. |
| **windy** | Three ink bars, 6px tall, radius 3 (width/right/top): 150/30/40, 110/60/80, 170/20/120. Each bar ends in a curl: a 26px ring with a 6px ink border, left and bottom borders transparent, `rotate(45deg)`, placed at the bar's right end. |
| **heat** | A 108px `--wx-sunny` disc with a 2px ink border at the top-right corner. Two dashed 3px rings around it (156px and 200px). |
| **night** | Ink card with paper text, and a hard shadow in **coral** (`5px 5px 0 var(--accent-primary)`) so it still reads on paper. A crescent moon: a 96px `--wx-sunny` circle, with an ink 84px circle over it offset 18px right and 12px up. 8 paper dots (3–4px) as stars. The daylight track is `#302D29` with a paper border, plus a 4px coral "now" tick. |

**Motion (optional; skip when `prefers-reduced-motion`):**
- clouds drift 6px sideways over 8s, alternating;
- rain drops fall 8px, looping over 1.2s;
- snow falls 10px over 3s;
- the sun ring rotates slowly over 40s.
Nothing flashes, including the storm bolt.

## 6. Other states

- **Too far out:** paper fill, 2px **dashed** ink border, no shadow, no scene.
  - Eyebrow: date and place.
  - "Usually 3° / −2°" (40px Bricolage 800).
  - "Too far out for a forecast. We'll switch to the real one on Fri 18 Dec, 15 days before." (14px, weight 600).
  - At the bottom, two chips: a climate fact ("Snow on 6 days in Jan") and "↑ 07:57 · 16:14 ↓".
- **Loading:** a white card with the same border, shadow and size. `--surface-canvas` (#EFE9DF) bars for the eyebrow (130×12), temperature (150×52), condition (180×18) and daylight bar (full width × 12), plus a 96px circle top right. Use the shared skeleton pulse.
- **Offline:** see §3.1. The chip sits top right, ink fill with paper text.
- **Error with no cache:** don't render the card. The Day view closes the gap.

## 7. Acceptance
- A snapshot test for every theme at both sizes.
- `getWeatherTheme` has unit tests for every code group plus each override: night, heat, wind, offline, too far out.
- Text contrast is at least 4.5:1 on every fill (all are ink on light fills, paper on ink).
