# Spec — Admin queue: a passive signal that something is waiting in /admin (2026-10-02)

**Status:** agreed in the grilling session, not yet built. Nothing is written
until Cam says go.
**Branch:** `feat/admin-queue-2026-10-02`. Target `main`.
Terminology follows `CONTEXT.md` (new term this round: **Admin queue**; the
**Admin** entry amended to mention it).

**The problem.** Cam signed up with a test address through the Sign-in link
field and nothing told him. By design: a typed address never pushes (ADR
0057), the only in-app signal is a badge on the Admin row *inside* the avatar
dropdown, and a Needs-review Feedback note has no in-app admin surface at all.
The operator learns nothing unless he opens a menu he had no reason to open.

**The decision.** A passive signal, not an interruption. Nothing about pushes
changes. The Admin sees a dot on every signed-in page while the Admin queue is
non-empty, an Account card saying what is in it, and a read-only list of the
Needs-review notes on `/admin`.

| Part | Contents |
|---|---|
| A | The Admin queue: what counts, where the count comes from |
| B | The dot: avatar triggers and the phone You tab |
| C | The Account card |
| D | `/admin`: a read-only "Feedback needing review" section |
| E | Docs |

**Out of scope (decided):** any change to `notifyAdmins` or to which paths
push (the email-path refusal stays silent, ADR 0057); an Admin line in the
Digest; a "seen" state for the dot; Errors in the queue; in-app Accept or
Decline for Feedback notes (the two scripts stay the only writers of Feedback
status); showing a Needs-review chip on other people's notes in the in-app
Feedback panel (possible follow-up, not this); any change to `/trips` itself;
email of any kind.

---

## A. The Admin queue

**What counts.** Two queries, summed:

- Pending **Access requests**: `AccessRequest` rows with `resolvedAt IS NULL`
  — the same predicate `listAccessRequests` already uses (never `status`,
  for the reason its doc comment gives).
- **Feedback notes needing review**: `FeedbackNote` rows with
  `status = "NEEDS_REVIEW"`, from **every site** (beta and main share the
  database; a note is waiting whichever site it was written on).

**What does not count.** `ErrorReport` rows. They keep their own push for
server-side errors and their own count badge on `/admin`.

**Queue-based, not seen-based.** The dot is lit while the sum is above zero
and goes out only when the queue empties — approve, dismiss, accept or
decline. There is no "last looked" timestamp, nothing new is stored, and
visiting `/admin` changes nothing. (A note read on the phone but accepted at
the next terminal session keeps the dot lit until then; accepted.)

**Where the count comes from.** `app/(app)/layout.tsx` already computes
`pendingAccessRequests` for an Admin and hands it down through `ShellUser`
(`components/shell/shell-user.tsx`). It gains the Needs-review count the same
way, as one cheap `count` query, Admins only — a non-Admin pays nothing. The
shape is the plan's call; the one rule is that the avatar, the You tab, the
menu badge and the Account card all read the same numbers from the same
place, so they can never disagree with each other.

**Acceptance.**
- A non-Admin's `ShellUser` carries zero for both and triggers no query.
- An Admin with one pending Access request and one Needs-review note (on
  either site) has a queue of two.
- A note at `OPEN`, `DONE` or `WONTFIX` is not counted; a resolved Access
  request (approved or dismissed) is not counted.

## B. The dot

**Where.** On the avatar wherever it opens the account menu, and on the You
tab where there is no avatar:

| Shell | Element | File |
|---|---|---|
| Phone, inside a Trip | the top-bar avatar trigger | `app/(app)/layout.tsx` |
| Phone, outside a Trip | the **You** tab in the tab bar | `components/shell/app-tab-bar.tsx` |
| Dock (768–1279px) | the avatar trigger | `components/shell/dock-extras.tsx` |
| Sidebar (≥1280px) | the footer avatar trigger | `components/shell/sidebar-footer.tsx` |

The Dock and the rail also carry a "You" entry beside the avatar; the dot
goes on the **avatar** there, not on You, so nothing is marked twice. Trip
member avatars in the Trip header are not triggers and never get a dot.

**How it looks.** A small filled dot, no number, in the existing destructive
token (the colour the Admin-row badge already uses), sitting on the avatar's
top-right edge and on the You tab's icon the same way. It must not be clipped
by the 44px hit box or by the tab bar. Admins only; a non-Admin never renders
it. Zero in the queue: no dot, no empty ring, nothing.

