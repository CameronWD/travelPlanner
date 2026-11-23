# Feedback inventory: every mutating control and how it answers today

Task 6 of the shift-check plan (Branch A). Read-only: source only, no running app. Date 2026-11-23.

## Feedback sweep

How to read it. `Today` is what the Traveller sees from the control itself in the moment between press and the server's answer:

- `optimistic`: the screen shows the result at once and rolls back on failure.
- `loading`: a `Button` with `loading` (spinner, disabled, `aria-busy`), or a control that shows its own spinner or busy text. Rows whose spinner is hand-rolled (no `aria-busy`) say so in the verdict column; they count as `loading`.
- `disabled only`: greys out or dims, and nothing else. No spinner, no `aria-busy`.
- `nothing`: no pending state at all. The page changes only when the server answer revalidates it.

Verdict words follow the brief. `add loading` on a non-`Button` means `disabled` plus `aria-busy`. A `File:line` with `->` gives the control, then the code that runs it. Rows starting `Shared:` are one row for a shared component; the screens they reach are in the Control column. They are the same controls seen from the component, so they are not additive to the screen rows.

Scope notes: confirm-then-act controls are rows for the control that starts the action; the confirm dialog itself is the Shared row F168. Form dialogs fed by `useEntityForm` all set `loading={isPending}` on their submit button, and each has its own row. View switches, filters, navigation and background effects (session keepalive, offline warmer, device sync, remember-last-trip, mark-read-on-view, the error pages posting `/api/client-error`) are not controls and are left out.

| Id | Control | File:line | Today | Verdict |
|---|---|---|---|---|

