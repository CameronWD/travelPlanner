# Claude files Attachments, import says when it is misconfigured, and the desktop Day header

Agreed with Cam 2026-11-24. One branch: `feat/claude-files-and-day-header-2026-11-24`.

## What Cam asked for

- Feedback note `cmwt1bwt4000507jzzmw2cj1w`: "Is it possible to be able to do the attachment from
  Claude when uploading documents for activities etc".
- Feedback note `cmwt1k4rq000607jztb3y34wg`: "Spacing for this needs to be improved" (Plan editor,
  the old "No booking confirmation yet" line under Transport rows).
- The trip name must not be repeated on the desktop Day view.
- The Booking import failed for him on 23 November. Production logged
  `Booking import: Anthropic API error 401` twice: the production `ANTHROPIC_API_KEY` is rejected.
  Replacing the key is Cam's job in Vercel; the app's silence about it is ours.
- Usage decision U2 reversed.

## Not built

A file dropped into a Claude chat does not travel to Teepee. A connector call carries text, not
the file. The on-site Booking import is the way a dropped file becomes a thing with its Booking
confirmation; Claude's part is filing files that are already on the Trip.

## 1. Claude can file Attachments

- A new connector tool takes an Attachment already on the Trip and attaches it to one or more
  things: a Stop, a Transport, an Accommodation, an Item, or the Trip itself.
- The file **moves** to the first thing named. Each further thing gets **its own copy** (a new
  Attachment with its own stored object), so removing one never removes another.
- The same call may set or change the file's title; every resulting file carries it. The original
  filename never changes.
- Claude cannot delete a file, upload one, touch an Item photo, a Journal photo or a Globe Marker's
  file.
- It cannot move a file into or out of a Surprise hidden from the acting Traveller.
- Only the real plan: a target on a Fork is refused.
- Every target is checked before anything changes: a call with one bad target changes nothing.
- Copies count against the storage quota like an upload.
- Each resulting file shows in Activity marked via Claude, hidden from a Traveller surprised by
  where it now sits.
- A file on a Booked thing is its Booking confirmation, as for a file added by hand. Nothing new.
- `docs/connect-claude.md` says what Claude can now do with files and that it still cannot upload
  or delete them.

## 2. Booking import says when it is misconfigured

- When Anthropic refuses the key (HTTP 401 or 403), the sheet says:
  "Booking import isn't set up correctly. We've been told and will fix it."
- Admins get a push: title "Booking import is failing", body "Anthropic rejected the API key.
  Replace ANTHROPIC_API_KEY in Vercel and redeploy.", link `/admin`. At most once per 24 hours,
  tracked in `OperatorNotice` under the key `booking-import-key`.
- The error report and the `AiUsage` row are written as today.
- Every other failure keeps its current wording.

## 3. Paperclip

- A thing-to-do row on the plan (desktop day section and the phone's Stop sheet) shows the same
  small paperclip a Transport pill shows, and "File attached" to a screen reader, when the Item has
  at least one Attachment other than its Item photo.
- The Tonight card on the Day view shows it when tonight's Accommodation has at least one
  Attachment.
- A Surprise placeholder row never shows it.

## 4. Desktop Day view header

- The trip name added on 23 November (`data-slot="day-trip-name"`) is removed.
- From `xl`, the Share button, bell, Traveller pictures and Add button sit in the date row, to the
  right of the date, and the separate row above the date is gone.
- The date is centred when there is room. When there is not, it sits left of centre; nothing
  overlaps and nothing wraps.
- Checked in the browser at 1280, 1512 and 1728 wide with the longest date heading and a full set
  of Traveller pictures.
- Below `xl` (the switcher pill's row, tablet, phone) nothing changes.

## 5. Usage names are checked by the app only (U2)

- One migration drops the `UsageRecord` CHECK constraints on `screen`, `action` and `detail`. The
  constraint that exactly one of `screen` and `action` is set stays, as does any other.
- `lib/usage/validate.ts` remains the check on what is written.
- `docs/audits/2026-11-24-usage-decisions.md` and `docs/specs/2026-11-24-usage.md` record the
  change.

## 6. The Plan editor spacing note

- Commit `99136ad5` took the missing-confirmation line off every row. Check the plan in the
  browser against the note's picture (`docs/feedback/pictures/cmwt1k4rq000607jztb3y34wg/1.webp`).
- If the rows are even, nothing is built and the note is resolved once main is live.
- If they are still uneven, fix the spacing on this branch.

## Closing the notes

`Resolves-Feedback: cmwt1bwt4000507jzzmw2cj1w` on the commit that adds the tool. The spacing note
gets a trailer only if this branch changes something for it. Nothing is resolved in production
until Cam confirms a deploy.
