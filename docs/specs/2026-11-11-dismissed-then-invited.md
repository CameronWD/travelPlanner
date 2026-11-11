# Dismissed, then invited (2026-11-11)

Follow-up to `2026-11-11-teepee-full.md`. Glossary: **Access request**, **Waiting list**, **Spot**, **Full**.

## A. A dismissed request returns when someone invites that person later

- **Reopened by an Invite**: an Access request with `status: "dismissed"` whose
  email holds a Trip Invite that is unaccepted, on a Trip that is not deleted,
  and was **created after** the request's `resolvedAt`.
- Reopened requests are listed in `/admin` → Access requests alongside pending
  ones (invited-first sort applies, so they sit at the top). Each Invite line
  reads `Dismissed earlier. Now invited to {Trip} by {Owner}.` instead of
  `Invited to {Trip} by {Owner}`.
- **Approve** works on a reopened request (not refused as "already resolved"):
  writes the `AllowedEmail` row, sets `status: "pending"` and `resolvedAt: now`
  (the shape every approved row has), revives Invites, emails — as any approval.
- **Dismiss** works on a reopened request: keeps `status: "dismissed"`, sets
  `resolvedAt: now`, so it drops out until a newer Invite arrives.
- A dismissed request with no later Invite stays closed, exactly as today.
- The Admin queue count (`countAdminQueue`) includes reopened requests.
- No push notification.

## B. Privacy and terms

- `/privacy` intro: `I run Teepee, a trip planner for a small group of friends and family, and only people I have given a spot can use it.` (rest of the intro unchanged)
- `/privacy` Access requests paragraph, last sentences: `A dismissed request is closed for good. It does not come back to the Admin queue, even if you sign in again, unless someone later invites you to one of their trips.`
- `/terms`: unchanged.

## C. Docs

- CONTEXT.md **Access request** / **Waiting list**: a dismissed request returns to the Admin when the person is later invited to a Trip.
- ADR 0057 amendment: "Dismissal still means dismissed" now has one exception, a later Trip Invite; why (the Invite door closed, so this is the only way an Owner's request reaches the Admin); the privacy page says so.
