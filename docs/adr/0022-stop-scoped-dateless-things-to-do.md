# Stop-scoped, optionally-dateless Items ("things to do")

Extends ADR 0019 (scheduling is copy-in placement).

## Context

Travellers want to add planned things-to-do — with booking reference and cost — directly
under a location while planning, *before* that location has dates. Today an Item is either
a trip-wide **Wishlist** idea (no Stop, no date, shared across Plans) or a **scheduled**
placement on a Plan's Timeline (has a date; its Stop is derived from the date band). There
is no way to attach a planned thing to a **rough** (dateless) Stop, and the plan editor
has no Item-creation entry at all.

## Decision

1. **An Item may be plan-owned and attached to a Stop with a null date** — a "thing to do"
   for that Stop, not yet slotted to a day. It carries the full Item fields (title,
   Category, booking reference, **cost**, notes, link) and shows under its Stop in the plan
   editor, working even while the Stop is **rough**.
2. **Giving a thing-to-do a date slots it onto the Timeline** (and thus the Calendar);
   until then it appears in no dated view.
3. **The "shared Wishlist idea vs plan-owned Item" discriminator moves off `date`.** It was
   effectively `date != null`; it becomes **plan-attached = non-null `stopId` OR non-null
   `date`**. A Wishlist idea has both null. Every place that used `date: { not: null }` to
   mean "plan placement" — `createFork` copy, `promoteFork` delete/retag, the
   `getComparison` / promotion-preview item filters — must switch to the new discriminator
   so dateless things-to-do are copied into Forks, replaced on Promote, scoped by `forkId`,
   and never mistaken for trip-wide ideas.
4. **The UI label is "Add a thing to do"**, never "Activity" (reserved for the change-log
   **Activity** feed; "Activity/Experience" remains only a Category value).

## Consequences

- Additive: no schema change (Item already has nullable `stopId` and `date`); the work is
  in read models, the plan-editor UI, and the discriminator audit in point 3.
- Dated views (Calendar / Today / Summary / ICS) keep filtering by date, so undated
  things-to-do stay out of them until slotted.
- The plan editor gains a per-Stop things-to-do list and an "Add a thing to do" form with
  inline cost (mirroring the Transport/Accommodation inline-cost decision this round).
- Cost on a thing-to-do rolls into the Budget like any Item cost.
- Risk: the discriminator change in point 3 is the sharp edge — miss a call site and a
  thing-to-do either leaks across Plans or is dropped on Promote. It must be audited
  exhaustively and covered by tests.
