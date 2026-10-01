# Spec — Install nudge, approval email, Files as an index, tap-to-open ideas, Traveller details, sticky share column (2026-10-02)

**Status:** agreed in the grilling session, not yet built. Nothing is written
until Cam says go.
**Branch:** `feat/nudge-email-files-ideas-2026-10-02`. Target `main`.
Terminology follows `CONTEXT.md` (new terms this round: **Install nudge**,
**Traveller details**; **Attachment**, **Access request**, **Item** and **Share link** amended).

| Part | Contents | Closes |
|---|---|---|
| A | The Install nudge on Trips, phones only, plus a Help guide section | — |
| B | An email when an Admin approves an Access request; `lib/mail.ts` as the one Resend door | — |
| C | Files as the Trip's index: every row names and links to its owner; an Attachment title; Trip-level files can be linked to an Item | `Resolves-Feedback: cmupci300000004jp5c54md6u` |
| D | Tapping a thing to do under a Stop opens it | `Resolves-Feedback: cmup8xolg000004jtqvc2lfu7` |
| E | Traveller details on Account, read by fellow Travellers on Settings; a Contact details dial on Share links | — |
| F | The desktop share page's left column sticks beside the route list | — |
| G | Docs | — |

**Not in this round, already handled:** the Trip home card note
(`cmunprdsr000004l6da68grrp`) was fixed by `26f1e2e3` on the pushed `main`;
it closes with `feedback:resolve` once Cam confirms the deploy.

**Out of scope (decided):** re-showing the nudge after a while (dismissal is
forever per browser; Help is the way back); a desktop install nudge; any
email on Dismiss, or on Invite admission, or a resend button; a magic link in
the approval email; moving files between non-Trip targets, Globe Marker and
Journal files, bulk file actions; a long-press or info button on idea chips
(tap opens; the picker moves inside); deleting an idea from the new sheet;
passports, insurance or any identity document in Traveller details; bank
details, emergency contact or sign-in email on any Share link; encrypting
Traveller details at rest (they sit beside booking references, which are
not encrypted either — flagged, not built); capping or paginating the share
route list.

---

## A. The Install nudge (CONTEXT.md)

**Why.** The only install copy in the app is on Account under Devices, iPhone
only, and only when someone tries to enable the Digest. A new Traveller on a
phone is never told Teepee installs. Android gets nothing at all because
nothing captures `beforeinstallprompt`.

**What.**

- **Capture the Android prompt at app load.** `components/pwa-register.tsx`
  (mounted in the root layout) adds a `beforeinstallprompt` listener,
  `preventDefault()`s it, and stashes the event where the card can reach it
  (a small module in `lib/install-prompt.ts`: `captureInstallPrompt()`,
  `getInstallPrompt()`, `subscribe(cb)`), plus an `appinstalled` listener
  that clears it. Pure module, no React.
- **The card** (`components/trips/install-nudge.tsx`, client) renders on
  `/trips` directly under the What's new banner, **below the `md`
  breakpoint only**, when all of: not `isStandalone()`; not dismissed in this
  browser; and either `isIosWithoutInstall()` is true (iOS branch) or a
  captured install prompt exists (Android branch). Otherwise it renders
  nothing — including on desktop Chrome, which also fires the event.
- **Copy, exact.** Title `Put Teepee on your Home Screen`. Line `It opens
  like an app, keeps your trips with you offline, and on iPhone it's the only
  way the Digest can reach you.`
  - Android: a primary button `Install` that calls the stashed prompt's
    `prompt()`; on `accepted` the card goes (and `appinstalled` clears the
    prompt); on `dismissed` the prompt is spent (a browser prompt can be
    shown once), so the card goes for this page load and nothing is
    remembered — Chrome fires the event again next load and the nudge
    returns. A secondary `Not now` dismisses for good.
  - iPhone: the steps `Tap Share, then "Add to Home Screen", then open Teepee
    from there.` and one button `Got it` which dismisses.
