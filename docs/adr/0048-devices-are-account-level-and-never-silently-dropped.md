# 0048 — Devices are account-level and never silently dropped

## Status
Accepted (2026-09-17)

## Context

On 2026-09-17 a Traveller pressed "Send me a test" in Trip Settings. The
panel reported "Sent a test to 1 device." Every layer that could have
reported failure reported success instead: `dispatchDigest` counted
`sent: 1`, and `web-push` received an HTTP `201` back from
`web.push.apple.com`, with an `apns-id` header proving Apple's own service
had accepted the message. Nothing arrived on the phone.

The iPhone had no entry at all under iOS Settings → Notifications. The
installed web app had lost notification permission — silently, the way iOS
revokes it — while the push token it had registered with stayed valid at
Apple's end. Apple has no way to know the OS-level permission is gone; it
only knows the endpoint exists, so it accepts the push and reports success.
This is exactly the class of failure ADR 0047 named but did not close: "a
Device can be dead — permission revoked, the app deleted — while the push
service it is registered with still accepts messages for it and reports
success. Nothing in the delivery path can tell the difference; only the
Device can." The 2026-09-17 test is that failure occurring for real, not a
hypothetical.

Recovery from inside the app was impossible. `EnableNotifications` — the
only control that can re-request permission — is rendered by
`components/trip/settings/reminders-panel.tsx` solely inside the
`device ? … : …` conditional's `false` branch, and that is its only render
site anywhere in the app. The moment one `PushSubscription` row exists for a
Traveller, the panel treats that Traveller as covered and stops offering the
button — on every Trip, on every device, forever, regardless of whether the
one row on file still works. The only fix available on the day was a
database write: delete the stored `PushSubscription` row and re-install the
PWA. A Traveller cannot delete their own subscription row; only a developer
with database access can. That is not a recovery path, it is an outage.

## Decision

### Decision 1 — a Device is account-level, and `Account` is where it lives

A Device belongs to the person, not to the Trip they happened to be looking
at when it was diagnosed. Rendering an account-wide fact — do I currently
have a working push endpoint at all — inside one Trip's Settings is what
made this failure unreadable: the panel could only ever say "you have a
device on file," never "your only device is the one that just proved dead
everywhere." `CONTEXT.md`'s **Account** entry now owns the Device list, and
the **Device** entry is explicit that Devices belong to the Traveller across
every Trip, not to any one Trip's Settings.

### Decision 2 — the account layer is a capability, not a setting

`Account` gathers the Devices and shows, per Trip, whether this Traveller's
Digest is switched on there — it does not add a switch of its own above
those per-Trip ones. There is no global mute. A third mute layer — on top of
the per-Trip switch and the browser-level permission — creates exactly the
state this ADR exists to prevent: the per-Trip switch reads ON, the account
layer reads ON, and nothing arrives, because the actual failure is invisible
to both. A global switch would have given the 2026-09-17 Traveller a third
green light to trust instead of a second one.

### Decision 3 — only the Device can report its own health, so it does, on every visit

Success from a push service proves nothing, per Decision 1's context: Apple
accepted a push for a dead subscription and said `201`. The only party that
can know whether permission still holds and what timezone it is actually in
is the Device itself, so it reports both on every visit rather than once at
registration. A Device that stops reporting — because it was not opened, not
because it failed — is flagged `unseen since <date>` and is never deleted by
the system. Deleting it on a timeout would say "this device is gone" about a
laptop that is merely closed, which is the same unearned confidence this ADR
is rejecting in the other direction.

## Considered Options

- **A global on/off switch on the Account page.** Rejected — see Decision 2.
  It reads as a convenience ("turn off every Digest at once") but actually
  adds a third layer that can independently read ON while delivery is dead,
  which is the exact silent-success shape this ADR responds to.

- **Tombstoning removed endpoints, so self-heal cannot resurrect them.**
  Considered because a Device that is genuinely retired (a sold phone, an
  uninstalled app) will otherwise silently re-register itself the next time
  something touches that endpoint. Rejected: it needs a new table to hold
  the tombstones plus a rule for how a Traveller lifts one — otherwise a
  Device that genuinely still wants its Digest and gets removed by mistake
  can never come back. That is more structure than this failure has earned;
  nothing about 2026-09-17 was caused by an endpoint being resurrected.

- **Auto-expiring Devices that stop reporting after some interval.**
  Rejected — see Decision 3. A Device that has not reported in three weeks
  is indistinguishable from a laptop nobody has opened for three weeks.
  Expiring it converts a true "haven't seen you" into a false "you're gone,"
  which is worse than the status quo it would replace.

## Consequences

- `Remove` on a Device other than the current one deletes the
  `PushSubscription` row but cannot revoke the browser's own notification
  permission — that lives in the OS/browser, not in TEEPEE's database. A
  removed Device that still has permission will simply re-register itself
  the next time it visits and re-subscribes. The copy next to `Remove` says
  so, rather than implying the removal is final.

- `PushTimezoneSync` moves out of the Trip layout
  (`app/(app)/trips/[tripId]/layout.tsx`) and up to the root authenticated
  layout, becoming the general Device reconcile rather than a per-Trip
  side effect. A Device's health and timezone are account facts under
  Decision 1; they should be refreshed by being logged in, not by being on
  a Trip screen.

- `unsubscribeFromPush` (`server/actions/push.ts`) finally gets a caller.
  It has existed since the ADR 0047 build with nothing invoking it anywhere
  in the app; the account-level Device list is what a `Remove` button calls
  it from.

- The service worker (`public/sw.js`) still has no `pushsubscriptionchange`
  handler. That is the other half of follow-up item 1 and remains
  unaddressed: an endpoint that rotates while the app is closed is still
  only healed the next time the Device visits and re-reports, not the
  moment it rotates.
