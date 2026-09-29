# Trip URLs use a name slug, with every old address redirecting

## Context

Trip pages live under `/trips/[tripId]`, where the segment is the Trip's cuid —
`/trips/cmtw8sgpw0001osqh3i54rx1o/day/2026-12-26`. A Traveller asked for
readable links (`/trips/christmas-in-europe-2026/day/2026-12-26`). Those URLs
are already out in the world — bookmarks, Feedback notes, messages — so whatever
replaces them must keep every old address working.

Two shapes were weighed: a **pure name slug** (unique app-wide, needs a history
of old slugs to survive renames) and **name plus a short code**
(`christmas-in-europe-2026-k3x9`, where the code resolves the Trip and the name
is cosmetic — no history, no clashes, but less clean).

## Decision

A Trip's URL segment is a **pure name slug**, derived from its name: lowercased,
accents stripped, runs of anything else collapsed to single hyphens, capped at
~60 characters, `trip` when nothing usable remains. Slugs are unique across the
app; a clash takes the next free `-2`, `-3`… `new` is reserved (`/trips/new` is
a static route).

Renaming a Trip re-derives its slug. Every slug a Trip has had is kept, and no
other Trip may ever take one, so an old address can only ever point at its own
Trip. An old slug, or a bare cuid, **redirects** to the current slug.

The slug is resolved to the Trip's id **once, at the route boundary**; loaders,
guards and server actions keep working in ids. Internal links are built through
a single helper, never by hand. Share links and Calendar feeds keep their own
tokens and are unaffected. A visitor who is not on the Trip gets the same
not-found as before — a slug confirms nothing a cuid did not.

## Consequences

- Links read as the Trip's name; old links never break.
- One more table (slug history) and a uniqueness rule to maintain.
- The Trip's name appears in the URL, and so in browser history and anything a
  link is pasted into — acceptable for an invite-only app whose pages are
  members-only.
- Reversing this is costly once slug URLs have spread; the redirects would have
  to be kept either way.
