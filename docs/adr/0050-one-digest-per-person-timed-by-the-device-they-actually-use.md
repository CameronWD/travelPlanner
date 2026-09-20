# 0050 — One Digest per person, timed by the Device they actually use

## Status
Accepted (2026-09-20). Amends ADR 0047.

## Context

ADR 0047 promises one Digest a day, in the evening, "in the timezone the
**Device** last reported". The implementation reads that per *subscription*:
`app/api/cron/digest/route.ts` groups recipients into `(userId, timezone)`
pairs and dispatches each pair separately, while `dispatchDigest` sends to
`findMany({ where: { userId } })` — **every** Device the person owns,
regardless of which zone triggered the run. The dispatch ledger is keyed
`(userId, tripId, localDate, slot)` with no zone in it.

Those three facts combine into a bug that the December trip walks straight
into. A laptop enabled at home keeps reporting `Australia/Brisbane` and
keeps that stored value indefinitely, because a Device that is never opened
never revises its answer. A phone carried to Europe reports
`Europe/Berlin`. Brisbane reaches its evening window some nine hours before
Munich does, claims the day's ledger slot, and pushes to *both* Devices — so
the phone in the traveller's pocket buzzes at roughly 11am Munich time with
"Tomorrow". When Munich's own 8pm arrives, the ledger answers `already-sent`
and nothing comes. Every evening of the trip, the Digest lands mid-morning.

The follow-up notes from the 0047 rebuild filed this under "Two zones 13h+
apart — vanishingly rare; no code today". That undersells it twice: it needs
nowhere near 13 hours, and "laptop at home, phone abroad" is the ordinary
shape of a trip.

Separately, `lib/digest.ts` emits lines in category order — payments,
checklist, reminders, transports, stays, items — and truncates at
`DIGEST_MAX_LINES = 6`. The schedule is therefore last in and first cut. Six
overdue **Checklist** items push tomorrow's outbound flight into `+1 more`,
inside a push whose title is "Tomorrow".

## Decision

**1. A person has one zone: the one reported by their most recently seen
Device.** The cron route resolves each `userId` to a single timezone — the
`timezone` of the `PushSubscription` with the newest `lastSeenAt` — and
dispatches once. All of that person's Devices receive it.

`lastSeenAt` now means "last used the app", because `DeviceSync` mounts in
the authenticated root layout (ADR 0048), so the phone being carried is
seen daily while the laptop left at home goes quiet. This keeps ADR 0047's
"single outward interruption" literally true and needs no schema change.

**2. The Trip's own clock is the recipient's zone.** `resolveTripZone` takes
the dispatching zone as its first answer, falling back to the existing
`guessTimezoneForCountry(homeCountryCode)` and then to the current Stop's
zone. The only leg without a departure Stop is the **outbound** one, and on
the evening before an outbound flight the traveller is standing at their
Home base — so their Device is in the home zone and reporting it.

**3. The Digest is ordered by what is most costly to lose, not by
category.** Schedule (transport, check-in/out, timed Items) first, then
**Reminder**s, then payments, then **Checklist** items, with the checklist
block capped at 2 lines. The cap always eats the tail, so the tail must hold
the most repeatable content: a Reminder is said once and never again; a
payment repeats on each of the three days before and on the day; an overdue
Checklist item reappears every night until it is done.

## Considered options

**Per-zone cohorts** (add `timezone` to the ledger key, send only to that
cohort's Devices) — rejected. It is more precise per Device, and it is the
obvious reading of "the timezone the Device last reported". But it means two
pushes a day for anyone who owns Devices in two places, and `CONTEXT.md`
calls the Digest "the single outward interruption the app allows itself".
Correctness per Device is not worth breaking the one promise the feature is
built around.

**A coordinate-to-zone lookup** for the Home base, using the `homeLat` /
`homeLng` the Trip already stores — rejected for now. It is the fix the 0047
follow-ups proposed, and it is genuinely more accurate at zone boundaries.
But it adds ~1.3MB of boundary data to a dependency list of 35 deliberate
packages, and it answers a question the recipient's own Device answers for
free and more directly. Worth revisiting if the Digest ever needs a zone for
a place nobody is standing in.

**Keeping payments at the top** — rejected. Money is urgent, but a
truncated payment line returns tomorrow and the day after; a truncated
Reminder is gone for good, and a truncated flight makes the Digest useless
on the one night it matters most.

## Consequences

- A traveller who opens the app on the laptop while home for Christmas
  moves their whole Digest schedule to the laptop's zone until they next
  pick up the phone. Self-correcting, and the correction is one app open.
- A person with no Device that has ever reported a zone still receives
  nothing; that is unchanged, and `route.ts` still skips them.
- The order change contradicts the "documented order" docstring in
  `lib/digest.ts` and the content ordering implied by `CONTEXT.md`'s
  **Digest** entry. Both are updated with this ADR.
- The five fixed UTC cron hours are untouched. They exist to land a run
  inside each served zone's local window; collapsing a person to one zone
  reduces the number of cohorts, never the zones that must be covered.
