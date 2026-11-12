# Booking confirmations (2026-11-12)

Prompted by an audit of Christmas in Europe 2026: seven Booked legs/Items and
all ten stays had no file, and a FlixBus pass sat on the wrong leg.
Glossary: **Booking confirmation**, **Nothing to attach**, **Attachment**,
**Booking import**, **Next steps**.

## A. What needs a Booking confirmation

A **Booking confirmation** is any Attachment on a Booked Transport,
Accommodation or Item other than that Item's photo (`Item.photoAttachmentId`).

A thing **needs a Booking confirmation** when all hold:

- `bookingState === "BOOKED"` (Transport, Accommodation or Item).
- It is on the **real plan** (`forkId` null). An Item must belong to a Stop
  (`stopId` set) — Wishlist ideas (no Stop, no date) never count.
- It has no Attachment of its own other than the Item photo (Attachment
  `targetType` TRANSPORT / ACCOMMODATION / ITEM with `targetId` = its id).
  A Trip-level or Stop-level file never counts for it.
- It is not marked **Nothing to attach**.
- It is not over, judged by the Trip's today (`lib/trip-today.ts`):
  - Transport: its departure local date is before today → over. No departure
    time → never over.
  - Accommodation: `checkOut` before today → over.
  - Item: `date` before today → over. An undated thing to do is never over.
- A Past Trip never has any.
- For a viewer **surprised** by the Stop or Item it sits in, it does not exist
  (counts, lists and card markers all skip it). Uses the existing Surprise
  masking — never a lookup that would reveal it.

Drives: a CAR Transport with no reference is No booking needed, so never
counts; a hire car with a reference is Booked, so it does. No special case.

## B. Nothing to attach

- New boolean on Transport, Accommodation and Item: `nothingToAttach`, default
  false. Shared by every Traveller.
- Set and cleared from the "No booking confirmation yet" marker (one tap each
  way) and from the Claude connection.
- Uploading a file does not clear it (irrelevant once a file exists).
- Copied wherever the thing is copied (Fork, promote, Duplicate, placing a
  Wishlist idea) like the other booking fields.
- No Activity line.

## C. Where it shows

1. **Card marker.** On a Transport, Accommodation or Item card in the plan
   editor, Day view and Today view: a quiet line `No booking confirmation yet`
   with a `Nothing to attach` action. When `nothingToAttach` is set and there
   is still no file, the card shows nothing. The undo lives in the thing's
   edit dialog, next to Booking state: while Booked, a switch `Nothing to
   attach` that saves at once through its own action (not part of the form's
   save, so it writes no Activity line).
2. **Next steps** on the Home: one nudge `Add booking confirmations (n)` with
   subtitle `Booked, but no ticket or confirmation attached.` linking to
   Files. Priority 21 normally, 7 in Final prep. Only when n > 0. Home only:
   the trips page's Next steps (`loadNextSteps`) leaves it out.
3. **Files page**: a group `Booking confirmations to add` above the existing
   groups, one row per thing (its name/label as Files already labels owners),
   each linking to the thing. Hidden when empty.

## D. Moving a file

- Files' "link to an Item" becomes **Move**: any trip-scoped Attachment can be
  moved onto the Trip itself, a Stop, a Transport, an Accommodation or an Item
  of that Trip (real plan only).
- Refused: a file that is currently an Item's photo (`Remove it as the photo
  first.`); a target on another Trip; a target the mover is surprised by
  (existing `requireOutsideSurprise`), and a file the mover is surprised by
  (already refused by `requireAttachmentAccess`).
- No Activity line. Revalidates as linking does today.

## E. Booking import keeps the file

Today the import sheet already uploads the original file (client-side, via
`uploadAttachment`, which writes the usual "added a file" Activity line) but
only onto the **first** confirmed Proposal, and never for an email. Keep that
path and its Activity line; widen it:

- Confirming a Proposal from a **PDF or image** input stores that file and
  attaches it to the confirmed thing (Transport, Accommodation or Item; a new
  Stop gets nothing). Each confirmed Proposal gets its own Attachment and its
  own stored copy, so deleting one never affects another.
- From an **email** input: each PDF attachment inside the email is attached,
  titled with its own filename (images in emails are not). No PDFs → nothing.
  Each file passes the usual upload validation and quota.
- **Pasted text**: nothing. **Discarded** Proposals: nothing, and the file is
  not stored.
- Title: the original filename. Uploaded by the confirming Traveller.

## F. Claude connection (MCP)

- `get_trip_plan`, `get_day`, `get_transport`, `get_accommodation`,
  `get_item`, `get_stop`: each Transport / Accommodation / Item gains
  `needsBookingConfirmation: boolean` and `nothingToAttach: boolean`.
- New tool `set_nothing_to_attach { kind: "ITEM" | "TRANSPORT" |
  "ACCOMMODATION", id, nothingToAttach: boolean }` (same shape conventions as
  `set_booking_state`). Same access, real-plan and Surprise rules.
- No upload or move tools.

## G. Copy

No em-dashes in Traveller-facing strings (test/copy-style.test.ts).

## Out of scope

Push / Digest pings; detecting misfiled files; Summary Flags; Share links.