| F1 | Admin: clear one error report (Clear button) | `app/(app)/admin/error-reports.tsx:154` | loading | ok |
| F2 | Admin: clear all error reports | `app/(app)/admin/error-reports.tsx:99` | loading | ok |
| F3 | Admin: review permission (Segmented per Traveller) | `app/(app)/admin/review-permissions.tsx:67` | disabled only | add loading (non-Button: needs aria-busy) |
| F4 | Admin: approve / dismiss access request | `app/(app)/admin/access-requests.tsx:135,148` | loading | ok |
| F5 | Admin: usage recording switch and Pause/Resume buttons | `app/(app)/admin/usage.tsx:180-188` | optimistic | ok |
| F6 | Admin: revoke allowed email | `app/(app)/admin/people.tsx:113` | loading | ok |
| F7 | What's new card: Dismiss X | `components/whats-new/whats-new-card.tsx:62` | optimistic | ok |
| F8 | New trip: Create trip (last step) | `components/new-trip/step-cover.tsx:37` | loading | ok |
| F9 | Globe: invite someone to your globe (Send) | `components/globe/globe-invite-button.tsx:113` | loading | ok |
| F10 | Globe: delete a marker (trash on marker list row, confirm) | `components/globe/marker-list.tsx:82 -> components/globe/globe-view.tsx:81` | nothing | add loading |
| F11 | Globe: save marker (add or edit dialog) | `components/globe/marker-form.tsx:303` | loading | ok |
| F12 | Globe: delete marker inside edit dialog | `components/globe/marker-form.tsx:278` | loading | ok |
| F13 | Plan: drag a stop to reorder or move into a chapter | `components/trip/itinerary-manager.tsx:1293 (via components/plan/use-plan-editor.ts:160)` | optimistic | ok |
| F14 | Plan: drag a chapter to reorder | `components/trip/itinerary-manager.tsx:1307 (use-plan-editor.ts:171)` | optimistic | ok |
| F15 | Plan: drag a thing to do onto another day of the stop | `components/trip/itinerary-manager.tsx:1282 (handleMoveItem :1119)` | nothing | make optimistic |
| F16 | Plan: assign a rough stop to a chapter (picker dialog) | `components/trip/itinerary-manager.tsx:1056 (use-plan-editor.ts:195)` | optimistic | ok |
| F17 | Plan: minus/plus nights on a stop (header and phone sheet) | `components/trip/itinerary-manager.tsx:1148 (use-plan-editor.ts:209)` | optimistic | ok |
| F18 | Plan: Adjust Dates dialog, Save dates | `components/trip/itinerary-manager.tsx:2443` | disabled only | add loading |
| F19 | Plan: Firm up this chapter (button) | `components/trip/itinerary-manager.tsx:1597` | disabled only | add loading |
| F20 | Plan: Firm up the whole trip (header and empty states) | `components/trip/itinerary-manager.tsx:1710,1850` | loading | ok |
| F21 | Plan: remove a chapter (trash on chapter header) | `components/trip/itinerary-manager.tsx:1938` | disabled only | add loading |
| F22 | Plan: Delete a transport leg (card delete) | `components/trip/itinerary-manager.tsx:991 (card delete via card-action-cluster.tsx:139)` | optimistic | ok |
| F23 | Plan: Delete a stay (accommodation card / row delete) | `components/trip/itinerary-manager.tsx:1026,1039` | disabled only | add loading |
| F24 | Plan: stop menu, Move up / Move down | `components/plan/stop-actions.ts:138 -> itinerary-manager.tsx:773` | disabled only | make optimistic |
| F25 | Plan: stop menu, Pin dates / Unpin dates | `components/plan/stop-actions.ts:119 -> itinerary-manager.tsx:780` | disabled only | make optimistic |
| F26 | Plan: stop menu, Make rough (after confirm) | `components/plan/stop-actions.ts:130 -> itinerary-manager.tsx:818` | disabled only | add loading |
| F27 | Plan: stop menu, Make it a surprise | `components/plan/stop-actions.ts:86 -> itinerary-manager.tsx:792` | disabled only | add loading |
| F28 | Plan: stop menu, Reveal the surprise (after confirm) | `components/plan/stop-actions.ts:95 -> itinerary-manager.tsx:802` | disabled only | add loading |
| F29 | Plan: Suggest chapters from countries (plan menu) | `components/trip/itinerary-manager.tsx:1073,1078` | nothing | add loading |
| F30 | Plan: pick a day for a thing to do idea (idea sheet, open body) | `components/trip/itinerary-manager.tsx:1096,1105 (idea-sheet.tsx:46)` | nothing | add loading |
| F31 | Plan: add a stop (phone sheet, Add stop) | `components/plan/mobile/add-stop-sheet.tsx:225` | loading | ok |
| F32 | Day: edit a day title inline (Enter or blur) | `components/trip/day-title-editor.ts:48 (inputs at components/plan/day-section.tsx:136)` | nothing | list: inline text edit closes on commit and shows the old title until the server answers; hold the typed value meanwhile |
| F33 | Day: Add idea to today (row buttons, two lists) | `components/trip/day-ideas.tsx:112,167` | disabled only | add loading |
| F34 | Day: add an idea to a day (round add button in rows) | `components/trip/day/day-ideas-rows.tsx:53` | disabled only | add loading (raw button: aria-busy) |
| F35 | Day: how this hop is travelled (menu trigger) | `components/trip/day/hop-mode-chooser.tsx:43` | disabled only | add loading (non-Button: aria-busy) |
| F36 | Welcome: Got it / close the welcome dialog | `components/welcome/welcome-dialog.tsx:59` | optimistic | ok |
| F37 | Welcome: save your display name | `components/welcome/name-dialog.tsx:97` | loading | ok |
| F38 | Flags: Mark as fine (travel-time flag chip) | `components/trip/marked-fine.tsx:34` | disabled only | make optimistic |
| F39 | Flags: Undo marked fine | `components/trip/marked-fine.tsx:60` | disabled only | make optimistic |
| F40 | Nearby: + Day and Wishlist buttons on a nearby place | `components/trip/whats-around-sheet.tsx:208,209` | disabled only | add loading (raw buttons: aria-busy) |
| F41 | Costs: add or edit an Other cost (dialog Save) | `components/trip/other-cost-editor.tsx:305` | loading | ok |
| F42 | Globe: add a Globe marker to the trip Wishlist (suggestion chip) | `components/trip/globe-suggestions-strip.tsx:82` | disabled only | add loading (Chip, not Button: aria-busy) |
| F43 | Activity: mark all read (notification bell) | `components/trip/notification-bell.tsx:99` | disabled only | add loading (raw button: aria-busy) |
| F44 | Reminders: Save reminder (add or edit dialog) | `components/trip/add-reminder-dialog.tsx:251` | loading | ok |
| F45 | Reminders: Delete inside the reminder dialog | `components/trip/add-reminder-dialog.tsx:235` | disabled only | add loading |
| F46 | Stay: Save accommodation (add or edit dialog) | `components/trip/accommodation-form-dialog.tsx:410` | loading | ok |
| F47 | Stop: Save stop (add or edit dialog) | `components/trip/stop-form-dialog.tsx:511` | loading | ok |
| F48 | Transport: Save transport (add or edit dialog) | `components/trip/transport-form-dialog.tsx:986` | loading | ok |
| F49 | Thing to do: Save item (add or edit dialog) | `components/trip/item-form-dialog.tsx:1121` | loading | ok |
| F50 | Thing to do: Delete item inside the dialog | `components/trip/item-form-dialog.tsx:1105` | loading | ok |
| F51 | Thing to do: Add a photo / Replace and Remove photo | `components/trip/item-form-dialog.tsx:325,346` | loading | ok |
| F52 | Chapter: Save chapter (add or edit dialog) | `components/trip/chapter-form-dialog.tsx:250` | loading | ok |
| F53 | Files: Move a file to another item (dialog Move) | `components/trip/file-move-dialog.tsx:72` | loading | ok |
| F54 | Booking: "Doesn't need one" (no confirmation to attach) | `components/trip/booking-confirmation-marker.tsx:28` | disabled only | add loading (raw button: aria-busy) |
| F55 | Chapters (Settings): delete a chapter (RowActions trash) | `components/trip/chapters-manager.tsx:104` | disabled only | add loading |
| F56 | Chapters (Settings): Suggest chapters from countries | `components/trip/chapters-manager.tsx:139` | loading | ok |
| F57 | Plan/Day: Unschedule a thing to do | `components/trip/unschedule-item-button.tsx:64` | disabled only | add loading |
| F58 | Rates: Save a manual rate (Set rate form) | `components/trip/rates-panel.tsx:229` | loading | ok |
| F59 | Rates: Clear a manual rate (unlock icon) | `components/trip/rates-panel.tsx:173` | disabled only | add loading |
| F60 | Rates: Refresh all rates (Trip rates panel) | `components/trip/rates-panel.tsx:285` | loading | ok (own spinning icon and disabled, no aria-busy) |
| F61 | Compare: move a plan left or right | `components/trip/compare-table.tsx:259,266` | disabled only | make optimistic |
| F62 | Trip: hard end date, Save | `components/trip/hard-end-date-control.tsx:77` | loading | ok |
| F63 | Trip: hard end date, Clear | `components/trip/hard-end-date-control.tsx:87` | disabled only | add loading |
| F64 | Booking: Nothing to attach switch | `components/trip/nothing-to-attach-switch.tsx:51` | optimistic | ok |
| F65 | Plan: Delete stop (confirmation with preview) | `components/trip/delete-stop-dialog.tsx:91,117` | loading | ok |
| F66 | Rates: Refresh all (round button in Budget header) | `components/money/rates-refresh-button.tsx:36` | loading | ok (own spinning icon and disabled, no aria-busy) |
| F67 | Files: Delete an attachment (trash, after confirm) | `components/trip/attachment-list.tsx:264,441` | loading | ok (own spinner icon, no aria-busy) |
| F68 | Files: Add N files (staged upload tray button) | `components/trip/staged-upload-tray.tsx:263` | disabled only | add loading |
| F69 | Day: add a nearby Wishlist idea to a day | `components/trip/nearby-wishlist.tsx:85` | disabled only | add loading |
| F70 | Files: Rename a file (dialog Save) | `components/trip/file-title-dialog.tsx:57` | loading | ok |
| F71 | Wishlist: delete an idea (card trash, after confirm) | `components/trip/wishlist-board.tsx:145 (card via item-card.tsx:194)` | disabled only | add loading (card dims, pointer-events-none, no aria-busy) |
| F72 | Wishlist: Add to the nearest rough stop's things to do | `components/trip/schedule-item-dialog.tsx:174` | loading | ok |
| F73 | Wishlist: Schedule an idea (dialog Save) | `components/trip/schedule-item-dialog.tsx:277` | loading | ok |
| F74 | Plans: rename a plan (fork dialog Save) | `components/trip/fork-switcher.tsx:119` | loading | ok |
| F75 | Plans: create a plan (fork dialog Create) | `components/trip/fork-switcher.tsx:187` | loading | ok |
| F76 | Plans: discard a plan (confirm) | `components/trip/fork-switcher.tsx:221` | loading | ok |
| F77 | Packing: Save as template (dialog Save) | `components/trip/packing-templates-bar.tsx:100` | loading | ok |
| F78 | Packing: delete a template (confirm) | `components/trip/packing-templates-bar.tsx:180` | loading | ok |
| F79 | Packing: Apply Template (menu item, trigger button) | `components/trip/packing-templates-bar.tsx:243` | loading | ok |
| F80 | Reminders: Bring back a dismissed reminder | `components/trip/reminder-list.tsx:40` | disabled only | add loading |
| F81 | Globe: Add a Globe marker to the Wishlist (dialog row) | `components/trip/add-from-globe-dialog.tsx:154` | disabled only | add loading |
| F82 | Plans: Promote a plan to the real plan | `components/trip/promote-fork-dialog.tsx:264` | loading | ok |
| F83 | Costs: Save a cost (add or edit dialog) | `components/trip/cost-editor.tsx:173` | loading | ok |
| F84 | Costs: Delete a cost (X on the cost row) | `components/trip/cost-editor.tsx:411` | disabled only | add loading (row dims and pointer-events-none, no aria-busy) |
| F85 | Journal: add or replace a day photo | `components/trip/journal-editor.tsx:172` | loading | ok (own spinner icon in the label, input disabled, no aria-busy) |
| F86 | Journal: remove a day photo (x on the thumbnail) | `components/trip/journal-editor.tsx:144` | loading | ok (own spinner icon, no aria-busy) |
| F87 | Journal: Remove entry | `components/trip/journal-editor.tsx:431` | loading | ok (own spinner icon, no aria-busy) |
| F88 | Journal: Save entry | `components/trip/journal-editor.tsx:451` | loading | ok |
| F89 | Journal: Keep off share links switch | `components/trip/journal-editor.tsx:502` | optimistic | ok |
| F90 | Notes: Add note | `components/trip/note-thread.tsx:169` | disabled only | add loading |
| F91 | Notes: Delete note (after confirm) | `components/trip/note-thread.tsx:134` | disabled only | add loading |
| F92 | Shopping: Add an item | `components/trip/shopping-list.tsx:78` | loading | ok |
| F93 | Shopping: tick bought | `components/trip/shopping-list.tsx:136` | disabled only | make optimistic |
| F94 | Shopping: Remove a packing item from the shopping list (X) | `components/trip/shopping-list.tsx:165` | disabled only | add loading |
| F95 | Shopping: delete a standalone item (RowActions, after confirm) | `components/trip/shopping-list.tsx:179` | disabled only | add loading (row dims, no aria-busy) |
| F96 | Checklist: add an item (Pre-trip and Packing) | `components/trip/checklist.tsx:303` | loading | ok |
| F97 | Checklist: edit an item (dialog Save) | `components/trip/checklist.tsx:429` | loading | ok |
| F98 | Checklist: tick an item | `components/trip/checklist.tsx:634 (toggleItem :786)` | optimistic | ok |
| F99 | Checklist: Need to buy (basket icon on a packing item) | `components/trip/checklist.tsx:662` | disabled only | make optimistic |
| F100 | Checklist: Move up / Move down | `components/trip/checklist.tsx:675,686` | disabled only | make optimistic |
| F101 | Checklist: Move to another list (menu) | `components/trip/checklist.tsx:700` | disabled only | add loading |
| F102 | Checklist: delete an item (RowActions, after confirm) | `components/trip/checklist.tsx:721` | disabled only | add loading (row dims, no aria-busy) |
| F103 | Reminders: add a reminder (inline form on the Reminders card) | `components/trip/reminders-card.tsx:213` | loading | ok |
| F104 | Reminders: Got it (dismiss, with Undo) | `components/trip/reminders-card.tsx:279 (gotIt :336)` | optimistic | ok |
| F105 | Reminders: Bring back (Dismissed list on the card) | `components/trip/reminders-card.tsx:414` | optimistic | ok |
| F106 | Try list: tick an entry | `components/trip/try-list-ticks.tsx:39` | optimistic | ok |
| F107 | Votes: vote or clear a vote on an idea (shared control) | `components/trip/vote-control.tsx:125` | optimistic | ok |
| F108 | Calendar: drag a plan or Wishlist idea onto a day | `components/trip/calendar-views.tsx:163-177` | optimistic | ok |
| F109 | Budget: tick a cost paid or unpaid (To pay row) | `components/money/to-pay-row.tsx:96 (toggle components/money/to-pay-panel.tsx:49)` | optimistic | ok |
| F110 | Budget: Mark partly paid (dialog Confirm) | `components/money/paid-confirm.tsx:122` | loading | ok |
| F111 | Budget: Delete cost (To pay row menu, after confirm) | `components/money/to-pay-panel.tsx:122,143 (menu item in to-pay-row.tsx:143)` | nothing | add loading (menu item: row aria-busy; nothing marks the row while deleteCost runs) |
| F112 | Settings, Calendar feed: Create calendar link | `components/trip/settings/calendar-feed-panel.tsx:147` | loading | ok |
| F113 | Settings, Calendar feed: Include in feed checkboxes (Transport, Accommodation, Activities) | `components/trip/settings/calendar-feed-panel.tsx:178` | optimistic | ok |
| F114 | Settings, Calendar feed: Alarm checkboxes | `components/trip/settings/calendar-feed-panel.tsx:197` | optimistic | ok |
| F115 | Settings, Calendar feed: Regenerate link | `components/trip/settings/calendar-feed-panel.tsx:236` | loading | ok |
| F116 | Settings, Calendar feed: Revoke link (after confirm) | `components/trip/settings/calendar-feed-panel.tsx:239` | loading | ok |
| F117 | Settings: Chapters switch | `components/trip/settings/chapters-switch.tsx:52` | optimistic | ok |
| F118 | Settings: Packing lists open switch | `components/trip/settings/packing-lists-switch.tsx:37` | optimistic | ok |
| F119 | Settings: What's around switch | `components/trip/settings/whats-around-switch.tsx:37` | optimistic | ok |
| F120 | Settings: What-if plans switch (Trip details) | `components/trip/settings/trip-details-form.tsx:259` | optimistic | ok |
| F121 | Settings: Save trip details | `components/trip/settings/trip-details-form.tsx:275` | loading | ok |
| F122 | Settings: Choose cover photo (upload) | `components/trip/settings/cover-image-field.tsx:116` | disabled only | add loading (an Uploading line of text also shows) |
| F123 | Settings: Remove cover photo | `components/trip/settings/cover-image-field.tsx:121` | disabled only | add loading |
| F124 | Settings: tap the cover photo to set its focal point | `components/trip/settings/cover-image-field.tsx:136` | optimistic | ok |
| F125 | Settings: Delete trip (Danger zone, final confirm) | `components/trip/settings/danger-zone.tsx:103` | loading | ok |
| F126 | Settings: Your digest for this trip (checkbox) | `components/trip/settings/digest-panel.tsx:186` | optimistic | ok |
| F127 | Settings: Send me a test digest | `components/trip/settings/digest-panel.tsx:300` | loading | ok |
| F128 | Settings: Road winding factor and Average speed inputs | `components/trip/settings/driving-estimates-panel.tsx:72,89` | disabled only | list: each keystroke writes and disables the input being typed in; needs a save-on-blur or debounce decision, not just a spinner |
| F129 | Settings, Travellers: Send invite | `components/trip/settings/invite-panel.tsx:222` | loading | ok |
| F130 | Settings, Travellers: cancel a pending invite (X) | `components/trip/settings/invite-panel.tsx:182` | disabled only | add loading |
| F131 | Settings, Travellers: remove a member (after confirm) | `components/trip/settings/invite-panel.tsx:146` | disabled only | add loading |
| F132 | Settings, Travellers: Leave trip (after confirm) | `components/trip/settings/invite-panel.tsx:251` | loading | ok |
| F133 | Settings, Share links: Create share link | `components/trip/settings/share-links-panel.tsx:468` | loading | ok |
| F134 | Settings, Share links: Save an edited share link | `components/trip/settings/share-links-panel.tsx:369` | loading | ok |
| F135 | Settings, Share links: Rotate link | `components/trip/settings/share-links-panel.tsx:313` | loading | ok |
| F136 | Settings, Share links: Revoke link | `components/trip/settings/share-links-panel.tsx:317` | loading | ok |
| F137 | Settings: Save my travel number | `components/trip/settings/traveller-details-list.tsx:38` | loading | ok |
| F138 | Home: Got it on a Sort-these-out reminder | `components/trip/home/desktop/sort-these-out-rows.tsx:90` | optimistic | ok |
| F139 | Review: Run a standard review | `components/trip/reviews/review-run-panel.tsx:97` | loading | ok |
| F140 | Review: Run a deep review (after confirm) | `components/trip/reviews/review-run-panel.tsx:101` | loading | ok |
| F141 | Review: Apply / Need to pack / Need to buy / Add to checklist on a finding | `components/trip/reviews/finding-list.tsx:178-193` | optimistic | ok |
| F142 | Review: Dismiss a finding | `components/trip/reviews/finding-list.tsx:203` | optimistic | ok |
| F143 | Review: Undo an applied or dismissed finding | `components/trip/reviews/finding-list.tsx:208` | optimistic | ok |
| F144 | Make it fit: Apply trim | `components/trip/make-it-fit.tsx:282` | disabled only | add loading |
| F145 | Make it fit: Drop a stop (button, then loss-preview confirm) | `components/trip/make-it-fit.tsx:318 (performDrop :186)` | disabled only | add loading |
| F146 | Trips: Duplicate a trip (dialog) | `components/trip/duplicate-trip-dialog.tsx:110` | loading | ok |
| F147 | Suggestions: Suggest or Refresh activities (AI) | `components/trip/ai-activity-suggestions.tsx:93` | loading | ok |
| F148 | Suggestions: Add an AI suggestion to the Wishlist | `components/trip/ai-activity-suggestions.tsx:150` | disabled only | add loading |
| F149 | Booking import: Read booking (reading screen) | `components/booking-import/booking-import-sheet.tsx:446` | loading | ok (the sheet swaps to a Reading your booking screen) |
| F150 | Booking import: Confirm a proposed stop, stay or leg | `components/booking-import/booking-import-sheet.tsx:484` | loading | ok |
| F151 | Trips: Restore a recently deleted trip | `components/trips/recently-deleted.tsx:43` | loading | ok |
| F152 | Account: Save display name (profile card) | `components/account/profile-card.tsx:234` | loading | ok |
| F153 | Account: Change photo | `components/account/profile-card.tsx:161` | loading | ok |
| F154 | Account: Remove photo | `components/account/profile-card.tsx:180` | loading | ok |
| F155 | Account: drag or tap the profile photo focal point | `components/account/profile-photo-focal.tsx:83` | optimistic | ok |
| F156 | Account: Save traveller details | `components/account/traveller-details-card.tsx:88` | loading | ok |
| F157 | Account: per-trip digest switch | `components/account/trip-digests-panel.tsx:85` | optimistic | ok |
| F158 | Account: Disconnect a connected app (Yes, disconnect) | `components/account/connected-apps-panel.tsx:116` | loading | ok |
| F159 | Account: Remove a device | `components/account/devices-panel.tsx:231` | loading | ok |
| F160 | Account: Enable on this device (push) | `components/account/devices-panel.tsx:342` | loading | ok |
| F161 | Feedback panel: Send a note (with or without pictures) | `components/feedback/feedback-launcher.tsx:814` | loading | ok |
| F162 | Feedback panel: delete one of your sent notes (trash) | `components/feedback/feedback-launcher.tsx:865 (handleDelete :586)` | nothing | add loading |
| F163 | Auth: Continue with Google | `app/landing/signin-buttons.tsx:60` | loading | ok |
| F164 | Auth: Continue as a seeded dev Traveller (dev only) | `app/landing/signin-buttons.tsx:85` | loading | ok |
| F165 | Auth: email me a sign-in link | `app/landing/email-sign-in.tsx:103` | loading | ok |
| F166 | Auth: Allow or Cancel an app connection (consent) | `app/connect/consent-form.tsx:35,38` | loading | ok |
| F167 | Auth: Sign out (menu item and button) | `components/ui/sign-out-button.tsx:76,88` | nothing | add loading |
| F168 | Shared: Confirm button in ConfirmDialog and useConfirm (about 20 call sites; every confirm-then-act row above) | `components/ui/confirm-dialog.tsx:44` | nothing | list: closes the dialog at once by design; feedback belongs on the row or trigger that started the action (see the delete rows marked add loading) |
| F169 | Shared: Edit and Delete icon pair in RowActions (checklist, shopping, chapters, globe markers; reached by 4 screens here) | `components/ui/row-actions.tsx:37,53` | disabled only | add loading (give RowActions a loading or deleting prop that sets Button loading) |
| F170 | Shared: Edit and Delete icons in CardActionCluster (transport, stay and thing-to-do cards, wishlist cards) | `components/trip/card-action-cluster.tsx:126,139` | disabled only | add loading |
| F171 | Shared: Undo button in an undo toast (plan moves, unschedule, reminders, review findings; 6 screens) | `components/ui/undo-toast.tsx:28` | nothing | list: the toast action gives no sign while the inverse call runs; apply and applyUndo already show the result, and no new toasts are allowed |
| F172 | Shared: StopRow dims while a stop menu action runs (move, pin, rough, surprise, delete) | `components/plan/stop-row.tsx:132` | disabled only | add loading (aria-busy on the row; the menu items are not Buttons) |

