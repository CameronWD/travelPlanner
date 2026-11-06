# Google extras — spec (2026-11-06)

Agreed in a grilling session on 2026-11-06, the day the Google Maps work
(spec 2026-10-30) went live. Decision record: ADR 0076 (amended 2026-11-06).
Glossary: CONTEXT.md **Public holiday**, **Observance**, **Region**,
**What's around** (new); **Flag** (amended).

Five pieces of work on top of Google Maps Platform, all inside the free
monthly allowance:

1. Public holidays and Observances on each day.
2. Map images where nobody pans or zooms.
3. What's around.
4. Closed venues.
5. The full free allowance.

## Delivery

Each branch is planned (superpowers:writing-plans) and executed
(superpowers:subagent-driven-development) on its own, reviewed, then
**merged locally into `main`**. Nothing is pushed until all are merged:
**one deploy**. Cam's manual steps are batched at the end ("Before the one
push" and "After the deploy").

| Branch | Name | Depends on |
|---|---|---|
| 1 | `feat/google-extras-1-allowance` | — |
| 2 | `feat/google-extras-2-holidays` | 1 (cap table) |
| 3 | `feat/google-extras-3-map-images` | 1 |
| 4 | `feat/google-extras-4-whats-around` | 1 |
| 5 | `feat/google-extras-5-closed-venues` | 1 |

Branch 1 also carries the uncommitted operator-script fix in
`lib/surprise-guard.ts` (lazy `next/navigation` import, 2026-11-06), so the
fix is committed before any branch builds on it.

## A. Full allowance (ADR 0076 amended)

### A1. One cap table
The property tracker's Google usage is shut down (keys deleted 2026-11-06),
so Teepee takes the whole free allowance. One module lists each SKU Teepee
calls with its free monthly allowance, plus one **share** number (now `1`,
previously `0.5`). Every app-side daily cap is `floor(allowance × share ÷
30)`. The hand-written 165 (Routes) and 15 (venue details) go; every
counter (`takeGoogleQuota`) reads the table.

| SKU (counter) | Free / month | Daily cap at share 1 |
|---|---|---|
| Routes Compute Routes Essentials | 10,000 | 333 |
| Place Details Enterprise (venue hours on pick) | 1,000 | 33 |
| Nearby Search Enterprise (What's around) | 1,000 | 33 |
| Place Details Pro (closed-status re-checks) | 5,000 | 166 |
| Static Maps | 10,000 | 333 |

The operator scripts' `--cap` stays.

### A2. Docs
DEPLOY §4j's cost rule and quota table are rewritten for share 1. The
console quotas (333/day for each Essentials method) are raised by Cam on
2026-12-01, or earlier only after Billing → Reports shows the property
tracker's November usage left room. Free usage is counted per calendar
month per billing account.

## B. Public holidays

### B1. What a day shows
A **Public holiday** or a named **Observance** is something the day
*shows*, never a **Flag**. It appears on:
- the **Day view**, a line under the date (e.g. "Christmas Day (France):
  public holiday, expect closures"; an Observance in softer words: "Christmas
  Eve: many shops close early");
- the **Day strip** and the **Calendar**, as a small marker;
- the **Today view** and the morning **Digest**, on the day itself.

### B2. Which places count on a day
- A day at one **Stop**: that Stop's country and **Region**.
- A **Changeover day**: both Stops.
- A **Gap day**: the places **Transport** leaves from or lands at *on that
  date*; a day entirely in the air gets nothing.
- The first and last day of the Trip also count the **Home base**.
- Rough Stops have no dates and so no Public holidays.

### B3. Source: Google Calendar's public-holiday calendars
Fetched server-side from Google's **public iCal feeds** for each country
(`https://calendar.google.com/calendar/ical/en.<name>%23holiday%40group.v.calendar.google.com/public/basic.ics`).
These need no key and no Calendar API. Chosen over Nager.Date because Nager
misses Indonesia's lunar and Islamic holidays, including Nyepi (Bali's
airport closes).
- **Data check, done 2026-11-06:** each event's `DESCRIPTION` starts with
  "Public holiday", "Observance", or "Public holiday in <Region>, <Region>"
  (English Region names, e.g. "Baden-Württemberg, Bavaria, Saxony-Anhalt"
  for Epiphany). A half-day holiday adds "This is a half-day holiday."
  (German Christmas Eve). Indonesia's 2026 feed has Nyepi and Idul Fitri.
- **Feed names are Google's, not ISO codes** ("german", "uk",
  "indonesian"; a few are ISO, such as "fj"). They live in a verified table
  from country code to name. A country with no entry, or a failed fetch,
  shows no holidays.
- Cached server-side per country and year in a global table, refreshed when
  older than 30 days. Pages never call Google.
- **Observances:** public holidays plus a short named list kept in code
  (Christmas Eve, New Year's Eve, and Good Friday where it isn't official).
  Nothing else Google lists as an observance is shown.

