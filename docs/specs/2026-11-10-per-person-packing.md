# Per-person Packing lists

Resolves Feedback `cmw923ld8000808l6jb2xsstw` (Main · Checklists · Christmas in Europe 2026):
"Packing list should be per person? rather than being communal".

Agreed with Cam in a grill-with-docs session, 2026-11-10. Glossary: CONTEXT.md **Packing list**.

## Model

- A Packing item is **personal** (belongs to one Traveller's bag; only they pack it) or **Shared** (the Trip needs it once; either Traveller packs it).
- Ticking a Shared item records who packed it ("Adapter · packed by Cam"). Unticking returns it to unpacked Shared. Ticking your own personal item also records you as packer (harmless; only Shared rows display it).
- Per-Trip setting, **Open** (default) or **Private**, switchable by either Traveller in Trip Settings.
  - Open: every Traveller sees the others' personal lists and can add to them, never tick them.
  - Private: each Traveller sees only their own personal items plus Shared.

## Permissions

| Item | Owner / either Traveller | Other Traveller |
|---|---|---|
| Your personal item | edit, delete, tick, reorder, mark/unmark Need to buy, move to Shared or to another Traveller | see (Open only) |
| Another Traveller's personal item | — | add to their list (Open only); nothing else |
| Shared item | either: edit, delete, tick, reorder, mark/unmark Need to buy, move into any Traveller's list (into another's: Open only) | (same) |

Moving a Shared item into another Traveller's list is adding to their list, so it needs Open.

## Packing tab

Stacked sections, in order:
1. **Mine** — tickable; its own add row (adds to me).
2. **Shared** — tickable; its own add row (adds Shared); a ticked row shows "packed by <name>" when a packer is recorded.
3. **Each other Traveller's list** (Open only) — collapsed by default; rows show packed/unpacked state but have no tickbox, no edit/delete/reorder/buy controls; has its own "Add to <name>'s list" row.

Each row the viewer can manage has a move menu: *Move to Shared* / *Move to me* / *Move to <name>* (the latter only when Open), omitting the row's current list.

Header count ("x packed of y") counts Mine + Shared only.

(Decision made while planning: the add-row-per-section replaces the single quick-add with a destination picker discussed in the session — same capability, one fewer control.)

## Shopping list

- One Trip-wide list. A personal Need-to-buy entry shows its owner's avatar; Shared and standalone entries show none.
- Marking/unmarking Need to buy (to or from no buy state) follows the permission table.
- Ticking Bought / un-ticking Bought (NEEDED ↔ BOUGHT) is allowed on any entry the viewer can see.
- Private: another Traveller's personal Need-to-buy entries are hidden.

## Templates

- Save: the viewer's personal items + Shared items, each remembered as personal or shared. Other Travellers' items never.
- Apply: personal entries → the viewer's list (deduped by text, case-insensitive, against the viewer's list); shared entries → Shared (deduped against Shared).
- Legacy templates (plain list of texts) apply into the viewer's list.

## Claude connection

- `add_checklist_item` (Packing) takes optional `whose`: `"me"` (default), `"shared"`, or a Traveller's user id; another Traveller only when Open.
- Ticking another Traveller's item is refused; a Shared tick records the caller.
- `get_checklists` and checklist read-backs return `owner` (`{ id, name }` or null for Shared) and `packedBy` (name or null) on Packing items, and hide other Travellers' personal items when Private.

## Elsewhere

- **Leaving / removed from a Trip**: that Traveller's personal Packing items are deleted; any item they are recorded as packer of keeps its tick but loses the name.
- **Duplicate**: the duplicating Traveller's personal items and Shared items come across (unticked, no packer, ownership kept); other Travellers' personal items are dropped; setting is the default (Open).
- **Next steps "no packing list" nudge** (and the desktop Home equivalent): fires when the viewer's own list and Shared are both empty.
- **Digest**: a Traveller's Digest never includes another Traveller's personal Packing items.
- **Review checklist.add fixes** (decision made while planning): a Packing fix adds to **Shared**, and looks for an existing match only among the applying Traveller's own items and Shared — so it never tries to mark another Traveller's item.
- **Existing data**: every current Packing row becomes Shared (ownerId null); ticks kept with no packer.
- **Help guide** (Checklists section): describes Mine, Shared, Open/Private.

## Removed

AI packing suggestions: `components/trip/ai-packing-suggestions.tsx` (+ test), its use on the Checklists page, `aiDraftPackingList` (server/actions/ai.ts), `draftPackingList` (lib/ai.ts), `addChecklistItems` + `checklistItemsSchema` + `checklistItemsAddedSummary`. `AiSuggestButton` stays (used by `ai-activity-suggestions.tsx`).

## Unchanged

Pre-trip checklist (assignees stay), standalone Shopping items, Activity rules (Packing/Shopping ticks stay personal bookkeeping, adds are still Activity).

## Operator steps (Cam, after deploy)

1. Clear the Christmas in Europe 2026 Packing list on production (only on Cam's explicit say-so).
2. `npm run feedback:resolve -- cmw923ld8000808l6jb2xsstw --site main --note "…"`, then `npm run feedback:pull` and commit the inbox.
