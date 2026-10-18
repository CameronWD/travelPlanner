# Actionable Findings — spec (2026-10-18)

Follow-up to Branch 3 (the AI Review, `2026-10-17-planning-model-and-review.md`).
Agreed in a grilling session on 2026-10-18. Glossary: CONTEXT.md **Finding**.

Feedback notes this branch closes (all Main, Reviews tab, Christmas in Europe 2026):

| Note | Ask | Covered by |
|---|---|---|
| `cmvedkt4q000008l0522usc5h` | An empty-day Finding should link to that day | A1 |
| `cmvedm6wc000208l05my6oxs0` | Suggest fixes for tight connections? | A3 |
| `cmvedofa3000708l0djyxxx77` | Resolved / unresolved sections, not one giant list | A5 |
| `cmvedvrfq001608l02lwutx0z` | Everything should have an action, not just be a list | A1–A4, A6 |

## A1. Every Open Finding has a visible way forward

Each Open Finding card shows, as buttons:

1. **Apply** — when it has a fix (as today, plus the new kinds in A2 and A3).
2. **A go-to button** — opens where the Finding is fixed. Its target is the
   *same* place the Summary's Flag opens for the same problem (`flagHref`,
   `lib/next-steps.ts`): the day, the Stop on the plan, the add-transport form
   for a missing connection, the Item's day. Today a Finding drops the Flag's
   `connection` and `stopId`, so e.g. a Missing-connection Finding lands on
   the bare plan — fix that. Label names the place: "Open the day",
   "Open the stop", "Add the transport", "Open in the plan".
3. **Dismiss** — always.

A whole-Trip Finding with no fix shows Dismiss only (no go-to). The title stops
being the only (hidden, hover-underline) link.

## A2. Checklist fixes

A new fix kind, proposed by the model (Standard and Deep Reviews alike):

- **Packing** — `{ list: PACKING, text }`, e.g. "Umbrella". The card offers two
  buttons instead of one Apply: **Need to pack** (adds the Packing entry) and
  **Need to buy** (adds it marked Need to buy, so it also shows on the Shopping
  list — CONTEXT.md **Shopping list**). The model never decides buy vs pack.
- **Pre-trip** — `{ list: PRE_TRIP, text }`, e.g. "Buy the 3-day Kansai pass".
  One **Add to pre-trip checklist** button. No due date.
- No standalone Shopping-list fixes, no Reminders.
- Allowed on **any** Finding target (an umbrella Finding may be about the Kyoto
  Stop). This is the first fix that does not change the Finding's own row, so
  `fixFitsTarget` gains an explicit exception for checklist fixes.
- At most one fix per Finding, still.

**Duplicate guard at Apply** (same text on that list, case-insensitive, trimmed):

- Need to pack / Add to pre-trip, entry exists → add nothing; Finding Applied;
  toast "Already on your packing list" / "…pre-trip checklist".
- Need to buy, Packing entry exists unmarked → mark that row Need to buy.
- Need to buy, entry exists and already marked → add nothing; Applied;
  "Already on your lists".

**Undo**: removes the entry Apply created, or unmarks the row Apply marked —
only if it has not been ticked or edited since (the existing "changed since"
refusal). When Apply added nothing, Undo just reopens the Finding.

**The Review reads both lists**: Packing and Pre-trip entries (text + ticked)
go into the Review input, so the model only suggests what is missing. The
prompt says so. Shopping list and Reminders stay out.

## A3. Tight-connection fix

For a restated `tight-<prev>-<next>` Flag (both the warning and the info level):

- The Finding targets the **later Item** (`ITEM`, its id, the date) rather than
  the day, so the existing `item.times` fix fits it and Apply/Undo are unchanged.
  The go-to button still opens the day. Matching across Reviews keeps using
  `flagId`, so the retarget does not break history.
- Fix: later Item's start = earlier Item's end + travel minutes +
  `TIGHT_CONNECTION_BUFFER_MIN` (15), keeping its duration. Computed by the
  app, not the model. E.g. "Move "Lunch at Bratwursthäusle" to 12:35–13:35".
- **No fix when the later Item is Booked** — go-to + Dismiss only.
- No knock-on reshuffle: a clash the move creates is left to the Flags.
- The Flag's message (and so the Finding's detail) names the mode it assumed:
  "~20 min walk" / "~15 min drive", not "~20 min to get there".

## A4. Fixed in the plan

A Finding restating a Flag (`origin = FLAG`) that is **Open** reads as
**Fixed in the plan** while its Flag no longer fires against the current plan,
and Open again if the Flag returns.

- **Derived at read time**, not stored, so it is right everywhere Findings are
  read: the Reviews tab, Home's "N open from the … review" line (count excludes
  it), and the MCP `get_review` / `list_reviews` output. Flags are computed as
  everyone sees them (Surprises masked), as the Review input already does.
- Only ever replaces Open: Applied and Dismissed always win.
- No Undo (the app changed nothing). Counts as dealt with.
- Model-origin Findings are never Fixed in the plan.

## A5. Reviews page layout

```
Review · Run by Cam, Sun 18 Oct, 14:05
  summary line

To deal with (7)
  Warnings (3)
  Notes (4)

▸ Dealt with (12)        ← collapsed by default
    Applied, Dismissed, Fixed in the plan, No longer found — newest first,
    each with its "Applied by Cam, 18 Oct" line and Undo where it has one
```

- Applying or Dismissing moves the card into Dealt with; the toast keeps Undo.
- Nothing Open → "All dealt with." above the collapsed section.
- History of older Reviews unchanged.

## A6. Claude (MCP)

No new tools. `get_review` describes the checklist fix (list, text, and for
Packing that the person picks pack vs buy) and the new Fixed-in-the-plan state.
Claude carries a checklist fix out with `add_checklist_item` /
`set_need_to_buy`, as it already does other fixes with the ordinary tools.

## A7. A running Review says you can leave (added 2026-10-18)

A Review already runs on the server after the page responds (`after()`), so
leaving the tab is safe; the page just never said so.

- Running line: "Reviewing… started by Cam at 14:05. This takes a few minutes
  and keeps going if you leave. Check back around 14:10." (start + 5 min, the
  Trip's zone).
- A run this tab watched that finishes DONE toasts "Review finished" with
  "7 to deal with" (today only a FAILED run toasts).
- Home's review line, while one runs: "Review running, back around 14:10".
- Push or email on finish: not in this branch.

## Not in this branch / follow-ups

- **Real routing** (Google Maps or similar) for walk/drive/transit times in the
  tight-connection fix and long-driving-day Flag. Reverses the "no routing SDK"
  stance in `docs/maps-overview.md` — needs its own ADR when picked up.
- More than one fix per Finding; standalone Shopping-list fixes.
- Existing Findings are not backfilled: the new fixes and the retargeted
  tight-connection Finding appear from the next Review. A1's go-to and A4 apply
  to existing Findings too (they are read-time), except that a Finding stored
  before this branch has no saved `connection`/`stopId` and keeps today's link.