- **Dismissal** is `localStorage` key `teepee:install-nudge` = `"dismissed"`,
  read and written inside try/catch; if storage is unavailable the card
  simply shows again next time. Per browser on purpose: this is about this
  browser, unlike What's new (ADR 0056), which is about the person.
- **Help guide section** in `lib/help-guide.ts`: id `home-screen`, title
  `Put Teepee on your Home Screen`, blurb `Install it from your phone's
  browser — and why an iPhone needs this for the Digest.`, group `advanced`,
  placed directly after the section about the Digest/Devices. Body in
  `components/trip/help-guide.tsx`: the Android line (Chrome offers Install;
  or menu → Add to Home screen) and the iPhone steps above, and that the
  nudge on Trips offers the same.

**Acceptance.**
- Phone viewport, iOS user agent, not standalone, not dismissed: the card
  with the iPhone steps and `Got it`; after `Got it`, gone, and gone on
  reload.
- Phone viewport, Android, a captured prompt: the card with `Install` and
  `Not now`; `Install` calls `prompt()`; a resolved `accepted` removes the
  card.
- Standalone (`display-mode: standalone` or `navigator.standalone`): no card.
- No captured prompt and not iOS: no card. `md` and up: hidden by CSS.
- `pwa-register` keeps its production-only service-worker registration; the
  install listener is registered in every environment (it is harmless in
  dev).
- `lib/help-guide.test.ts`'s guards pass with the new section; the help page
  renders it.

## B. The approval email

**Why.** Approving an Access request writes the allowlist row and nothing
else; the person finds out only by trying again. Cam approves from a phone
and the requester should be told.

**What.**

- **`lib/mail.ts`** — the one place the app talks to Resend:
  `mailConfigured(): boolean` (both `AUTH_RESEND_KEY` and `AUTH_RESEND_FROM`
  set) and `sendMail({ to, subject, html, text }): Promise<{ sent: boolean;
  error?: string }>`, which POSTs to `https://api.resend.com/emails` with the
  same headers and body shape `lib/auth.ts` uses today, and never throws.
  `lib/auth.ts`'s `sendVerificationRequest` calls it and **still throws** on
  `sent: false` (Auth.js needs the throw to report the failure).
- **`lib/approval-email.ts`** — pure, beside `lib/sign-in-email.ts`:
  `renderApprovalEmail({ email, signInUrl })` → `{ subject, html, text }`,
  same table-free branded shape as the Sign-in email. Copy, exact: subject
  `You're in: sign in to Teepee`; line `Your request to use Teepee was
  approved. Sign in with Google, or ask for a sign-in link, using this
  address: {email}`; button `Sign in` to `signInUrl` (= `siteUrl() + "/"`);
  the raw link for clients that strip buttons; footer `If you didn't ask for
  access to Teepee, you can ignore this email.`
- **`approveAccessRequest`** (`server/actions/access-requests.ts`): after the
  allowlist row and the `resolvedAt` stamp — never before — it sends the
  email to the request's address when `mailConfigured()`. The result gains
  `mailed: boolean` (`ok({ mailed })`). A send failure or an unconfigured
  deployment is `mailed: false`; the approval has already succeeded and is
  never rolled back. No email on Dismiss. Invite admission
  (`admitByTripInvite`) is untouched.
- **The panel** (`app/(app)/admin/access-requests.tsx`): on success with
  `mailed: true` it shows `Approved and emailed {email}.`; with
  `mailed: false` it shows `Approved. Couldn't email them, so tell them
  yourself.` The row leaves the list either way, as today.

**Acceptance.**
- With Resend configured and a 200 from the API: the row is written, the
  request resolved, `sendMail` called once with the request's email and the
  subject above, result `mailed: true`.
- API 500 or fetch rejection: row written, request resolved, `mailed:
  false`, no throw, one `console.error`.
- Resend not configured: no fetch at all, `mailed: false`.
- `dismissAccessRequest` never calls `sendMail`.
- The Sign-in link still sends through `sendMail` and still throws to
  Auth.js on failure (its existing tests pass).