## Totals

Rows: 172 (167 screen controls, F1 to F167, plus 5 Shared rows, F168 to F172). Plan against the screen-only counts.

By `Today`, all rows: optimistic 31, loading 80, disabled only 51, nothing 10.
By `Today`, screen controls only: optimistic 31, loading 80, disabled only 48, nothing 8.

By `Verdict`, all rows: ok 111, add loading 48, make optimistic 9, list 4.
By `Verdict`, screen controls only: ok 111, add loading 45, make optimistic 9, list 2.

## Shared causes

Where one change answers three or more rows.

1. **StopRow dims but never says busy** (`components/plan/stop-row.tsx:132`, fed by `isPending` from `components/trip/itinerary-manager.tsx:1417,1482`). One fix on the row (`aria-busy` plus a visible pending mark) answers F26, F27 and F28, and F24 and F25 once they are optimistic. Five rows, one component: F24, F25, F26, F27, F28 (Shared F172).
2. **RowActions has `disabled` but no `loading`** (`components/ui/row-actions.tsx`). A `loading` pass-through for the delete Button, fed from `useDeleteWithConfirm`'s `isPending`, answers F55 (chapters delete), F95 (shopping delete), F102 (checklist delete), and F10 (globe marker delete, which also needs a pending flag at the caller, `components/globe/globe-view.tsx:81`). Four rows (Shared F169).
3. **Plain Buttons fed `isPending` as `disabled`**: no new component, one-line change in each file (`disabled={x}` to `loading={x}`). Answers F18, F19, F21, F33, F45, F57, F59, F63, F68, F69, F80, F81, F90, F91, F122, F123, F130, F131, F144, F145, F148. Twenty-one rows.
4. **Raw `<button disabled>` and Chip controls that cannot take `loading`**: F34, F38, F39, F40, F42, F43, F54. They need a hand-made spinner and `aria-busy`, or a move to `Button`. Seven rows, no single component; a small shared pending-aware button would answer all of them.
5. **Toggles that wait for the server to move** (the checklist tick is the model, `components/trip/checklist.tsx:786`): F15 (drag a thing to do to another day), F24 and F25 (stop move and pin), F38 and F39 (marked fine), F61 (compare move), F93 (shopping tick), F99 (need to buy), F100 (checklist move). Nine rows; the `useOptimistic` pattern in `checklist.tsx` and `try-list-ticks.tsx` applies to each.
6. **Confirm dialogs close at once** (`components/ui/confirm-dialog.tsx:44`, 20 call sites). Not a defect: the wait belongs on the originating row. It is the reason every delete row marked add loading needs its own pending mark: F10, F23, F55, F71, F91, F95, F102, F111, F131.

