# Polish, wave 2: rough edges

Branch `chore/polish-wave-2`, cut from `main` after wave 1 is merged and pushed. Second of
three branches working through `docs/audits/2026-11-20-polish-audit.md`; ids are the
audit's. Cam marked every item "fix" on 20 Nov 2026 and added three notes, folded in below.
Choices are built the recommended way and logged in
`docs/audits/2026-11-20-polish-decisions.md` for him to confirm at the end.

Rules for every item: holds from 320 to 2560 px wide, in light and dark theme, with existing
tokens and components. No new dependency, no schema change. Where an item says "one rule",
the rule is applied everywhere the pattern appears, not only where the audit saw it.

## 1. Shell

- **S1.** The phone top bar is 90% opaque and keeps its blur, so page content no longer
  reads through it.
- **S2.** On phone trip pages share and bell sit on the title's row; the empty row above the
  title is gone and the title starts directly under the top bar's spacing.
- **S3.** Every page inside a trip uses the trip header (title, share, bell). Print keeps its
  plain title. Reviews, Settings and Summary move to the trip header.
- **S4.** Desktop side rail: the trip switcher shows the trip's name using the rail's width
  (two lines at most before truncating); the rail scrolls on its own when the window is too
  short for its links; the switcher's skeleton has the switcher's height, so nothing jumps.
- **S9.** No build. Measure on the deployed site on a throttled connection and report; if a
  tap shows nothing for more than 300 ms, add it to the decisions list with the numbers.

## 2. Trip home

- **H1.** A zero gap in a warning reads "no gap" (not "only 0 min"). A status tag is shown as
  a pill beside the sentence, not as capitals inside it. Stored text is unchanged; this is
  display only, through the same function that formats warning dates.
- **H2.** One rule for list rows that pair a name with an amount or date (Upcoming payments,
  Still to book, Next payment, Sort these out, Next steps): the name may wrap to two lines
  and then truncates; the amount or date keeps its width and never wraps.
- **H3.** The hero card's stat chips have clear space from the big number at every width,
  and "days to go" stays on one line.
- **H4.** Wide desktop cards on trip home and the Trip cost card size to their content; no
  card pins content top and bottom around an empty middle.
- **H5.** "Add Reminder" is aligned with the card's content edge and uses the normal link
  colour, on trip home and Checklists.
- **H8.** Phone money tiles keep the compact format; an amount under 1,000 shows two
  decimals.

## 3. Trips

- **T1.** On the Trips list between 768 and 1440 px the Planned/Been toggle, the map's
  filter pills and the Up next chip are never clipped: they wrap or scroll inside their own
  row.

## 4. Plan

- **P3.** Phone Plan cards and Transport pills give their width to the destination; the
  date is what shortens. Pills in one row share a width rule.
- **P4.** A stay's address and a Stop's note wrap to two lines on desktop, then truncate with
  the full text in a `title`.
- **P5.** "Add a title" and placeholder day titles meet 4.5:1 contrast on their band, in
  both themes.

## 5. Day

- **D1.** Phone Day plan: the time and icon columns are as narrow as their content allows,
  so a title has at least 60% of the card's width.
- **D2.** A group label in the Day plan has more space above it than below it.
- **D3, with Cam's note.** The Day strip fills its row with no blank band to its right and
  never shows half a chip beside an arrow. There is one pair of previous/next arrows on the
  page: the pair on the date stays, the strip's own arrows go (the strip scrolls and its
  chips are tappable). The strip no longer overlaps the side rail between 780 and 1600 px.
- **D4.** The placeholder a loading day shows is shaped like the weather card and the Day
  plan card it stands in for, at their sizes.
- **D5.** A stay looks the same in the Check-in card and the Tonight card on one screen:
  same truncation rule, booking status on its own line when it does not fit.
- **D6.** On a phone "Add to this day" opens a sheet, like the app's other phone menus.

## 6. Summary

- **U1.** In Trip health "This is fine" sits inside its warning's card. Repeated identical
  "Nothing scheduled" notes collapse into one line with a count that expands. Make it fit
  has clear space from the section label.
- **U2.** Phone Summary and Print cards keep the right edge of their hard shadow inside the
  screen; a stat tile's amount never truncates at 320 px.
- **U3.** Desktop Summary rows sit in a readable measure (multi-column or a capped width),
  not one short line across the full width.

## 7. Money, Calendar, Checklists, Files, Reviews

- **M2.** Every budget category has its own colour in the bar and the list, from the
  existing hue tokens; no two categories on one trip share one.
- **C1.** Phone Agenda: wrapped Check-in and Check-out titles use normal line spacing; the
  duplicated heading and the gap before the first day go.
- **K1.** Checklists' Reminders list on a phone: row actions are 44 px targets with space
  between them; the date field looks the same on phone and desktop and reads as empty when
  empty; desktop columns end evenly; an empty state is one dashed box, not two.
- **F1.** "Booking confirmations to add" is a styled list in the app's row style. File names
  truncate in the middle, keeping the extension and the last characters. A phone file card
  is compact (thumbnail beside its text). On desktop the drop zone spans the content width.
- **R1, with Cam's note.** A Review card has a colour band across its top in its severity's
  colour and the same border as every other card. Review text is capped at about 75
  characters a line on desktop. A card's buttons align with its text.

## 8. Forms and settings

- **E1.** One input style everywhere. Place-search inputs are marked by a magnifier icon
  inside the field, not by size, weight or shadow.
- **E2.** Settings: Save changes sits after the last field of the form it saves; share-link
  rows share one layout; empty-state lines are no larger than helper text; the Danger zone
  follows the content instead of sitting at the foot of a long empty column.
- **G1.** Account: the avatar's actions are three buttons of one style; the Connected apps
  detail line wraps so its date shows on a phone; desktop cards have a capped width.
- **G2.** The Globe opens on a phone fitted to its markers.
- **G3.** Help's desktop grid has rows of even height and even gaps; no card is wider than
  its text needs; legend rows share one layout.

## 9. Share

- **L2.** Shared trip on desktop: the map fills its card; the view is fitted to all Stops;
  the hero card is not followed by a blank area beside the route list. Check in a real
  browser first whether the centred strip is a capture artefact.

## 10. Dialogs and sheets

- **O1.** A field's label never touches or sits under its input's border, in the shared
  field component.
- **O2.** One footer for every dialog and sheet: Cancel is the outlined pill, the primary
  button is pinned and always visible, titles are sentence case. Import a booking uses it.
  Add and Edit stop colour their segmented control the same. "Delete leg" is aligned and
  framed like other destructive actions. From/To pickers show their label once.
- **O3.** With the keyboard up in a phone browser tab, the focused field and the Save button
  of Edit Item, Import a booking, Add from Globe, inline Add reminder and Transport edit
  stay on screen.
- **O4.** Checklist item edit and Reminder edit use a text area that grows with its text.
- **O5.** The phone Feedback panel gives each note the panel's width; "Show resolved" shows
  its toggle.
- **O6.** The phone Notifications popover has a gutter from the screen edge and stops above
  the tab bar.

## 11. Dark theme

- **K2.** The tab bar and the side rail are dark in the dark theme on every page, with
  labels at 4.5:1.
- **K3.** In the dark theme the weather card and stay cards have dark surfaces, hard offset
  shadows stay visible against the page, and muted text on the lilac stay cards meets 4.5:1.

## Not in this wave

Nits (S5 to S8, H6, H7, T2, P6, P7, D7, U4, M3, A1, G4, L3, O7, O8) and the carried-over
items N1 to N12: wave 3.
