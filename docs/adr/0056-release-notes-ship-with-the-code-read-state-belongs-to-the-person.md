# 0056 — Release notes ship with the code; read state belongs to the person

## Status
Accepted (2026-09-21)

## Context

TEEPEE had no way to tell a **Traveller** what had changed. `ONBOARDING.md`
carries a changelog, but it is written for engineers ("Adds one column:
`Transport.anchorStopId`"), had not been updated since 2026-08-20, and is not
in the app at all. Meanwhile the **Feedback panel** gives a Traveller a way to
say something *to* the operator, with no matching channel back: Xanthia's
request that attachments open in a new tab was fixed the day after she wrote
it, and nothing in the product would ever have told her so.

Three sources for the content were considered. **Generated from git history**
was rejected outright: commit subjects are written for engineers, and the
audience here is two people who want to read "attachments now open in a new
tab". **An Admin-authored database table** would let news publish without a
deploy, but it means building an authoring surface for an audience of two and
putting the content outside version control, where it is reviewed by nobody.
**Committed entries** won: every Release note is born in the same commit as
the change it describes, gets reviewed in the same diff, and costs no new UI.

The cost of that choice is that a Release note becomes true on **deploy**, not
on commit — several written across a week all land together. That is the right
granularity anyway: a Traveller experiences the release, not the commits.

Read state was the harder question. `localStorage` is free and works offline,
but it is per-*browser*: with two Travellers each running a phone and a laptop,
every release would be dismissed four times. The glossary already draws this
line hard — a **Device** is one browser, and things true of a *person* live on
**Account**, precisely because rendering an account-wide fact per-device is
what let a broken Device hide (ADR 0048). "Have I read this release" is a fact
about the person.

## Decision

1. **Release notes are a typed constant in the bundle** (`lib/release-notes.ts`),
   newest first, each one line. Not markdown loaded at runtime, not a database
   table. Being in the bundle means **What's new** works offline, which a
   fetched document would not.

2. **Each note carries a full ISO timestamp, not a bare date.** Read state is a
   comparison against it, so two releases on the same day must be
   distinguishable — otherwise dismissing the morning's release would silently
   swallow the afternoon's, and a Traveller would never see news that was
   published after they last looked but on a day they had already dismissed.

3. **Read state is one nullable column, `User.whatsNewSeenAt`.** It follows the
   Traveller to every device they sign in on.

4. **`NULL` means *caught up*, not *has seen nothing*** — it falls back to
   `User.createdAt`. This is the decision most likely to look like a bug to a
   future reader, and it is deliberate. Without it, shipping this feature would
   have greeted both existing Travellers with the entire backlog at once, and
   every Traveller who ever joins would meet the app's whole history on their
   first sign-in — when none of it is new to them, it is simply how the app
   works. The column is therefore **not backfilled**: `NULL` carries meaning
   that `now()` would destroy for every account created after the migration.

5. **Dismissing marks the whole release read**, not only the notes the card had
   room to show. News a Traveller chose not to read must not come back to ask
   again; the card's three-note cap is a limit on interruption, not a queue.

6. **The volume control is editorial, not mechanical.** Most of what TEEPEE
   ships earns no Release note at all — only a change a Traveller would notice
   does. The cap on the card is a backstop for a large release, not the
   mechanism that keeps the news short.

7. **Offline dismissal is best-effort.** The card hides immediately and the
   write may fail; it reappears on the next online load. Unlike a **Feedback
   note**, whose offline queue exists because losing one loses real work
   (ADR 0041), re-showing a card costs a second tap.

8. **The full list at `/whats-new` is read-only.** Visiting it marks nothing
   read, so no server component performs a side effect on render.

## Consequences

- Publishing news requires a deploy. For a two-Traveller app deployed from this
  repo that is not a constraint worth engineering around, but it does mean
  there is no way to correct a Release note in production without shipping.
- A Release note is written by whoever writes the change — so the discipline
  ("would a Traveller notice this?") lives with the author, in review, rather
  than with a separate editorial pass. If that discipline slips, **What's new**
  fills with noise and the cap will hide the parts that mattered.
- `whatsNewSeenAt` is the first column on `User` that exists purely for a UI
  affordance. If more accumulate, they should move to a `UserPreference` row
  rather than widening `User` indefinitely.
- The Feedback loop now closes visibly: a Release note that resolves a
  **Feedback note** names the Traveller who raised it. That is a convention,
  not a mechanism — there is no link between the two records, and deliberately
  so, since a Feedback note is private to its author (ADR 0046) and a Release
  note is read by everyone.
