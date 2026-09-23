# 0059 — Errors report to our own database, not to a third-party service

## Status
Accepted (2026-09-23)

## Context

`ARCH-OBS-1` and `ARCH-OBS-2` (`docs/architecture-sitrep-2026-09-22.md`)
found that TEEPEE had **no error-reporting sink at all**. Every server-side
failure terminated in a bare `console.*` that nobody was watching, and the
app's three error boundaries are client components, so their `console.error`
landed in the *Traveller's own* devtools — a place the operator can never
look. The operator **was** the monitoring system: things got found because
the operator was also the only user. That stops working the moment there are
more Travellers than one household, and it stops working silently.

## Decision

1. **An `ErrorReport` table in TEEPEE's own Postgres is the sink.**
   `reportError` (`lib/error-sink.ts`) writes a deduped row and, for
   server-sourced reports, pushes to the Admin's Devices the first time a
   given failure is seen. `/admin` renders the table.

   **Rejected: Sentry** (or any hosted equivalent). Three reasons, in order
   of weight:
   - **No third party in the privacy policy.** `/privacy` has to name every
     processor that receives Traveller data, and an error payload carries
     route paths, user ids, and whatever a message happens to interpolate.
     Adding a processor is a promise to the people using TEEPEE, not a
     dependency decision. The list was already longer than expected
     (`ARCH-OBS-1`'s sibling work turned up GitHub, Open-Meteo, Frankfurter
     and Anthropic); adding a fifth to see stack traces was not worth it.
   - **No extra account, key or bill.** The free tier is a rate limit with a
     renewal date attached, and one more secret in Vercel is one more thing
     that can be absent on a fresh deployment.
   - **Consistent with the pattern already here.** Access request
     notification already reuses `web-push` and the account-level Devices
     (ADRs 0047, 0048, 0050); there is no mail dependency of any kind, and
     `ADMIN_EMAILS` already exists to hang an operator surface on. The sink
     reuses all of it, so there is one notification channel to trust rather
     than two.

2. **Dedup is on a signature, not on the error.** `name + message + first
   stack frame`, hashed, with `count`, `firstSeen` and `lastSeen` on the
   row. Never the full stack: line numbers and async frames vary between
   occurrences of the same bug, so a full-stack signature mints a row per
   request and the table becomes the noise it exists to replace. A loop that
   throws ten thousand times is one row and one push.

3. **`console.*` stays, everywhere, alongside the database write** — see the
   blind spot below. The sink is a supplement to the console, not a
   replacement for it.

4. **`/api/client-error` is deliberately reachable without a session.** An
   error boundary can fire on the sign-in page itself, before there is
   anything to authenticate; requiring a session would drop exactly the
   failures happening where a Traveller has the least other recourse. The
   route always returns 204 — including on malformed input or an unreachable
   database — because a reporting endpoint that can itself fail is a second
   error in front of a Traveller whose recovery screen is already up. When a
   session does exist its user id is still captured.

5. **Client-sourced reports record but never push.** `reportError` refuses to
   notify for `source: "client"`. The endpoint is unauthenticated and
   `message` is the entire entropy of the dedup signature (`name` is always
   `"Error"` and the first frame is effectively constant per call site), so
   pushing on a new signature would have been an **unauthenticated
   push-to-the-operator's-phone primitive**: any caller could mint a fresh
   signature per request and put arbitrary text on the Admin's lock screen.
   The realistic non-malicious trigger is identical — a Traveller on a flaky
   connection retrying a fetch whose URL carries a cache-busting timestamp
   varies `message` on every attempt. `message` and `route` are additionally
   length-capped in the route's schema as defence in depth, bounding what
   reaches the database and the console regardless.

   The worst outcome being defended against is not cost or storage: it is the
   operator learning to ignore the notification channel. That channel also
   carries Access request approvals and the Digest, so muting it would
   silently defeat `ARCH-OBS-1`, `ARCH-OBS-2` and the door at once.

6. **The sink's own delivery path must never feed the sink.** `notifyAdmins`
   calls `sendPush(..., { report: false })`. Without that, a failing push
   reports an error, which notifies the Admins, which pushes, which fails —
   and the recursion does not terminate in the realistic case, because push
   rejection messages carry per-host and per-IP detail (FCM round-robins its
   DNS), so each round mints a *new* signature rather than deduping into the
   existing row. The default remains `report: true`, so ordinary Digest
   dispatch still reports its failures; only the sink's own notification hop
   opts out. This is pinned by a test that runs the real `sendPush` chain
   with an IP-bearing `ETIMEDOUT` message — the exact shape that defeats
   dedup — and asserts `reportError` is never called.

## Consequences

- **Accepted blind spot: a database-down failure cannot write a database
  row.** That whole class of error reaches only `console.error` and Vercel's
  runtime logs, and nothing pushes. It is accepted rather than solved: any
  fix means a second, non-Postgres sink, which is the third-party dependency
  decision 1 declined. The `console.error` in `reportError` fires **before**
  anything touches the database precisely so it survives the outage the row
  does not. The operator's signal for this class is "the app is down", which
  is a signal they get anyway.
- Error reports are Traveller data living in TEEPEE's own database, so they
  are inside every guarantee the rest of the data is inside — the daily
  `pg_dump`, the retention story, `/privacy`'s inventory — and inside every
  exposure too. `/privacy` names them explicitly, including that they are
  also logged to Vercel and pushed to Admin devices.
- `/admin` needs a bulk clear, not only per-row, because the surface fails
  exactly when it is most needed — a bad day is when there are most rows.
- The signature design means a real push outage in the Digest path mints one
  row and one notification **per failing subscription** rather than one per
  bug, because the rejection message varies per endpoint. It terminates and
  is bounded by deployment size, so it is not the loop decision 6 closes —
  but it is row noise the first time FCM has a bad day, and it partially
  undercuts the "one row per bug" intent. The candidate fix, deliberately not
  taken without production samples, is to normalise push error messages
  (strip hosts and IPs) before hashing.
- Client message normalisation generally — interpolated ids and URLs minting
  their own signatures — remains open, deliberately. A normaliser written
  without real production samples risks merging genuinely distinct failures,
  which is the one thing a dedup key must not do.
