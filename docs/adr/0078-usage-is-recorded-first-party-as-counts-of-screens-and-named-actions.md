# 0078. Usage is recorded first-party, as screens and a fixed list of named actions

Date: 2026-11-20

## Status

Accepted.

## Context

TEEPEE records every change to a Trip (Activity) but nothing about reading one, so after a
trip there is no way to say which screens earned their place. Vercel Web Analytics is
mounted, but it is anonymous and aggregate: it cannot say which Traveller opened what on
which Trip, on which day, or whether a saved copy answered. The trip leaves on 4 Dec 2026
and nothing deploys for five weeks, so whatever records Usage has to be right the first
time and switchable off without a deploy.

## Decision

- Usage is a table in TEEPEE's own database, written through TEEPEE's own endpoint. No
  third-party tracker, no cookie, no identifier beyond the signed-in account.
- A record is either a screen from a fixed list or an action from a fixed list. The browser
  sends names, never URLs; the server drops anything not on the lists. Free text cannot
  enter the table because no column takes it.
- It is recorded from the browser after paint, in batches, never while a server page is
  being built.
- For a Traveller with a Surprise hidden from them on a Trip, the Day view's day offset is
  withheld, because which days someone opens is itself a signal.
- An Admin switch stored in the database turns it off without a deploy. Records are deleted
  after 180 days.
- Admins read counts, never single records.

## Alternatives

- **A product analytics service.** Rejected: a second party holds per-person behaviour for
  a two-person app, it adds a script and a network dependency on every page, and the
  questions here are answerable with one table.
- **Recording on the server while a page is built.** Rejected: it adds a write to every
  render and cannot see saved-copy opens, gestures or time to appear.
- **Free-form event names and properties.** Rejected: the first careless call would put a
  Stop's name in the table. A closed list is what keeps the promise in `/privacy` true.

## Consequences

- Adding something to record is a code change to two lists, on purpose.
- Usage cannot answer how long anyone spent anywhere.
- A device that is offline for a long stretch loses its oldest records past the cap.
