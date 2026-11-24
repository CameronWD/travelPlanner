# Pre-trip hardening, 2026-11-25

Nine fixes from the 25 Nov trip-readiness review, agreed with Cam. Departure is about 30 Nov; code freezes end of Friday 27 Nov. Beta first: items 1, 2 and 7 change how the installed app behaves and Cam tries them on a real phone before `main`.

## What changes

1. **Weak-signal navigation.** An in-app navigation that has waited 6 seconds becomes a full page load of the same address, so the service worker's existing 4-second saved-copy fallback (ADR 0077) applies. Only when a service worker controls the page.
2. **Refresh on resume.** The Trip's pages refresh when the app becomes visible more than 5 minutes after the last refresh, when the connection returns, and when a failed save asks for it (item 4). Never while offline. Never while a dialog is open: it waits and runs once the dialog has closed.
3. **Trip today on the last day.** The Trip switches to the Home zone only once the Home date **and** the last Stop's own date are past the last Stop's depart date. This reverses the rule written in `currentTripTimezone`'s comment. It only changes anything when Home is ahead of the last Stop.
4. **Honest failed-save copy.** A rejected save (reply lost, server threw) says "Couldn’t confirm that. Check it saved before trying again." and asks for a refresh. A failed Undo says "Couldn’t confirm the undo. Check it before trying again." The offline message is unchanged.
5. **Sign-in link lifetime.** 24 hours, matching the email and the sign-in panel.
6. **Comma decimals.** For a currency with decimal places, an amount ending in a comma and one or two digits reads that comma as the decimal point: "12,50" is 12.50, "1.250,50" is 1250.50, "1,250" stays 1250, "1,250.50" stays 1250.50.
7. **Offline save.** Order: Trip home, today's and tomorrow's Day pages, files, then everything else. After the Trip changes (the newest Activity row differs from the one at mount), the pages are marked stale and re-saved 30 seconds after the last change; a stale mark survives closing the app, so the next open re-saves. Not forced: a data-saver connection is still respected.
8. **Booking import.** The Claude call has a 45-second timeout and no SDK retries, so it ends inside the 60-second function limit as a logged "busy". (The spec played back to Cam said 40 seconds and one retry; two 40-second attempts exceed 60 seconds, so this is the corrected value.) A thrown `importBooking` shows "Couldn't reach Teepee. Check your connection and try again." with Try again.
9. **Server errors reach the Admin's phone.** `instrumentation.ts` exports `onRequestError`, which records the error through `reportError` with `source: "server"`. The client-source push stays off (ADR 0059: `/api/client-error` is reachable without a session).

## Not in this work

Sending only changed fields from edit forms; idempotency keys on creates; the service worker deleting older static stores on deploy; billing-error handling in the Booking import; large files streamed through the function. These go to `docs/open.md`.
