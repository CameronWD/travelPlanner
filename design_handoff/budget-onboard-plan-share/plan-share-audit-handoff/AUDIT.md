# Page audit and the shared `<PageHeader>`

Every route in `app/` was checked against the current standard (the Trips, Home, Day, Money and New trip redesigns). The findings come from the page code at the time of the audit. The board is `images/page-audit.png`, or `#audit` in the reference mock.

**Build `<PageHeader>` first** (§1). About half of the fixes below are then a one-line swap.

---

## 1. `<PageHeader>` (new, Server Component)

`components/ui/page-header.tsx`

```tsx
interface PageHeaderProps {
  eyebrow?: React.ReactNode;   // e.g. trip name + year. Omit on account-level pages.
  title: string;               // "Money", "Plan", "Checklists"…
  meta?: React.ReactNode;      // one line: "6 stops · 1 rough · Fri 4 Dec – Fri 8 Jan"
  actions?: React.ReactNode;   // right-aligned pills; primary last
  as?: "h1" | "h2";            // default "h1" — see heading note below
}
```

**Desktop:** `flex items-end gap-4`, with the text block `flex-1 min-w-0`.
- **eyebrow:** `text-[15px] font-medium text-muted-foreground`
- **title:** `font-display text-4xl` (40px), `font-extrabold leading-[1.05] tracking-[-0.02em] mt-0.5`
- **meta:** `mt-1.5 text-[15px] font-semibold text-foreground/80`
- **actions:** `flex gap-2.5 items-center`, each a 44px pill. Outline pills first, the ink primary (`shadow-cta`) last.

**Mobile:**
- eyebrow `text-sm`; title `text-[32px]`; the meta line is hidden unless `meta` is marked `showOnMobile`.
- Actions collapse to **one** 44px round ink button: the primary action's icon, e.g. `Plus`. Secondary actions move to the page's own ⋯ menu, or they're dropped if they're already reachable elsewhere.

**Heading level:**
- Trip pages currently render the trip name as the layout's `<h1>`, and pages use `<h2>`. The eyebrow now carries the trip name, so the layout should **stop** rendering a visible `<h1>`, and each page's `PageHeader` renders the `<h1>`.
- Update the "tops out at h2" tests in `help/page.test.tsx` and `more/page.test.tsx` to expect an h1.
- If that change is too wide in one PR, ship it with `as="h2"` first and switch later.

**Replace these hand-rolled classes and headings:**
- `CHECKLISTS_TITLE_CLASS`
- `FILES_TITLE_CLASS`
- `COMPARE_TITLE_CLASS`
- the Activity, Journal, More, Account and What's new title markup
- the settings `text-2xl font-bold` heading
- the `sr-only` headings on Money and Summary

Delete the exported class constants and update the tests that import them.

---

## 2. Findings and fixes, by priority

### Designing now (this handoff)
| Page | Found | Fix |
|---|---|---|
| **Plan** `/trips/[id]/plan` | It still uses the old soft styles (`shadow-soft`, 1px borders, `bg-card/40`) in stop-card, transport-card, accommodation-card, home-base-card, plan-overview and plan-stops-nav. The overview is a muted row of icon stats. Every stop is fully open. | `PLAN.md` |
| **Share** `/share/[token]` | It shows viewers a "Money · hidden" card. There's no sense of whose trip it is. The day grid is hard to scan. A non-user has nothing to do next. | `SHARE.md` |

### Needs a pass (redesign-level; not specified in detail here)
| Page | Found in code | Direction |
|---|---|---|
| **Summary** `/trips/[id]/summary` | The biggest page in the repo (31 KB). The only heading is `sr-only`, so there's no visible title. It's the page people share after a trip. | **Next priority.** Use PageHeader, cut the cards down the way Money was cut, reuse the Tally and route-sketch cover, and match the Share page's After stage so the two tell the same story. |
| **Trip settings** `/trips/[id]/settings` | Seven stacked cards: Trip details, Chapters, Travellers, Digest, Calendar feed, Driving estimates and Danger zone. The heading is `text-2xl font-bold`, which is off the type scale. | PageHeader. Desktop gets a left section index (sticky, same style as Plan's jump list) with one column of sections. **Trip details** reuses New trip's pieces: the date range calendar, the currency row and the cover polaroid. **Share links** gets the new "Show who's going" switch and a small live thumbnail of the share hero. Danger zone stays last, with a `border-coral-text` border. |
| **Calendar** `/trips/[id]/calendar` | No page header. The empty states say "No Stops yet" (capital S), and both CTAs read "Go to Plan". | PageHeader, with the Month/List segmented control as its action. Empty states in sentence case: "No stops yet", with a CTA **Add a stop** that opens the Plan add-stop sheet. With no dates, the CTA is **Set dates** (trip settings). |
| **Checklists** `/trips/[id]/checklists` | The third tab, "Booking parser", is an AI importer, not a checklist. The reminders card sits above the tabs. | Remove the tab; the parser now lives in Plan ("Paste a booking") and in the transport sheet. That leaves two tabs, **Pre-trip** and **Packing**, with counts. The Reminders card stays but is restyled to the 2px/hard-shadow card. PageHeader meta: "4 to do · 12 packed of 30". |

### Light touch
| Page | Found | Fix |
|---|---|---|
| **Wishlist** | Everything is rendered inside `WishlistBoard`, so the header, Add from Globe and the suggestions sit in the board's own markup. | Pull the header out into PageHeader, with the actions **Add from Globe** (outline) and **+ Add an idea** (ink). Check that the board cards use 2px borders and hard shadows; its tests already ban `shadow-soft`. |
| **Globe** | Now where the past-trip flow ends ("Added to your map"), but there's no arrival state. | On arrival from New trip past mode (`?added=<tripId>`): fly the camera to fit the new pins, the pins pop in with a 60ms stagger (`tp-pop`), then the toast "Added to your map · {n} places". Remove the param from the URL after it plays. |
| **Journal** | In good shape: day cards, avatars, photos per author. The title uses its own class. | PageHeader, with meta "{n} entries · {n} photos". |
| **Files · Activity · Compare** | Each has its own copy of the same 28px title class, plus a small grey count line. | PageHeader. Meta: "{n} files", "Last {n} changes" (Activity is capped at 100, so say so), and "{n} plans". |

### Leave
| Page | Note |
|---|---|
| More · Account · What's new · Help | Already consistent with the kit. Optional: a hue and lucide icon on each More tile. |
| Print | A separate paper format with its own H2 classes. Leave it for now. |
| Trips, Home, Day, Money, New trip, admin, legal, not-found, error | Done in earlier handoffs and Gap Specs. |

---

## 3. Suggested PR sequence
1. `PageHeader` + the swap across Files, Activity, Compare, Journal and More (mechanical).
2. Plan (`PLAN.md`), which also removes the Checklists booking-parser tab.
3. Share (`SHARE.md`) + the migrations.
4. Calendar and Wishlist headers + empty-state copy.
5. Settings, then Summary: redesign both, in that order, before building.
6. Globe arrival state.