- `lib/server-action-exports.test.ts`'s allowlist is unchanged (no new
  action).

## C. Files as the Trip's index

**Why.** Files already lists every Attachment on the Trip, grouped by what it
is attached to — but a row under "Stops" shows only the filename, not which
Stop, and offers no way there. Cam's note asks for a title and a link to an
Item; the grilling found the missing owner name is the real annoyance.

**What.**

- **Owner on every row.** The Files page resolves each non-Trip file's owner
  name and link in one loader (`lib/files-index-loader.ts`): a Stop → its
  name, linking to the Plan with that Stop open (`/plan#open=<stopId>`, the
  `lib/plan/plan-hash.ts` form); an Item → its title, linking to its Day when
  scheduled (`/day/<date>`) else to the Plan with its Stop open (a stop-less
  Wishlist idea links to `/wishlist`); Transport → `From → To` by its two
  Stops' names, linking to the Plan with the departing Stop open;
  Accommodation → its name, linking to the Plan with its Stop open; Journal
  → `Journal · {date}`, linking to `/journal`. An owner that no longer
  exists shows `(removed)` and no link. The row renders the owner as a line
  under the name: `{owner name}` as a link. `AttachmentView` gains optional
  `owner?: { label: string; href: string | null }` and `title?: string | null`.
- **Group label** `Activities` → `Things to do` (CONTEXT.md forbids
  "activity" for an Item).