**The menu badge.** The Admin row's badge inside the account menu
(`components/shell/account-menu.tsx`) now shows the **combined** count, with
the same `9+` cap, and its `aria-label` says what is waiting ("1 access
request and 1 feedback note waiting", singular/plural handled).

**Accessibility.** The dot itself is decorative (`aria-hidden`); the trigger
or tab it sits on carries the meaning in its accessible name — "Open
traveller menu, 2 waiting in Admin" / "You, 2 waiting in Admin" — only when
the queue is non-empty, so the unlit name is unchanged.

**Acceptance.**
- Admin, queue of 2, on a phone at `/trips`: a dot on the You tab. Inside a
  Trip on a phone: a dot on the top-bar avatar. At the Dock and Sidebar
  widths: a dot on the avatar, none on the You entry.
- Admin, queue of 0: no dot anywhere; the Admin row shows no badge.
- Non-Admin, regardless of database state: no dot, no Admin row.
- The menu badge reads the sum, capped at `9+`.

## C. The Account card

**What.** An Admins-only card on the Account page (`app/(app)/account/page.tsx`),
placed directly under the **You** card, titled **Admin queue**. It lists what
is waiting, one line per kind, and links to `/admin`:

> **Admin queue**
> 1 Access request waiting
> 1 Feedback note needs review
> → Open Admin

Empty queue: the card still renders for an Admin with one line, "Nothing
waiting.", and the same link — so the You tab's dot always lands on a card
that explains itself, and Account always has a way to Admin. A non-Admin
never sees the card.

Counts come from the same place as §A (the page is under the app layout and
can read `ShellUser`, or run the same two queries; either way the numbers are
the §A numbers).

**Acceptance.**
- Admin: the card is present under You, with the right lines and pluralised
  nouns ("2 Access requests waiting"); a line whose count is zero is omitted
  unless both are zero, in which case "Nothing waiting."
- Non-Admin: no card, and no Admin query.

## D. `/admin`: Feedback needing review

**What.** A new section on `app/(app)/admin/page.tsx` titled **Feedback
needing review**, with a count badge, placed **second** — after Access
requests, before Who can sign in — because both are queues of people waiting,
and the allowlist is not. Hint text on the heading row: "Accept or decline
from the terminal".

**Read-only.** Each Needs-review note shows, in the inbox's own order
(oldest first): author display name, page label and Trip name where present,
a site chip when the note's site differs from the current site (reuse the
rule `toView` already applies), the body, how long ago, and the note's **id**
in a monospace span so Cam can copy it. No Accept, no Decline, no Delete.

**Data.** A new server action in `server/actions/feedback.ts`,
`listFeedbackNeedingReview()`, behind `requireAdmin()`, filtering on
`status = "NEEDS_REVIEW"` across all sites. It must not go through `toView`'s
status mapping (which renames Needs-review to Open for the author's panel);
the list is defined by the query, so the view needs no status at all.

**Empty state.** "No Feedback notes waiting for review."

**Acceptance.**
- Two Needs-review notes, one per site, viewed on main: both listed, the
  beta one with a "Beta" chip, the main one with none; the heading badge
  shows 2.
- An `OPEN` note by a non-Admin is not listed.
- The section is read-only: no action buttons render, and the page's
  server actions for Feedback are unchanged apart from the new list.
- `requireAdmin()` guards the action, as every other `/admin` action is.

## E. Docs

- `CONTEXT.md`: **Admin queue** added, **Admin** amended — done in the
  grilling session.
- No ADR. The only real trade-off (passive over push) is already ADR 0057's
  and the accepted trade-off comment in `lib/admin-notify.ts`; queue-over-seen
  and errors-excluded are recorded above and are cheap to reverse.
- `lib/admin-notify.ts`'s doc comment says "The /admin badge is the source of
  truth; this push is only the prompt" — amend the sentence to name the Admin
  queue (dot, Account card, `/admin`) so it stays true.
- `CLAUDE.md`'s feedback section is unchanged: Needs-review notes are still
  accepted or declined only by the two scripts.

---

## Tests

Where a sibling test already exists, extend it rather than adding a file:
`app/(app)/layout.test.tsx` for the count and the dot on the phone trigger;
the account-menu badge; the tab bar's You tab. One render test for the new
`/admin` section (listed / empty / read-only). Nothing beyond that.
