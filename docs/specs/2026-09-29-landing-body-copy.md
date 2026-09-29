# Landing body copy rework (2026-09-29)

The line under the Landing hero ("Plan it with your people.") is replaced.

## Copy, verbatim

> Stops, trains, beds and budget all in one place. For the trip you're dreaming up, the one you're on, and everywhere you've been.

(No comma after "budget".)

## Where

- Desktop tree (`data-slot="landing-desktop"`): replaces the three-sentence line
  ("Stops, sleeps, trains and money in one place — shared with whoever's coming.
  Fork the plan when you disagree. Count sleeps, not days.").
- Phone tree (`data-slot="landing-phone"`): replaces the one-sentence line
  ("Stops, sleeps, trains and money in one place — shared with whoever's coming.").
  Both trees now carry the identical line.
- Styling and layout unchanged.

## Why

- "sleeps" was used twice and read as cutesy; "Fork the plan" is in-app jargon
  a signed-out visitor can't parse; "Count sleeps, not days" was cryptic.
- The hero already carries "with your people", so the body drops the sharing
  clause and instead covers the whole life of a Trip — Sketching/Planning,
  Travelling, and Past trips (Journal, Travel map).

## Out of scope

Hero, CTAs, sign-in panel copy, older specs/plans under `docs/` (historical record).
No CONTEXT.md or ADR change.
