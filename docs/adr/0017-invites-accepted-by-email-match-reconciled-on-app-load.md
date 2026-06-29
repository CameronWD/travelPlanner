# Trip invites are accepted by email-match, reconciled on every authenticated app load

An **Invite** is just a pending `(tripId, email)` record; it carries no email or accept-link. It becomes Traveller membership whenever a person is signed in under a matching email. We reconcile pending invites in two places: the Auth.js `signIn` event (first sign-in) **and** on every render of the authenticated `(app)` layout. The layout hook is the important one — the `signIn` event alone never fires for a partner who is *already* signed in (JWT sessions last ~30 days), so an invited Traveller could sit unable to join for weeks. Reconciling on each app-load means they join the moment they next open the app, and an invite created mid-session is picked up on their next navigation.

## Considered options

- **Email an accept-link** (uses `Invite.token`) — rejected: there is no email infrastructure, and both Travellers are expected to sign in with the invited Google address anyway, so email-match needs no delivery step.
- **`signIn`-event-only** — rejected: this was the original behaviour and the bug we are fixing; it silently never accepts for already-authenticated users.

## Consequences

- The `Invite.token` column is currently unused (reserved for a possible future accept-by-link flow); a reader should not assume it is wired up.
- Acceptance runs as a cheap indexed lookup (`Invite.email`) on each authenticated app-load. It is idempotent and deliberately *not* memoised per-session, so mid-session invites are still caught.
- Acceptance is best-effort and must never block page render or sign-in: failures are logged, not thrown.
- **Direct deep-link race (known, self-healing).** Because the reconcile lives in the `(app)` layout, a brand-new invitee who navigates *straight* to a specific `/trips/{id}/...` URL (rather than landing on `/trips` first) may have the trip-level `requireTripAccess` check run before the layout's reconcile finishes, yielding a one-time 404. It clears on the next navigation/refresh, and the common path (post-login lands on `/trips`, which is under `(app)`) is unaffected. If this ever needs to be bulletproof, reconcile in `requireUser`/`requireTripAccess` instead of (or as well as) the layout.
- The `toAcceptOnly` branch relies on the `@@unique([tripId, email])` constraint: it assumes at most one pending invite per trip per email, so marking the "already-joined" leftovers accepted can never strand a membership.
