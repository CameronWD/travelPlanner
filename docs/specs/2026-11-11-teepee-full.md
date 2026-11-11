# Teepee is full — waiting list and people audit (2026-11-11)

Glossary: **Full**, **Spot**, **Waiting list** (CONTEXT.md, added this session).

## A. Close the Invite door (hard close, no switch)

- `lib/auth/sign-in-door.ts`: a pending Trip Invite no longer admits. The
  door admits on `isAllowedEmail` only; everyone else is refused and recorded
  as an Access request exactly as today. `admitByTripInvite` and the
  "admitted via a Trip Invite" admin push go.
- No grandfathering: Invites pending on deploy day get the same treatment.
- `inviteToTrip` is unchanged — it still creates the Invite for any email.
  Once that person is approved and signs in, the Invite accepts itself
  (ADR 0017).
- **Approving revives the person's expired, unaccepted Trip Invites**
  (`expiresAt` pushed to now + `INVITE_EXPIRY_MS`), so a slow approval
  doesn't strand them.
- Amend ADR 0057 (decision 2 reversed: Invites no longer admit; why; the
  "admission is transitive" consequence no longer holds).

## B. Waiting-list copy

| Where | New |
|---|---|
| Landing secondary button | Join the waiting list |
| Landing footer | Teepee is full right now |
| Panel, sign-in mode | Come on in / Teepee is full right now. If you already have a spot, sign in below. |
| Panel, request mode | Teepee is full / There's no room for new people right now. Sign in below to ask for a spot. There's nothing else to fill in. |
| Panel, denied mode | Teepee is full right now. / You don't have a spot yet. I've noted your request, and if a spot opens up for you I'll email you. Not everyone gets one. |
| Email sent confirmation | If you already have a spot, a sign-in link is on its way. If not, I've noted your request. |
| Share-link CTA body (non-route variant) | …It's full right now, but there's a waiting list. |
| Share-link CTA button | Join the waiting list |
| Invite panel, every pending Invite (no lookup) | If they don't have a spot yet, they'll wait on the waiting list until they're let in. |

The denied panel and sent copy stay non-oracular (ADR 0057): identical for
new, waiting, dismissed and revoked readers, and true for all of them (none
claims the reader *is* on the list — a dismissed reader is not). The invite
panel line is the same on every pending Invite, so an Owner can't probe
whether an address has a Spot. `/privacy` wording checked for
"testing" references.

## C. Admin: Access requests show the Invite context

- Each pending Access request whose email holds a pending (or expired,
  unaccepted) Trip Invite shows "Invited to *Trip* by *Owner*" (inviter =
  the Trip's Owner; Invite has no creator column and none is added).
- Invited requests sort first; strangers after.
- No enforcement that only invited people can be approved.

## D. Admin: People list (replaces the Allowed panel)

Rows = union of `ALLOWED_EMAILS`, `AllowedEmail` rows, and `User` rows.
Per row:

- **Status**: Has access / Admitted, never signed up / No access (account remains)
- **How they got in**: `ALLOWED_EMAILS` / Approved from an Access request /
  Invited to *Trip* by *Owner* (from their accepted Invite; legacy
  "admitted by Trip Invite" rows) / unknown
- **Joined** (User.createdAt, else AllowedEmail.createdAt)
- **Last seen** (latest of `AuthSession.updatedAt` and their Devices'
  `PushSubscription.lastSeenAt`; day-accurate; "—" if neither)
- **Trips**: owned / on
- **Revoke** on the first two statuses, as today (env rows "Not revocable
  here", self "That's you"). No bulk actions or filters.

## Cam's steps (after deploy)

- Optional: read-only count of pending Invites to emails with no Spot, so
  those people can be approved ahead of their first sign-in attempt.