- **Title.** Migration adds `Attachment.title String?`. Everywhere a file is
  named (both `AttachmentList` layouts, the Item card's attachments, the
  share page if it lists files — audit and say so), the title shows when set
  and the filename drops to the secondary line. On Files, every row gets a
  `Rename` control (pencil icon, `aria-label="Rename {name}"`) opening a
  small dialog with one `Title` field (max 120 chars); empty clears it.
  Action `setAttachmentTitle(id, title)` behind `requireTripAccess` (the
  file's `tripId`), lowercasing nothing, trimming, `null` for empty.
- **Link a Trip-level file to an Item.** Trip-level rows only get a `Link
  to…` control opening a dialog listing the Trip's Items grouped by Stop
  (the real plan's Stops in order; stop-less Wishlist ideas under
  `Wishlist`), plus `Trip-level (not linked)`. Choosing an Item sets
  `targetType: "ITEM", targetId`; choosing Trip-level sets `"TRIP"` with
  `targetId: null`. Action `linkAttachmentToItem(id, itemId | null)` behind
  `requireTripAccess`, refusing an Item that is not on this Trip. After
  linking, the file appears under `Things to do` with the Item as owner and
  on that Item's own attachments; the `Link to…` control appears on it there
  too (it is now an Item file that came from Trip-level — allow unlinking
  back to Trip-level only for files whose current target is ITEM; files
  uploaded on a Stop/Transport/Accommodation never show the control).
- **Both new actions** are added to `lib/server-action-exports.test.ts`'s
  allowlist for `attachments.ts`.

**Acceptance.**
- A file on Stop "Rome" shows `Rome` under its name, linking to
  `/trips/<ref>/plan#open=<romeId>`; a file on a scheduled Item links to
  that date's Day; an unscheduled Item file links to the Plan with its Stop
  open; a Transport file reads `Rome → Florence`; a removed owner reads
  `(removed)`.
- The heading reads `Things to do`, never `Activities`.
- Rename to `Hotel voucher` shows that as the name with the filename under
  it, on Files and on the owning Item; clearing restores the filename.
- A Trip-level file linked to Item "Colosseum" moves to `Things to do`,
  names `Colosseum`, and lists on that Item; unlinking returns it to
  Trip-level. Linking to an Item on another Trip fails.
- Non-members get `notFound()` from both actions.
- Migration applies on an empty and a populated table (`title` null).

## D. Tap-to-open ideas (CONTEXT.md **Item**, amended)

**Why.** Under a Stop in the plan editor an idea is a chip (desktop) or a
row (phone's stop sheet, Ideas tab); tapping it opens the day picker, or
nothing on a rough Stop. Xanthia tapped expecting to see what she had
written on the idea.

**What.**

- **`components/plan/idea-sheet.tsx`**: a `Sheet` below `md` and a `Dialog`
  from `md` (the same split the plan editor already makes between the
  phone's stop sheet and the desktop stop row), titled with the idea's
  title, hosting `ItemCard` in `wishlist` mode with the idea's full detail
  (category, notes, address, link, booking reference, photo, costs,
  attachments — whatever `ItemCard` renders for an `ItemCardItem`; no
  notes-thread/votes props). Two actions inside: **Pick a day** (the existing
  `DayPickerMenu`, only when the Stop has days; picking closes the sheet and
  calls the existing schedule handler) and **Edit** (opens the existing
  `ItemFormDialog` in edit mode via the existing `onEditItem` path).
- **Desktop `IdeasBox`**: a chip's tap opens the sheet for that idea. The
  chip's `aria-label` becomes `Open {title}`; the chevron goes (the picker is
  inside). The overflow "+N" behaviour is unchanged.
- **Phone stop sheet, Ideas tab**: tapping a row opens the sheet; the row's
  existing pick-a-day affordance moves inside it.
- `IdeasBox` and the stop sheet get an `onOpenIdea(idea)` prop; the
  itinerary manager owns the open idea state, the same way it owns
  `itemForm`.

**Acceptance.**
- Desktop: tapping an idea chip opens a dialog named after the idea showing
  its notes, link and booking reference; `Pick a day` inside offers the
  Stop's days and scheduling it closes the dialog and schedules the idea;
  `Edit` opens the item form pre-filled. On a rough Stop the dialog opens
  with no `Pick a day`.
- Phone (`< md`): the same as a sheet from the Ideas tab.
- The chip no longer opens the day picker directly (the old test that
  asserted `Pick a day for X` on the chip is rewritten, not deleted).
- Share links and the Wishlist are unchanged.

## E. Traveller details (CONTEXT.md)

**Why.** The people on a Trip have nowhere in the app to find each other's
number, an emergency contact, or where to send money for a shared cost;
and the people a Trip is shared with have no way to get in touch.

**What.**

- **Model.** New table `TravellerDetails` (`userId` unique → `User`,
  `mobile String?` (the home number), `emergencyName String?`,
  `emergencyPhone String?`, `bankDetails String?` (free text, up to 500
  chars), `updatedAt`), plus `TripMember.travelNumber String?` — the
  per-Trip number (eSIM / local SIM), on the membership row because it is
  one Traveller's number for one Trip. One migration covers both. Nothing
  else is held — no passport, no insurance, by decision.
- **Account → "Your details" card** (`components/account/traveller-details-card.tsx`),
  under the Admin queue card / You column: four fields with a short line
  under each — mobile `Fellow Travellers see this; a Share link only if its
  Contact details dial is on.`; emergency contact `Only the people on your
  Trips ever see this.`; bank details `For transfers between Travellers.
  Never on a Share link.` Saved by `saveTravellerDetails(input)` behind
  `requireUser`, upserting the viewer's own row only (zod: phone-ish strings
  up to 40 chars, names up to 80, bank text up to 500, all optional).
- **Trip Settings → Travellers.** Under the existing members list, each
  Traveller's details as filled in — `Mobile`, `Travel number`, `Emergency
  contact`, `Bank details` (fields left blank are omitted; a Traveller with
  nothing filled shows `No details yet`). Members only — it rides the
  existing `requireTripAccess` of the Settings page. The viewer's own row
  carries an inline `Travel number` field (saved by
  `saveTravelNumber(tripId, value)` behind `requireTripAccess`, writing only
  the viewer's own `TripMember` row, up to 40 chars, empty clears) with the
  line `The number you'll have on this trip — an eSIM or local SIM.`, and an
  `Edit on Account` link for the rest.
- **Share link dial.** `ShareLink.includeContacts Boolean @default(false)`,
  a sixth dial `Contact details` in `share-links-panel.tsx`, a Switch like
  the Journal and Show-who's-going dials, with helper copy `Each Traveller's
  phone numbers under their name — only with "Show who's going" on.` It is
  disabled (and treated as off) while `showTravellers` is off. The share
  hero shows, under each Traveller, `Mobile {home}` and `Travel number
  {travel}` for whichever are set, when both dials are on. The share query
  selects `mobile` and `travelNumber` only, and only when both dials are on
  (the floor stays structural, ADR 0051): sign-in email, emergency contact
  and bank details are never selected by the share lookup.

**Acceptance.**
- A Traveller saves a mobile and bank details on Account; a fellow
  Traveller sees both on that Trip's Settings; a non-member of the Trip
  cannot reach them; `saveTravellerDetails` for user A never touches B.
- A Traveller sets a travel number on one Trip's Settings; it shows there
  and not on another Trip; `saveTravelNumber` refuses a non-member.
- A Share link with Show who's going on and Contact details on shows the
  home mobile and the travel number under the name, each labelled, omitting
  whichever is blank; with Contact details off, or Show who's going off, it
  shows no number; the share lookup never selects `bankDetails`,
  `emergencyPhone`, `emergencyName` or `email` (asserted on the select).
- Existing links have `includeContacts: false` after the migration.
- The share-style-bans and share-motion tests still pass.

## F. Sticky left column on the desktop share page

**Why.** `app/share/[token]/page.tsx` lays sections into a `7fr_5fr` grid
by stage. Before departure the hero sits left of the route list; during
and after, the map (400px) does. The route list grows with the Trip and the
left item does not, so a long route leaves a void under it.

**What.** The left-column section that shares a row with the route list —
`hero` in `before`, `map` in `during` and `after` — gets `lg:sticky lg:top-6
lg:self-start` via `PLACEMENT`, so it pins to the viewport top and stays in
view while the route scrolls beside it. Nothing changes below `lg`. The
reveal animation (`ShareReveal`) must not break stickiness (a transform on
the sticky ancestor would): verify the sticky class sits on the grid cell,
not inside the reveal wrapper.

**Acceptance.**
- In each stage the named left section's cell carries the sticky classes
  (page test on `PLACEMENT`); no other section does.
- Below `lg` the classes are inert (prefixed), so phone and tablet are
  unchanged.
- Manual: on Christmas in Europe's share page at desktop width, the map
  stays in view while the route list scrolls.

## G. Docs

- `CONTEXT.md`: **Install nudge** and **Traveller details** added;
  **Attachment**, **Access request**, **Item** and **Share link** amended —
  done in the grilling session.
- `lib/admin-notify.ts`: the sentence "TEEPEE has no mail dependency of any
  kind (ADRs 0047, 0050)" is now false; amend to say the app sends mail only
  through `lib/mail.ts` (Sign-in links and approval emails) and that
  operator notifications stay on push.
- ADR 0057: a short amendment — approval now emails the address (and why
  Dismiss never does; why the button goes to the Landing and not a minted
  link). ADR 0051: a short amendment — the Contact details dial (mobile
  only, gated on Show who's going) and the floor's three new entries
  (sign-in email stays on it, emergency contact and bank details join it).
  No new ADR.
- `docs/resendDeploy.md`: one line that the approval email also needs the
  two vars.
- Commit trailers: Part C's commit `Resolves-Feedback: cmupci300000004jp5c54md6u`;
  Part D's commit `Resolves-Feedback: cmup8xolg000004jtqvc2lfu7`. Neither
  note is resolved on the branch; both close after deploy.
- `docs/feedback/inbox.md` (refreshed after Cam accepted Xanthia's note) is
  committed on the branch with the first commit.

---

## Tests

Extend sibling tests where they exist; one test file per new module
(`lib/install-prompt`, `lib/mail`, `lib/approval-email`,
`lib/files-index-loader`, `components/trips/install-nudge`,
`components/plan/idea-sheet`, `components/account/traveller-details-card`). Nothing beyond what the acceptance lines
need.
