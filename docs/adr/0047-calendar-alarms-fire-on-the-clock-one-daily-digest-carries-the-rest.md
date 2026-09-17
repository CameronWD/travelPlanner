# 0047 — Calendar Alarms fire on the clock; one daily Digest carries the rest

## Status
Accepted (2026-09-16)

## Context

The reminder pipeline has existed since the first build and has never
delivered anything. Production holds zero `Reminder` rows, zero
`PushSubscription` rows and zero `COST_DUE` markers — not because delivery
was failing, but because nothing could subscribe: `EnableNotifications` is
rendered only by `RemindersCard`, which is rendered only by
`PhaseTravelling`. Every Trip so far has been in Planning, so the button has
never appeared on a screen. The first payment alert that matters is due 28
November 2026, against an Airbnb charge on 1 December, and travel starts in
early December.

Wanting per-event push — "your train leaves in 2 hours" — runs into an
operating cost that has nothing to do with push. Each authorised hit of
`/api/cron/reminders` wakes Neon for roughly five minutes of compute, so
cadence is the CU-hour lever against the 100 CU-h free tier: daily ≈ 3
CU-h/month, hourly ≈ 60, every fifteen minutes ≈ 240. Hourly consumes most
of the allowance to deliver alerts still carrying up to an hour of jitter —
paying nearly the whole budget for a warning that is not actually punctual.

Two platform facts decide the rest. Both Travellers carry iPhones, and iOS
allows web push only from a PWA installed to the Home Screen. And the app
already publishes a **Calendar feed** those phones can subscribe to, which
today emits no alarm data at all (`lib/ics.ts` writes no `VALARM`), even
though a calendar app fires alarms precisely, offline, at zero cost to us.

## Decision

Split alerting by what each mechanism is genuinely good at, and give each one
a distinct name in `CONTEXT.md`.

- **An Alarm is clock-precise and is not ours.** `VALARM` blocks published
  inside the Calendar feed — three hours before a flight, two before other
  **Transport**, the morning of a check-out. The Traveller's calendar app
  fires them; TEEPEE cannot observe whether one fired. Alarms are a property
  of the Trip's feed, so both Travellers get the same set, each silencing
  them by muting the subscription in their own calendar.

- **A Digest is everything TEEPEE itself sends, at most once a day.** One
  push per person per Trip, carrying whatever is true that day: a **Cost**'s
  **Due date** on each of the three days before it and on the day, **Checklist** items falling
  due, that day's **Reminder**s, and — once the Trip is **Travelling** —
  tomorrow's Transport, check-in/check-out and timed **Item**s. When there is
  nothing to say, nothing is sent. The separate `COST_DUE` push is absorbed,
  and so is its per-cost marker row: idempotency moves up a level to a
  dispatch ledger keyed (person, Trip, local date, morning/evening), claimed
  before sending. Every line in a Digest is derived fresh from the data on
  each run, so nothing needs a marker of its own.

- **Dispatch runs at fixed UTC hours and filters by the subscriber's local
  hour.** The timezone is captured from the browser when a device subscribes
  and refreshed on each visit, so it is right in Sydney during planning and
  right in Vienna during the trip without anyone setting a field. The cron
  fires at 06:00, 09:00, 19:00 and 20:00 UTC; each run sends only to devices
  whose local time is 20:00 (the evening look-ahead) or 07:00 (a travel-day
  morning Digest, sent only when that day holds Transport or a check-out).
  Covering another timezone is one more hour in the list, at ~3 CU-h each.

- **A Reminder carries a date and never a time.** With dispatch at four fixed
  hours, a Reminder promising 14:30 would be a promise the system cannot
  keep. The time field is removed rather than approximated.

The morning travel-day Digest exists specifically to cover the Alarm path
failing silently: iOS subscribes to calendars with *Remove Alerts* enabled by
default, which strips published `VALARM`s. The app states the setting to
change, and the morning Digest means a stripped alarm degrades to a late
warning instead of a missed train.

## Considered Options

- **Hourly push for everything, GitHub Actions.** Rejected: ~60 of 100
  CU-h/month for alerts still up to an hour late, and GitHub delays scheduled
  runs under load and disables schedules after 60 days of repo inactivity —
  a live risk across the December trip, when the reminders matter most.

- **A Cloudflare Worker cron.** Cron Triggers are free, minute-granular and
  immune to GitHub's quirks, so they solve scheduling — but scheduling was
  never the constraint. A Worker firing every minute still wakes Neon every
  minute. It would only pay off by holding the next-fire schedule in KV and
  waking Neon solely when something is due, which is a synchronisation
  problem to build and keep correct for two users. Related: the wider
  Cloudflare migration stays parked (`docs/cloudflare-migration.md`).

- **Calendar Alarms only, delete web push.** Rejected: no digest, no
  look-ahead, and no reach at all once a subscription lapses or an iOS
  default strips the alarms — with nothing to notice the failure.

- **Per-event push for timed Items and check-ins too.** Rejected at the
  design stage: the highest-volume source (a packed day is four or five
  pings) against the tightest cadence budget. These appear in the Digest's
  "tomorrow" section instead.

- **A Trip-level timezone field, or reading the current Stop's timezone.**
  Rejected: `Stop.timezone` is null while rough and absent entirely before
  departure, and a Trip-level field is wrong for the two months of planning
  done from home — precisely when the payment and checklist lines fire.

## Consequences

- **Two rules widened once the Digest absorbed the separate pushes** (recorded
  2026-09-17, during implementation). A Due date now appears on every evening
  from three days out to the day itself, not only on two of them: the old
  two-day rule existed because each alert was its own interruption, and inside
  a once-daily Digest a running "comes out in 2 days" line costs nothing extra.
  And the itinerary section is gated on *tomorrow falling inside the Trip*
  rather than on today's **Phase** being Travelling — the night before
  departure is Final prep, so the phase rule would have hidden the outbound
  flight from the one Digest most worth reading.

- **The Reminder model changes meaning, not just delivery.** `Reminder` stops
  carrying a firing instant, a `sent` flag and a target reference, and becomes
  a Trip, a title and a date. The `COST_DUE` marker rows are dropped with the
  columns that described them — verified zero in production before the
  migration runs.

- **`pushToTripMembers` is retired.** Dispatch becomes per-person: a
  Traveller's own Digest, to their own subscriptions, in their own timezone,
  gated by their own opt-in. Nothing broadcasts to a Trip's membership any
  more.

- **Settings gain a Reminders section, and Home gains Reminders in every
  phase.** The opt-in cannot live behind a Phase gate again — that gate is
  what made the whole feature undeliverable.

- **Two iOS behaviours are now product surface, not footnotes.** The app must
  detect iOS-without-install and say so plainly, and must spell out the
  *Remove Alerts → Off* path beside the feed URL. Neither failure announces
  itself.

- **Punctuality now depends on something we cannot observe.** If a Traveller
  never turns off *Remove Alerts*, no Alarm ever fires and TEEPEE has no way
  to know. The morning Digest bounds the damage; a "Send me a test" control
  in Settings covers the push half, but there is no equivalent probe for the
  calendar half.

- **Calendar feed staleness becomes load-bearing.** Alarms reflect the feed as
  last fetched by the external app — iOS refreshes on a short interval, but
  Google throttles subscribed feeds to every 8–24 hours. A same-day re-time of
  a flight may alarm on stale data. The Digest, being server-side, is always
  current.
