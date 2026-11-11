# Multi-file upload, title on upload, drag-and-drop

Agreed with Cam 2026-11-11. Glossary: `CONTEXT.md` **Attachment** (title).

## Where

The shared `AttachmentList` only, both layouts: Files page, the Stop / Item /
Transport / Accommodation dialogs, the Stop extras sheet, the card attachment
popover, and Globe Markers. Out of scope: cover image, profile photo, Item
photo, booking importer, and the "Save this item first" message on a new Item.

## Picking files

- The picker allows several files at once (works on phones).
- Drop targets: the upload tile (full layout) and the dashed "Add files"
  button (compact). Each highlights while files are dragged over it.
- Copy: the tile reads "Tap or drop files"; the compact button "Add files".

## Staging tray

- Picked or dropped files go into a "Ready to add" list; nothing uploads yet.
- Each row: file type, size, a remove ✕, and an optional **Title** box —
  blank, the filename as its placeholder, 120 characters max.
- Each file is checked as it lands (type, and size after image compression).
  A failing file shows its error on its row and is not counted.
- **Add N files** uploads the valid files one request at a time, each with its
  title. Disabled when no valid files remain.
- Successes leave the tray and appear in the list. Server rejections (quota,
  etc.) stay in the tray with their error, to remove or retry. Nothing that
  succeeded is undone.
- No count cap — the quota governs.
- Inside the entity dialogs (rendered inside a `<form>`), the tray's buttons
  and the Enter key in a Title box never submit or close the dialog.

## Server

- `uploadAttachment` accepts an optional `title`: trimmed, empty = none, over
  120 characters refused — the same rules as `setAttachmentTitle`. Both Trip
  and Globe paths.
- A Trip upload's Activity line uses the title when given, else the filename.
  Still one line per file. Globe uploads still log nothing.

## Unchanged

The stored filename, the Files page Rename, per-file limits and quota rules.
