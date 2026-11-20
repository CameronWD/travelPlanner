# Usage: decisions for Cam

Kept while `feat/usage` was built on 20 Nov 2026. Each line is a choice made so the work did
not stop. Say which to change. The spec is `docs/specs/2026-11-24-usage.md`.

## Choices in the plan

| Id | Built as | The other way |
|---|---|---|
| U1 | Two tables in the one migration: `UsageRecord` and a one-row `UsageSwitch` (no row means on). | A key-value settings table, or the `OperatorNotice` ledger. |
| U2 | The database CHECKs every name against the lists; adding a name needs a migration. | App-side validation only, as other enum-ish columns here. |
| U3 | A record with any unexpected key is dropped whole; bad records drop one by one, never the batch. | Strip unknown keys and keep the rest. |
| U4 | `fetch` with `keepalive` for every send. | `sendBeacon` on hide. |
| U5 | At least once: a record leaves the queue only after a 2xx; a page killed between its hide flush landing and its removal sends it twice. | At most once: take before sending and lose a batch that fails while the page is frozen. |
| U6 | Off empties the browser's queue and stops it for that document; 401 does the same. | Keep queueing while off; poll for on. |
| U7 | Time to appear: navigation start (or the tap) to the first paint after the screen's recorder ran; null for Back/Forward; the Trips list counts its skeleton. | First contentful paint only; Largest Contentful Paint. |
| U8 | A browser reload records the screen again; a re-render, a refresh in place or a day change does not. | Skip reloads. |
| U9 | Saved copy is true for any first screen the worker answered from its cache, including ADR 0077's 4-second timeout on a slow network, not only with no connection. | Only when `navigator.onLine` is false. |
| U10 | Phone means a coarse pointer (an iPad counts as a phone); phone app means coarse and standalone; an installed app on a computer is "desktop". | User-agent sniffing. |
| U11 | Search counts ⌘K and every search button; a click straight into the wide sidebar's field does not. | Count the field's focus too. |
| U12 | Directions counts the three links labelled Directions (Day plan rows, the now/next card, a thing to do's sheet); the Day map's own route links count only as opening the Day map. | Count every route link. |
| U13 | Share link opened: tried only by a browser with a signed-in, not-signed-out recorder; counted only with a session; no Trip on the record. | Read the session on the share page. |
| U14 | Records older than 180 days by `occurredAt`; at most 5 minutes in the future; a batch names at most five Trips. | By `receivedAt`. |
| U15 | The Admin's day is the browser's zone, sent with the request; the script uses the machine's zone or `--tz`. | The Trip's zone. |

## Rulings made while building

| What | Built as | The other way |
|---|---|---|
| Surprise | Only a Traveller with a Surprise hidden from them loses the Day view's day offset. The planner's own offsets are kept. | Withhold offsets for everyone on a Trip while any Surprise on it is unrevealed. |
| Site | Each record says which site recorded it (main, beta, preview, local), set by the server. Figures show main and say how many came from elsewhere. | No site, beta mixed in. |
| Google Maps | App-wide call counts over the Trip's dates, no money: TEEPEE records neither a Trip nor a price for them. | Leave Google out. |
| Which Trips an Admin can read | Only Trips the Admin is a Traveller of. The report script can read any Trip. | Any Trip in the Admin section too. |
| Days in the figures | Calendar days in the reading Admin's browser timezone. | The Trip's own timezone. |
| Keeping | Deleted 180 days after TEEPEE received the record, not after the device says it happened. | By the device's clock. |
| Queue on a phone | Recording a thing only adds to memory; the waiting list is saved when the phone is idle or the app is hidden. A crash can lose about two seconds. | Save on every record (was measured as up to 100 KB per tap when full). |
| Whose queue | A waiting list belongs to one account and is thrown away if someone else signs in on that browser. A lapsed session keeps it. | Send whatever is waiting as whoever is signed in. |
| Turning it back on | Reaches each device at its next page load. Turning it off stops storing within 30 seconds. | A check on every page. |
| Screens | 23, including What's new and a Trip's More page. `/today` and `/compare` only redirect; `/connect` is not recorded. | Record `/connect` too. |
| Deleting an account | Its Usage records stay, pointing at nothing, until their 180 days are up. `/privacy` says so. | Delete them with the account. |

## Known and accepted

- Duplicates are possible: a page killed mid-send resends that batch, and two open tabs can each send the same oldest batch.
- Time to appear is missing for trip home and Plan when opened from a plain link on a phone, and whenever the app was hidden during the load.
- A key pressed while a glide is still running records no day change.
- Two accounts in one browser with a lapsed session or blocked storage: a rare window where one account's waiting records could be sent as the other.
- Records made in another tab while recording is off are stored once it is back on.

## Not seen by anyone

- The Admin Usage section in a browser (the local sign-in is not an Admin).
- A real Booking import read and a real Review start recording once each (never exercised, to avoid paid runs).
- Whether the proxy's and the endpoint's deferred error reports finish on Vercel.
- Whether beta records `beta` and not `preview`: it depends on a Vercel setting.
- A real iPhone: the queue's idle save uses a two-second timer there.

## Questions

- Is the GitHub repository private? `/privacy` says the nightly backup, a full copy of the database including Usage, is kept there.
- Is Xanthia an Admin? If so she can read your Usage as counts and you hers.
