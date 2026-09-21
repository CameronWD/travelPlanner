# 0053 — A Device is never reassigned; the browser mints a new one instead

## Status
Accepted (2026-09-21)

## Context

`CD-02` found that `subscribeToPush` (`server/actions/push.ts`) writes
`userId: user.id` unconditionally on **both** arms of its upsert. The `create`
arm is unremarkable. The `update` arm means that a row matched by `endpoint`
has its owner re-pointed at whoever is signed in and calling — so an
authenticated caller who obtains another person's push `endpoint` can take
that Device row for themselves.

The `endpoint` is a capability secret: it travels app → push service →
database and is not guessable. But it is not a *credential* either, and the
action is a server action, not a browser event — it accepts whatever
`endpoint` and keys an authenticated caller passes it. The code's own comment
(corrected in the 2026-09-20 review) already conceded this: nothing in the
handler enforces "this physical device".

The harm is **device theft and silencing**, not content theft. Pushes stay
encrypted to the victim's keys, so the attacker reads nothing; but the Device
stops notifying the person it belongs to, and the Digest — the app's only
push surface — goes quiet for them with no error anywhere.

The reassign was deliberate, and defended a real case. On a **shared browser
profile**, `registration.pushManager.subscribe()` returns the *existing*
subscription rather than minting a new one, so when a second person signs in
to TEEPEE on a family iPad and presses Enable, the browser hands the server
the first person's `endpoint`. Re-pointing the row was how that case was made
to work.

`CD-02` framed this as a two-way choice: close the hole and break the shared
machine (option a), or accept the exposure and document it (option b). The
stated reason no third option existed was that the legitimate call and the
hijack are byte-identical, so no check can tell them apart.

That reasoning is correct and answers the wrong question. The two calls do not
need to be told apart. They only look alike because both are trying to *reuse*
an endpoint that already belongs to someone — and the legitimate one does not
have to. A browser that unsubscribes and re-subscribes gets a **new endpoint**,
and needs no reassignment at all.

## Decision

**A `PushSubscription` row is never reassigned to a different user.**

1. `subscribeToPush`'s `update` arm stops writing `userId`. If the row matched
   by `endpoint` belongs to a different user, the action refuses and returns a
   distinct **conflict** result — not a generic error, because the client has
   to be able to act on precisely this case.
2. On that conflict the client (`components/account/push-subscribe.ts`)
   calls `subscription.unsubscribe()`, re-subscribes through
   `pushManager.subscribe()` to obtain a fresh `endpoint`, and persists that.
   It retries **once**; a second conflict is a real error and surfaces as one.
3. The displaced person's now-dead row is left to the existing prune path.
   `lib/push.ts:114` already treats a 404/410 from the push service as
   `gone`, which is exactly what that endpoint now returns.

The admin bypass (`ADMIN_EMAILS`, ADR 0045) does **not** apply here. This is
not a management action on a Trip; there is no operator reason to take over a
Device.

## Consequences

- **The hijack is closed completely, not mitigated.** A stolen `endpoint` can
  no longer be re-pointed, and the attacker cannot mint a subscription for a
  browser they do not control. There is no residual exposure to document.
- **The shared machine keeps working, and without a permission re-prompt.**
  `Notification.requestPermission()` has already resolved `granted` for that
  origin, and unsubscribe/re-subscribe does not ask again — so the second
  person presses Enable once and it works, which is better than option (a)
  would have managed.
- **The displaced Device lingers in the first person's Account list until a
  push 410s it.** This is a real gap and is accepted: it is strictly better
  than the behaviour it replaces, where the row was reassigned and simply
  vanished from their list with no notice at all. It is also the same
  eventual-consistency the prune path already provides everywhere else.
  ADR 0048's "never silently dropped" concerns the app dropping a Device on
  its own; here the browser genuinely revoked the subscription.
- **`reconcileDevice` is now the rule rather than the exception.** The
  asymmetry `server/actions/devices.ts` carried a comment to explain — one
  action refusing to touch rows it does not own while its neighbour
  reassigned freely — is gone. Both now refuse.
- **A conflict is a state the client must handle, so the client is part of
  this fix.** A server-only change would close the hole and leave the shared
  machine broken, which is option (a) by another name. Landing one without the
  other is not a partial delivery of this decision; it is a different decision.
