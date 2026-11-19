# Polish: decisions for Cam

Kept while the three polish branches are built. Each line is something that was a choice
and was built the recommended way so the work did not stop. Say which to change.

## Wave 1 (`chore/polish-pass`)

| Id | Built as | The other way |
|---|---|---|
| B1 | Summary and Print both show cost, labelled. | Paid on both, cost as fallback. |
| B2 | A Stop row on Summary shows cost and a nightly figure from it; paid is a smaller second figure. | Show paid first, nightly figure from paid. |
| B5 | A full Globe's share dialog reads "Your Globe is shared with the people below." | Other wording. |
| B6 | The Globe list's group is "No country". | "Nowhere", "Unplaced", other. |
| B7 | New Review summaries end on a word with an ellipsis. Old ones cut at the cap get an ellipsis when shown; stored text is not rewritten. | Rewrite old ones, or leave them. |
| B8 | Daylight length sits below the sun arc. | Keep it inside the arc with a knocked-out background. |
| B9 | What's new floats above the tab bar on the Trips list. Trip home keeps it in the page. | Reserve its space in the skeleton, or accept the shift. |
| M1, M4 | A rate under 0.01 reads the other way round ("1 home = n foreign"); long figures step down a size. | Always one direction, with a smaller figure. |
| P2 | Phone Stop sheet: dates on their own line, nights stepper on the row below. | Smaller stepper beside the dates. |
| B9 | The floating What's new card may sit over the last Trips card until dismissed. | Add space under the list while it shows. |
| L1 | Shared trip on a phone: Stop name on its own line, days and dates under it. | Keep one line, truncate the dates instead. |

## Open questions that are not builds

- Account's Digest service status is shown to every Traveller, not only Admins. Hide it from non-Admins?
- Schedule Item's "Pick another date" link is coral and reads as an error at a glance. Change its colour?
- Two overlapping things to do show "only 0 min", the same as back-to-back ones. Say "overlaps" instead?
- `flagHardEndDate` keeps a stored date in its wording on purpose ("historic wording"). Wave 1 renders it as a day like the rest.
- Inside a Review, a finding that repeats a warning still shows the stored date form (2026-12-09). Wave 1 left Reviews alone, as X4 did. Show days there too?
