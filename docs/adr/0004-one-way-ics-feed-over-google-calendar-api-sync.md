# Calendar export is a one-way ICS subscription feed, not two-way Google Calendar API sync

The app publishes a Trip's Timeline to external calendars (Google/Apple/Outlook) via a
private, read-only **ICS subscription feed** (one revocable URL per Trip), rather than
integrating the **Google Calendar API** for two-way sync. We chose one-way because the
two-way path carries costs disproportionate to the value for a two-person planner where
editing always happens *in the app*: it needs extra Google OAuth scopes (we currently use
Google for sign-in only) and the Google app-verification that sensitive scopes trigger,
per-Traveller token storage + refresh, a sync/conflict-resolution engine to reconcile
edits made in two places, and it cannot work offline — whereas an ICS feed is a stateless
GET, needs no new scopes, and composes with the existing offline-read design. The
accepted trade-off is **refresh latency**: external apps poll the feed on their own
schedule (hours, not instant) and changes made in Google never flow back. This is not hard
to reverse — adding API sync later is additive and doesn't invalidate the feed — but it's
recorded because a future reader, seeing we already authenticate with Google, will
otherwise wonder why we didn't just use the Calendar API.