## Could not classify

Nothing was unreadable. These are inferences, or places where I did not read to the bottom, so a later task should not trust them blindly.

- F104, F105, F106, F107, F108, F109 (reminders, try list, votes, calendar drag, To pay): `optimistic` from reading the `useOptimistic` or local set that runs before the `await`. I read the handlers, not the markup of every row.
- F15 (drag a thing to do to another day): `nothing` is an inference. The write (`moveItemAction`, `components/trip/itinerary-manager.tsx:1113`) has no `apply`, so nothing moves locally; I could not tell what dnd-kit's drop leaves on screen meanwhile. Needs a look in a running app.
- F32 (day title): after commit the input closes and the old title shows until revalidation, from `components/trip/day-title-editor.ts:36`. Not run.
- F60, F66, F67, F85, F86, F87: counted `loading` because each shows its own spinning icon or busy text. None sets `aria-busy`, so a screen reader hears nothing. A later task may prefer to count them as `disabled only` plus a spinner.
- `Segmented`, `Switch` and `Chip` (`components/ui/`) set no `aria-busy`; `aria-busy` appears only in `button.tsx`.
- The phone sheet and the desktop plan share the same handlers in `components/trip/itinerary-manager.tsx` (stop menu, nights stepper, firm up), so each is one row. If the phone sheet has a control that bypasses them I did not find it.
- Auth rows F163 to F167 are session changes, not trip data. Included because a Traveller presses them; drop them if the sweep is meant to be trip data only.
- `components/account/push-subscribe.ts` (reached from F160) is a helper, not a control; its `subscribeToPush` runs under the `loading` Button in F160.
