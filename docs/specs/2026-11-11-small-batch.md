# Small batch — offline upload toast, files on "Up next"

Agreed with Cam 2026-11-11.

## 1. Offline wording on the after-close upload toast

When an upload **throws** (network / offline) after its host has closed, the
failure toast's reason is `failureMessage("Couldn't upload that file.")`
(`components/ui/failure-message.ts`): offline it reads "You're offline. Plan
changes need a connection.", online it is unchanged. Row errors while the tray
is still open, server refusals (they keep the server's reason), and staging-check
failures (wrong type, too big) are unchanged.

## 2. Files on the "Up next" card

The Travelling Home's next-Transport countdown (`TransportCountdown`, the coral
"Up next" card, phone) shows that Transport's **Attachments** as large tappable
chips under the departure — each named by the file's title, else its filename,
opening through the existing `AttachmentLink` (new tab, saved for offline). No
files → no chips; the card is exactly as today. Applies whenever there is a next
Transport, including tomorrow's. Attachments come from the Today view's
already-Surprise-filtered set. Unchanged: the desktop Today tile, Today's plan
paperclip links, Item tickets, Tonight's stay.

## 3. Share button

Already exists (`ShareTripButton` in the Trip header). Nothing to build.

## Not changing

No "ticket" concept or flag; no full-screen/brightness viewer.
