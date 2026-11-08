# The desktop Ideas box uses its space

Feedback `cmw5q6thi000207law8ytvp0e` (Xanthia, main, 2026-11-07): on desktop the
ideas panel is a big square, but it shows one idea and "+N" while the rest of
the square is empty. The "+" bubble should show only when there is no room.

Agreed with Cam on 2026-11-09.

## Today

On an open Stop in the desktop Plan editor, the Stay panel and the Ideas box sit
side by side, stretched to equal height (grid cells), once the card is at least
640px wide. Below that they stack. The Ideas box decides how many ideas show
from **one row's width**, and that row is shared with "N IDEAS" and
"+ Add an idea". The one-row rule exists because measuring the box's own
height fed back into itself: more chips grew the box, which allowed more chips
("Maximum update depth exceeded").

## Change

1. **A header line.** "N IDEAS" sits on the left and "+ Add an idea" on the
   right, on their own line at the top of the box, mirroring the Stay panel's
   coverage line and "+ Add a stay". Ideas wrap below at the box's full width.
   With no ideas, the box shows only "+ Add an idea", as today.
2. **Side by side (card ≥ 640px).** Ideas fill as many rows as fit in the
   height the Stay panel sets. The Ideas box never makes the row taller than
   the Stay panel would on its own. "+N" appears only when ideas run out of
   room.
3. **Stacked (card < 640px).** One full-width row of ideas, then "+N".
4. **Always at least one row of ideas,** even when the Stay panel is short.
5. **No feedback loop.** The box's height never depends on its own chips.
   Size containment takes it out of the row's height calculation, and a fixed
   floor of header plus one chip row keeps it usable. Measuring its height is
   then safe.
6. **Unchanged:** "+N" opens the rest in a pop-over. The same goes for
   Surprise chips, the hidden-from-shares icon, the chip exit animation and
   the mobile Plan editor.

## Resolution (to Xanthia, after deploy)

Written when the fix is live on main.
