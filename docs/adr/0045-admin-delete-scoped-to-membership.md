# 45. Admin delete is scoped to membership, not to the database

Date: 2026-09-15

## Status

Accepted

## Context

Deleting a Trip is owner-only: `deleteTrip` refuses anyone whose
`TripMember.role` is not `owner`. The operator of the app is not always the
owner of every Trip they are on — a Trip created by the other Traveller
cannot be deleted by them at all, which leaves abandoned Trips that only
someone else can clear up.

There is no admin concept anywhere in the codebase. `User` has no role
column; the only role in the model is `TripMember.role`, which is per-Trip.

Two guards stand between a user and deleting an arbitrary Trip:

1. `requireTripAccess` calls `notFound()` for non-members, deliberately — its
   comment records that this is so the app "never leak[s] the existence of
   trips the user can't access".
2. The owner-only check inside `deleteTrip`.

## Decision

Relax **only** the second guard. An account whose email appears in the
`ADMIN_EMAILS` environment variable may delete any Trip **it is already a
member of**, even when it is not the owner. `requireTripAccess` is untouched,
so an admin still cannot see, reach, or delete a Trip they are not on, and
Trips remain non-enumerable.

Recognition is by env var rather than an `isAdmin` column on `User`. The
variable is absent in development and test, so no test runs with admin
powers by accident.

The same check gates the Danger zone card on the Trip settings page, which
carries **Duplicate** as well as **Delete**; an admin gains both.

## Consequences

- The privacy property that motivated the `notFound()` in `requireTripAccess`
  survives intact. "Admin" here means "not blocked by ownership", not
  "sees everything".
- Granting or revoking admin is an env change, not a deploy of new code and
  not a migration.
- A privileged email is not committed to the repository.
- The power is invisible in the app: nothing announces it, and the in-app
  guide does not mention it, because the guide ships to every user.
- An admin delete leaves no audit trail: the Trip's `Activity` rows cascade
  away with the Trip itself, so nothing records who deleted it or when.
  Inherent to deleting the Trip, not specific to admins — but worth knowing
  before an operator goes looking for the evidence afterwards.
- If a genuine operator console is ever wanted — listing Trips the operator
  is not on — that is a different decision and will need its own ADR, since
  it must knowingly break the no-enumeration guarantee.