### B4. Regions
- **Stops**, the **Home base** and both ends of a **Transport** store their
  **Region**, taken from the `administrative_area_level_1` address
  component Google already returns on a pick (no extra call) and from
  server-side lookups.
- A regional holiday shows only where its Region matches. If a Region can't
  be matched against the calendar's naming, the holiday shows with its
  regions named ("in parts of Germany: Bavaria, …") rather than being
  hidden.
- The code's place-search kind `"region"` (cities and areas, used for Stop
  search) is renamed `"area"`, so it doesn't collide with **Region**.
- Existing rows get a Region from a one-off operator script that reads the
  place IDs the 2026-11-06 backfill wrote. It has a dry run and
  `--execute`, like `backfill:places`, and makes about 50 Essentials
  lookups.

### B5. Claude and Reviews
`get_day` carries the day's Public holidays and Observances. A **Review**
receives the same list as input, so it researches only what the app can't
know (whether a given venue opens that day).

## C. Map images (Static Maps)

### C1. Where
- **Share link preview** (`app/share/[token]/opengraph-image.tsx`): the
  route drawn on the card.
- **Print**: a route map at the top, plus a small map per Stop if the
  layout allows.
- **Public Share page**: a map image until the viewer taps "Explore map",
  which then mounts the live Route map.

Everything else stays live.

### C2. How
- Same Map ID styling as the live maps, numbered Stop pins, and the route
  as a path.
- The link-preview image is generated with the server key and cached at
  the edge for a day, so repeat crawls don't call Google.
- `<img>` maps on Print and Share use the browser key, which gets the Maps
  Static API added to its API restrictions.
- When over the cap, or with no key, the image is left out (no broken
  image) and the Share card keeps its current design.

## D. What's around

### D1. Switch
A Trip setting, **What's around**, beside Chapters: **off by default**, any
Traveller can switch it, and it applies to everyone on the Trip. When off,
there are no entry points and no searches.

### D2. Entry points (no clutter)
- One "What's around" button on the **Day view**, sitting with **Day
  ideas** and separate from them. Day ideas stay "own pool only".
- "What's near this" inside an Item's existing ⋯ menu.
- One button on the **Today view**.

All three open the same sheet.

### D3. The sheet
- **Start point:** tonight's **Accommodation** if located, else the
  **Stop**. A "Near me" chip while **Travelling** asks for the device
  location on tap and never stores it. From an Item, the Item's point.
- **Kinds:** Sights, Food, Cafés, Drinks, Shops, each mapped to Places
  types and to the Item **Category** used when adding.
- **About 10 results**, each with name, kind, ★ rating and count, a
  straight-line walk estimate (no Routes call), and open now / until.
- Tapping the name opens Google Maps (Maps URLs, free). Actions:
  **+ Day** (an Item on that day, with place ID, point, address, opening
  hours and status from the result, so no extra details call) and
  **♡ Wishlist**.
- **Nearby Search Enterprise fields** (rating, hours). Results are cached
  per start point and kind for the UTC day. Capped at 33 searches a day;
  past the cap the sheet says to come back tomorrow.
- Results are Google content shown on our page: Google attribution as the
  Places terms require.

## E. Closed venues

### E1. Flag and badges
- **Scheduled Item, closed permanently** → **Flag**: "{name} has closed for
  good. Find a replacement."
- **Scheduled Item, closed temporarily** → softer **Flag**: "{name} was
  temporarily closed when last checked on {date}. Check it reopens before
  {item date}."
- **Wishlist idea** → a badge on the card ("Closed for good" /
  "Temporarily closed"), never a Flag.

Reads the stored `Item.businessStatus` (already set on pick and by the
backfill).

### E2. Freshness
The existing after-save refresh (the one Travel times use) also re-checks
venue Items on **upcoming** Trips whose status is more than 30 days old,
with a Place Details Pro call (`businessStatus` only), capped by the table.
Needs a status-checked-at timestamp on Item. Past Trips are never
re-checked.

## Before the one push (Cam)
0. Raise the console quotas to the A1 share-1 values (333 per Essentials
   method) — on/after 2026-12-01 or after the November billing check. The
   push waits for this.
1. Enable the **Maps Static API** in the `teepee` project. Holidays need no
   API: the feeds are public.
2. Server key and browser key API restrictions: add Maps Static API.
3. Per-day quotas: Maps Static 333. Nearby Search (SearchNearby) 33 if
   offered per method.
4. Local checks Claude can run headless: a Day with a Public holiday, Share
   preview image, Print map, the What's around sheet (one search), and a
   closed-venue Flag on seeded data.

## After the deploy (Cam)
1. Region fill: dry run, read it, `--execute` (`! npm run …`).

## Not in this work / follow-ups
- Reordering a day by Route Matrix (skipped 2026-11-06).
- A nightly Travel-time top-up (Cam: keep refresh-on-edit).
- Google Weather API severe-weather alerts (Open-Meteo stays for weather,
  because Google has no climate history for the "Typical for" card).
- Google Time Zone API (the offline `tz-lookup` stays).
- Place Photos covers (Enterprise 1k, attribution and storage terms).
