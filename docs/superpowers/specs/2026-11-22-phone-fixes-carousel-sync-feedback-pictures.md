# Phone fixes, carousel sync and Feedback pictures

Agreed with Cam on 2026-11-22 from nine iPhone screenshots, one screen recording of the Day
view, and the open Feedback note `cmwrlib11000007l2nu9dzw4z` ("Leave pictures when leaving
feedback"). Device: iPhone, installed PWA, 402pt wide.

## 1. Phone sheets

Three implementations draw a phone bottom sheet: `SheetFrame` (`components/ui/sheet.tsx`),
`DialogSheet` (`components/ui/dialog.tsx`) and `DragSheetContent`
(`components/plan/drag-sheet-content.tsx`). The faults below are one investigation.

- **Keyboard.** With the keyboard open a sheet sits directly on the keyboard, its header
  visible, with no band of backdrop between the sheet and the keyboard. Seen broken on the
  Feedback panel: the sheet sat about 260pt too high, its top off screen.
- **Footer.** The space beneath the last footer button is the home-indicator inset and no
  more. Scrolled to the end, the last field is fully above the footer.
- **No sideways movement.** No sheet pans or scrolls horizontally. Seen on Edit Item.
- **Feedback panel.** On a phone the panel fills the screen; the note list has the height
  left over, and "Show resolved" is never covered by the box.
- **A sheet opened from a sheet covers it.** Closing it returns to the sheet beneath, where
  it was. No list row paints above the All costs header.

## 2. Day view carousel (below `lg`)

- The heading travels with the body: the outgoing day's heading slides off and the incoming
  day's slides on, driven by the same drag progress as the body and the Day strip. The
  heading area's height moves between the two headings' heights during the drag.
- The lit chip in the Day strip changes when the body crosses halfway.
- The address is still pushed on settle.
- A tap on a day further than one away cuts to it: heading, strip and body together, no
  glide through the days between.
- The strip is always on the day in view with that chip lit. Seen broken: day 36 shown,
  strip on days 1 to 4, nothing lit, a tall gap between heading and strip.
- From `lg` nothing changes.

## 3. Day view rows

- Check-in and check-out are ordinary timeline rows ("Check in · <name>",
  "Check out · <name>"), not purple cards. The Tonight card is the only purple card, and it
  carries the booking reference and the "No booking confirmation yet" marker.
- Things with no time keep their place after the timed ones, under an "Any time" label.
- A Transport row's time and icon sit at the top, beside its title.
- "No booking confirmation yet" and "Doesn't need one" wrap without a dangling "·".

## 4. Stop page (phone)

- Header in two rows: back, number badge, title and "…" on the first; the dates line
  beneath at full width.
- The nights stepper shows only on a Rough Stop. A Scheduled Stop uses "Edit dates".
- Category dots are 12px, filled with the Category colour, outlined in a darker shade of
  the same colour.
- "Any time" label, as on the Day view.

## 5. Rates

- An icon-only "Refresh all rates" button in the Rates strip header, wherever the strip is
  shown. One tap refreshes every rate in place: the icon spins, each changed figure ticks
  to its new value and pops, stale markers clear, the strip's note reads
  "Updated just now". A failure shows a toast and leaves the figures.
- Tapping a rate still opens its sheet, for setting a rate by hand.

## 6. Loading screen

The teepee mark builds itself (outline, fill, door, poles), the wordmark arrives beneath
with its dot dropping in last, then the mark holds in a gentle loop. Still under reduced
motion.

## 7. Pictures on Feedback notes

- Up to four pictures per note, from the photo library or camera, compressed on the device.
- They belong to the note: visible to its author and to Admins, deleted with the note, kept
  when it is resolved.
- Offline, pictures cannot be added; a text-only note still queues.
- The Feedback panel shows them as thumbnails under the note; a tap opens one full size.
- `npm run feedback:pull` downloads the pictures of open and needs-review notes to
  `docs/feedback/pictures/<note id>/`, which is git-ignored, and `inbox.md` lists the paths.

## Not in this batch

Moving the Feedback button; replacing the app's other spinners; ordering a day by hand; any
change to day order.

## Shipping

One branch. Beta first, for Cam's phone check of sections 1 and 2, which only WebKit on a
phone can judge; then main. Section 7 adds one table.
