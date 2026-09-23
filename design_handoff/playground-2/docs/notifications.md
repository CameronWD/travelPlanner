# Notifications & email — copy rules

Plain-text extract of `reference/specs/notifications.html` (source: `reference/specs/notifications.jsx`). Step 7 works from this file.

## Global rules
- Only ping when it's about you, or it's time to go.
- Edits by other people are batched. Money and travel-day messages are never batched.
- Every push has one primary action plus "Mute trip".
- Title ≤ 40 chars, body ≤ 90. Sentence case. Names first. No exclamation marks.
- Push payload: `badge` = /icons/push-badge-96.png, `icon` = /icons/icon-192.png, `tag` = `${tripId}:${event}` (replaces older), `data.url` = deep link. iOS requires installed PWA (16.4+).
- While the app is open, a toast replaces the push (`Toast` tone ink, action "View").
- Quiet hours 22:00–08:00 in the trip's local time, default on. "Time to leave" ignores quiet hours.

## Catalogue
| Event | Title (example) | Body (example) | Channels | Timing | Grouping | Push action |
|---|---|---|---|---|---|---|
| Plan changed | Alex moved Arashiyama | Now Mon 20 Oct · Kyoto | push, in-app | Batched: 10-min window, max 1 per trip per hour | "Alex and Jess made 4 changes" | Open |
| New idea / vote | Jess added an idea | Kawaii Monster Cafe · Tokyo. Vote? | in-app | In-app only | Daily roll-up | — |
| Payment due | Nohga Hotel is due on arrival | ¥96,000 · Osaka, Tue 21 Oct · not paid yet | push, in-app, email | 3 days before, 10:00 local | All due that day in one | Mark paid |
| Time to leave | Leave in 30 min for Romancecar | Shinjuku 09:00 · ticket saved offline | push | Travel days only, local time; ignores quiet hours | Never | Open ticket |
| Gap in the plan | Hakone still needs a bed | 7 sleeps to go · 1 night, Fri 17 Oct | push, in-app, email | T-14, T-7, T-2 · 10:00 local | All gaps in one | Open |
| Someone joined | Rin joined Japan in Autumn | Say hi, or give them a job | push, in-app | Immediate | "3 people joined" | Open |
| Booking saved | Shinkansen Hikari saved | Sat 18 · 11:12 · ticket works offline | in-app, email | Immediate · email to the booker only | Never | — |

Money is a shared pot: "Payment due" is about a booking in the pot, never about what one person owes another.

## In-app
- Bell = `components/trip/notification-bell.tsx` (restyled in `handoff/components/trip/notification-bell.tsx`). Popover on md+, full screen on mobile.
- Badge counts unread; shows "9+" above 9.
- Grouped by day (Today / Yesterday / weekday). Unread rows: card surface, 800 weight, coral dot.
- Payment-due rows carry inline "Mark paid" / "Later".

## Email
- Subject = push title. Preheader = push body.
- One button per email, verb first.
- Transactional only. Footer links to notification settings, not a global unsubscribe.
- Costs never in subject lines (shared inboxes).
- 600px max, works at 320px. Table layout, inline styles, system fonts, dark-mode safe.
- Templates: invite, magic-link, trip-reminder (T-7), booking-confirmed.
- From: `Teepee <hello@teepee.app>` (swap for the repo's configured sender).
