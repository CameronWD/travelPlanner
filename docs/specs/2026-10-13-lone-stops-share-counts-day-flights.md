# Spec — lone Stops, Share counts, flights from the Day view

**Status:** agreed in the 2026-10-13 session (grill), building on branch
`feat/lone-stops-share-counts-day-flights`. Target `main`.
**Source:** two Feedback notes on main from the Cairns Work trip (site
`main`, 2026-10-13):

- `cmv6etj40000306kz0gfk79br` — "When I share my trip, it shows 0 stops but
  I have 3 over the two days. I checked and have share all"
- `cmv6emadt000406jpeqnl499v` — "Is there a way to add my flights into the
  day plan?"

**Decision record:** ADR 0073 (amends ADR 0009). CONTEXT.md **Stop** and
**Share link** updated in the same commit.

## What happened

The Traveller made a Trip with dates (2026-11-04 → 2026-11-05), added the
hotel as one **rough** Stop (1 night, no dates), added three dated Items
from the Day view (saved with no Stop), and shared it. Share drops rough
Stops at the query (`loadShareStops`), so the hero/tally/CTA said "0 stops"
and, with zero scheduled Stops, the day-by-day section was switched off
entirely. The Day view also drops rough Stops, so the day had no Stop, no
weather and no Stop picker. Transport is only reachable from the plan
editor's legs between scheduled Stops, so flights could not be added at
all. Nothing told them a rough Stop was the cause.

(They also hit LA-109, the "Where to?" field collapsing to a black line on
the Add-a-stop sheet. That is fixed on main as of 2026-10-13 05:46 UTC and
production was last deployed 2026-10-12 10:23 UTC; the deploy that closes
these notes ships it. Nothing to build.)

## Decisions

1. **Lone-Stop rule.** When a Trip has a start and end date and exactly one
   Stop in a given plan (real plan or Fork), that Stop is scheduled to the
   Trip's dates: arrive on the start, depart on the end. The Trip's dates
   win over the rough nights count. Runs on Stop create, on a Stop being
   made rough, on Trip dates being set or changed, and on a delete that
   leaves one Stop. Adding a second Stop never un-schedules the first. The
   Stop's timezone is derived the same way the scheduled-create path derives
   it (from its country) and left as-is if it cannot be.
2. **Backfill.** A Prisma data migration applies the same rule once to every
   Trip already in that state, so Cairns Work is fixed by the deploy.
3. **No dead-end entry.** The Add Stop sheet does not offer "Roughly" when
   the Stop would be the only one on a dated Trip; it opens in exact mode
   with the Trip's dates prefilled. "Make it rough" is absent from a lone
   Stop's menu and sheet on a dated Trip. Rough stays available from the
   second Stop on, and always on a date-less Trip.
4. **Share counts rough Stops.** Hero, tally, social image and "Use this
   route" count every Stop of the real plan. The route list shows rough
   Stops in slot order (the plan's canonical order) with their nights and
   no dates. Route copy carries them. Day-by-day, Right now card and map
   pins stay scheduled-only.
5. **Flights from the Day view.** The Day page's add action becomes a
   chooser: "Something to do" opens the Item form as today; "A flight,
   train or drive" opens the existing Transport form with the departure
   date set to that day. Endpoints default from the day: Home base → the
   Stop on its arrive date, the Stop → Home base on its depart date,
   otherwise from the Stop with the destination unset. On a day no Stop
   covers, both endpoints are unset. The saved leg is an ordinary Transport,
   visible on the Plan page and that day's Timeline.
6. **Home base hint.** When the Trip has no Home base, a Home-base endpoint
   in the Transport form shows a one-line hint, "No Home base yet. Set one
   in Trip settings", linking to Trip settings. It never blocks saving.
7. **Day-added Items get their Stop.** The Day view passes the covering
   Stop as the Item form's default Stop.
8. **Feedback trailers.** The lone-Stop and Share commits carry
   `Resolves-Feedback: cmv6etj40000306kz0gfk79br`; the Day-view flights
   commit carries `Resolves-Feedback: cmv6emadt000406jpeqnl499v`. No
   `feedback:resolve` runs until the deploy is confirmed live. The Share
   note's Resolution also mentions the Add-a-stop field fix.

## Out of scope

Rendering rough Stops on the Day view, Calendar or other dated views; any
change to the Transport model; the Plan page's own add-transport paths.
