# Spec — Claude connection fixes (Feedback batch, 2026-10-16)

**Status:** **Built** on `feat/feedback-tz-enddate-review` (2026-10-16);
awaiting Cam's review, merge and deploy. On deploy, resolve
`cmva4jnfk003l07lfhfbs92wb`, `cmvaecnl8000307l3wutowp1t` and
`cmvaifznz000t07gwfwee8lfp` (trailers in git), and
`cmvaigdfq000w07gw9um2kpjj` with a thank-you.

**Closes (Main):** `cmva4jnfk003l07lfhfbs92wb` (home timezone, end date,
home-end times), `cmvaecnl8000307l3wutowp1t` (Notes through Claude),
`cmvaifznz000t07gwfwee8lfp` (notes model, write confirmations, narrow reads,
Reminder notes and links). The commit that completes each carries
`Resolves-Feedback: <id>`; each is resolved only once the branch is live on
main. `cmvaigdfq000w07gw9um2kpjj` (what's working well) needs no work — after
deploy it is resolved with a thank-you Resolution.

**Deferred, each to its own grill:** `cmva5yfw4000007lawnx4y88x` (AI Review
trip — design together with opening hours, item 8 of `cmvaig9lq…`),
`cmvaig4j5000u07gwgeqrvtkd` (booking status, tentative Transport, ticket
details), `cmvaig9lq000v07gwt50bn7k0` items 9–10 (changeover days, checklists
inside Items). They stay open in the inbox.

Also folded in: `TU-01`, `TU-02` (`docs/open-follow-ups.md`).

## Decisions from the grilling

| # | Decision |
|---|---|
| F1 | Scope split as above. |
| F2 | **Notes:** keep both concepts — a **Note** (comment to the other Traveller) and an Item's own notes (its description). A Note is never edited; it is deleted and, if need be, said again (CONTEXT.md **Note**). New MCP tool `delete_note` over the existing `deleteNote` action, with the confirm-first wording the other delete tools use. `add_note` returns the new Note (id, body, target). Tool descriptions for `add_note`, `get_notes`, `delete_note` and `update_thing_to_do` spell out the difference. No `update_note`, no app UI change. |
| F3 | **Default timezone from the point.** Add `@photostructure/tz-lookup` (CC0, offline). One rule, in `stopTimezone` and its Home-base twin: a zone the Traveller chose wins; else the zone at the geocoded point; else the country's zone; else UTC. The server always resolves; the Stop form `import()`s the lookup lazily only when a place is picked, so no main bundle grows. `create_trip` accepts `homeTimezone`. |
| F4 | **Soft end date follows the plan home.** It is the later of the last scheduled Stop's depart and the **return** leg's arrival date in the Home base's zone (CONTEXT.md **Trip**, **Hard end date**). One helper grows `Trip.endDate` and is called by every action that dates or re-dates a Stop or a Home-bound leg (app and Claude). It never shrinks on its own and raises no Flag. Hard end date untouched (ADR 0068). |
| F5 | **Home timezone change keeps local times.** When `homeTimezone` changes (Settings or `update_trip`), every Home-end departure/arrival on the Trip — real plan and Forks — keeps its shown local wall-clock time and its instant is recomputed in the new zone. The Activity entry says so; the tool description says so. ADR 0030 gets an amendment. |
| F6 | **Writes return the row.** Every MCP write tool returns the row as it now stands, re-read through the same Surprise-aware reader the narrow reads use (F7). Deletes return `{ deleted: <id> }`; bulk tools return the rows they changed. Done in the tool layer; app actions keep `ActionResult` (ADR 0074). A test walks every registered write tool and fails on a `{}` result. |
| F7 | **Narrow reads:** `get_stop(stopId)` (Stop + Accommodation + its Items + Day titles), `get_item(itemId)` (Item + Costs + Notes + attachment list), `get_transport(transportId)` (+ Costs), `get_accommodation(accommodationId)` (+ Costs), `get_day(tripId, date)` (built on `readDayRows`/`buildDayModel`, so it equals the Day view). Real-plan only; Surprise as the app. Each shape equals that entity's slice of `get_trip_plan`. |
| F8 | **Reminders:** optional **notes** (shown in the app, folded on Home, never read out in the Digest). "About" extends from a Stop to one Stop *or* one Item *or* one Transport leg — never several; the thing's card lists the Reminder; deleting it leaves the Reminder about nothing; a Surprise thing hides the Reminder like a Surprise Stop does. Schema: `Reminder.itemId`, `Reminder.transportId`, `Reminder.notes`, plus a check that at most one of `stopId`/`itemId`/`transportId` is set (migration). App: the Reminder dialog gains notes and an "about" picker; `add_reminder` / `update_reminder` gain the fields. |
| F9 | **TU-01:** "Set dates now" switched off on an edit clears a dated Chapter's dates — it becomes a **rough** Chapter; its dated Stops stay dated and simply stop being members; the form warns "This Chapter will no longer group its dated stops." **TU-02:** a patch that re-locates a Stop and sends no timezone re-derives the zone from the new point (F3). |

## Branch rules

Never commit to, merge into, rebase onto or push `main`; never deploy; never
run `feedback:resolve`; subagents never run `feedback:pull`; don't commit
`next dev`'s CLAUDE.md block. Integration tier and `next build` in this
sandbox: see the session's sandbox notes (throwaway Postgres on localhost;
build in a copy without `.env.production.local`).

## Bugs and behaviour changes a Traveller sees

- A Home base or Stop in a multi-zone country gets the right zone
  (Brisbane → `Australia/Brisbane`, Perth → `Australia/Perth`).
- A Trip's dated views run to the day the return leg lands.
- Fixing a Home timezone no longer shifts the times you typed.
- Reminders can carry notes and be about an Item or Transport leg.
- A Chapter's dates can be switched off on an edit.

## Out of scope

Everything deferred above; `update_note`; shrinking the soft end date; a Flag
for trailing empty days; multi-target Reminders; reading Reminder notes in the
Digest.

## As built (2026-10-16)

Built as tasks A.1–F.18 plus the batch gate (Z), 2026-10-16/17. One line per
decision taken where this spec was silent, and every deviation an implementer
reported. Follow-ups found on the way are `CF-01`–`CF-05` in
`docs/open-follow-ups.md`.

### What a Traveller sees

- A Home base or Stop picked from a place gets the zone at that point
  (Brisbane → `Australia/Brisbane`, Perth → `Australia/Perth`); the Stop form
  shows the country's zone at once, then the point's zone a moment later.
- **A Home base rename re-derives its zone** from the new point (Gold Coast →
  Sydney moves `Australia/Brisbane` → `Australia/Sydney`); a zone chosen in
  the same save still wins. This reverses ADR 0030's "a hand-picked zone
  survives a rename within the same country" (ADR 0030 amended 2026-10-16).
- A Stop re-located by Claude without a zone takes the new place's zone (TU-02).
- A typed, unpicked place still previews (and saves) its country's zone; the
  Traveller can change it.
- The Trip window grows to the day the return leg lands, read in the Home
  base's zone, from every write that dates a Stop or a leg (app and Claude).
  It never shrinks on its own, raises no Flag, and a date-less Trip stays
  date-less.
- **Forks no longer grow the Trip window.** Re-dating a Fork Stop, firming up
  a Fork or adding a Fork leg leaves the real Trip's dates alone (before, it
  could leave empty trailing days); promoting the Fork grows it then.
  Firming up a Fork no longer gives a date-less Trip a start date.
- **The trip header's date range refreshes when the end grows** (before, it
  stayed stale until a reload).
- Changing the Home timezone keeps every Home-end time at the local time it
  shows, in the real plan and every Fork, and the Activity feed says
  "changed the Home timezone to Australia/Brisbane; Home-end times kept as
  local times". Re-saving the same zone does nothing.
- Switching "Set dates now" off on a dated Chapter's edit makes it rough and
  it stays rough; its dated Stops keep their dates and leave the Chapter. The
  form warns "This Chapter will no longer group its dated stops."
- Reminders can carry notes, shown folded with a chevron ("Notes", tap to
  open) on Home's Reminders card, the desktop "Sort these out" row, the
  Checklists page and every Stop / Item / Transport Reminder list. The Digest
  still reads the title alone.
- A Reminder can be about one Stop, one thing to do or one Transport leg;
  its chip names it (a leg reads like "Train Paris → Lyon").
- The Checklists page's Reminders card has an About picker (real-plan Stops,
  Items and legs, minus anything hidden from the viewer). Home's card still
  has no picker.
- The plan editor's Item and Transport edit dialogs list their Reminders and
  offer "Add a reminder" (real plan only). The Day view's and Wishlist's
  Item dialogs are unchanged.
- **Reminders about hidden Items are hidden**: a Reminder about a Surprise
  Item, or about an Item inside a Surprise Stop, is hidden from the
  surprised Traveller wherever it surfaces (Home, Claude, the Item's card,
  the Digest). A Reminder about a Transport leg is never hidden.
- Deleting the thing a Reminder is about leaves the Reminder about nothing.
- Today, Day and the other dated views are otherwise unchanged.

### What Claude sees

- `create_trip` takes `homeTimezone`; `update_trip`'s description says a
  Home timezone change keeps Home-end local times.
- New narrow reads `get_stop`, `get_item`, `get_transport`,
  `get_accommodation`, `get_day`, each equal to its slice of
  `get_trip_plan` (real plan only, Surprise as the app).
- **`get_day` refuses dates outside the Trip** with a tool error naming the
  Trip's range (the Day view clamps instead). A date-less Trip, or one with a
  start but no end, is also a tool error; a malformed date is a schema error.
- Every write returns the row as it now stands; no write returns `{}`
  (walker test over all write tools).
- New `delete_note`; `add_note` returns the Note.
- `add_reminder` / `update_reminder` take `notes`, `itemId`, `transportId`;
  more than one about id is refused before any lookup.

### Decisions where the spec was silent

**A — F3 point-based zone, `create_trip` homeTimezone, TU-02**
- `stopTimezone` stays pure and client-safe, taking a precomputed `pointZone`; the lookup lives only in `lib/tz-point.ts`.
- `lib/tz-point.ts` holds the only import of `@photostructure/tz-lookup`; client code must `import()` it (static import from `components/**`/`app/**` is an ESLint error).
- An `Etc/*` result (at sea), an invalid zone or bad coordinates count as "no point zone"; the country decides.
- For a Home base an explicit `"UTC"` is a real choice; only `""` is unchosen. For Stops `"UTC"` still means unchosen (`UNCHOSEN_TIMEZONE`).
- A Home base rename re-derives the zone from the new point; if neither point nor country gives a zone, the zone is kept when the country is unchanged and cleared when it changed.
- `add_stop` and the mobile add-stop sheet send `UNCHOSEN_TIMEZONE`, so the server resolves from the point; only the Stop form dialog previews a zone.
- Typed, unpicked places keep the country preview and send it (no "guessed vs chosen" flag).
- `mergeStopPatch` sends `UNCHOSEN_TIMEZONE` when a patch says where without a zone, and on a first scheduling with no stored zone; `updateStop` resolves from the final point.
- `updateTrip` folds a same-as-stored zone into `KEEP_TIMEZONE`, so "zone changed" ⇔ `timezoneUpdate !== KEEP_TIMEZONE` (orchestrator request, for C).
- `@photostructure/tz-lookup` pinned exactly at `11.7.0`.
- Not changed, filed as follow-ups: `firmUpTrip`/rough flow zone (`CF-01`), Booking import country zone (`CF-02`), rough append drops lat/lng (`CF-03`).

**B — F4 soft end date**
- Real plan only: `growTripEndTx(tx, tripId, plan)` does nothing for a Fork; `promoteFork` grows after the retag.
- Promoting a Fork on a date-less Trip sets `startDate` from the promoted plan's earliest arrive date, so its dated Stops get a window (B.3 ruling, built in B.6).
- The return leg is every real-plan leg with an `arrAt` that is Home-bound or matches `findReturnLeg`'s shape; the latest landing wins.
- The landing date is read in `resolveEndpointZones(...).arrTz`, the zone the leg card shows.
- Never shrinks, race-safe: guarded `updateMany` (`endDate` null or earlier).
- No Activity entry, no Flag; `hardEndDate` untouched (ADR 0068).
- A grow adds the `"trip"` revalidation scope (`tripWindowScopes`), refreshing the header and `/trips`.
- Transport writes are not wrapped in a new transaction; the helper runs on `db` after the write.
- `updateTrip` does not grow on an explicit date edit (pulling the end in is the Traveller's call).

**C — F5 Home timezone change**
- Every end whose resolved zone changes is re-filed (via `resolveEndpointZones`), including a non-Home end with no Stop that borrowed the Home zone.
- null → zone and zone → null use the same rule (fallback zone ↔ new zone).
- Covers the real plan and every Fork (no `forkId` filter).
- Null ends are skipped; seconds are dropped (minute precision everywhere).
- A DST-gap local time lands where `zonedWallTimeToInstant` puts it (02:30 → 03:30).
- One trip-level Activity line (`UPDATED`, `TRANSPORT`, label "Home timezone"); the "Home-end times kept as local times" clause only when at least one end moved.
- Re-sending the same zone does nothing; re-file fires exactly when `timezoneUpdate !== KEEP_TIMEZONE`.
- After the re-file the same transaction calls `growTripEndTx(tx, tripId, null)` (the landing may read differently in the new zone); the case where the same save also pulls `endDate` in is `CF-04`.
- CONTEXT.md **Home base** gains a clause; ADR 0030 gains a second 2026-10-16 amendment.

**D — F9 TU-01**
- `updateChapter`'s clearing case also unlinks the Chapter's dated Stops (`chapterId: null`) under `lockPlanStopsTx`, so `recomputeChapterSpans` cannot re-date it; rough members stay.
- The warning shows only when editing a Chapter that currently has dates.
- One UPDATED CHAPTER Activity row; the Stop unlinks record none.

**E — F8 Reminders**
- At most one about id, enforced by a Postgres CHECK (`Reminder_about_one_thing_check`), `reminderSchema.refine` and the MCP tools.
- An update naming any about key replaces the whole about (`replaceAbout`); `null` on the held key makes it about the Trip.
- Surprise hides Reminders about Stops and Items only; Transport is outside every Surprise.
- Item and Transport about-rows must be real-plan (`forkId: null`); the Stop check is unchanged.
- Notes: up to 2000 characters, trimmed, empty clears; folded in a native `<details>` with a chevron (E.6 ruling) everywhere a Reminder renders.
- The About picker lives on `RemindersCard`'s add form where the page passes options (Checklists); `AddReminderDialog` keeps a fixed about and gains Notes.
- "The thing's card lists the Reminder": the Stop's existing links, and a Reminders field in the plan editor's Item and Transport edit dialogs.
- Activity diff key `stopName` → `about`, plus `notes`.
- The leg label is `"<Mode> <from> → <to>"`, computed at read time.
- `ReminderItem`, `REMINDER_ITEM_SELECT` and `toReminderItem` live in `lib/reminder-about.ts`.
- Migration `20261016120000_reminder_notes_and_about`.

**F — F7 narrow reads, F6 writes return the row, F2 `delete_note`**
- A write returns an object keyed by entity (`{ stop }`, `{ item }`, …); bulk writes return lists; deletes `{ deleted: <id> }`.
- Stop-dating writes return `{ stop, shifted }` (+ `conflicts` when any); `firm_up_trip` and Make it fit trims return `{ stops }`; Undo payloads are dropped.
- Read-backs of rippled Stops show a hidden Surprise Stop as get_trip_plan's shell, never "Not found"; a direct narrow read of a hidden row is not found.
- `get_item` names the Notes on it `notesOnItem`, so `notes` keeps meaning the Item's description.
- `get_day` shape `{ date, dayNumber, totalDays, dayTitle, stop, travelDay, tonight, timeline, anytime }`, ordered as the Day view.
- Narrow-read Costs follow `list_costs`' order (F.4 ruling).
- Per-tool return shapes for votes, Day titles, schedule/unschedule, templates, checklist moves, Surprises and Trip writes as in section F's notes.
- `addNote`, `createChapter`, `addChecklistItem` and `addMarkerToWishlist` gain `id` on success (still `ActionResult`).
- `runWrite`: if the write commits but the re-read throws, the tool reports success with `saved: true` and a `readBack` hint rather than a failure, so Claude does not retry a committed write (F.9 ruling).
- Votes read back in `createdAt` order through a shared select.
- The "no `{}`" walker lists tools over a real in-memory MCP client; a write tool missing from its table fails the test.

### Deviations implementers reported

- A.7–A.8: the same-as-stored zone normalisation in `updateTrip` (added at the orchestrator's request).
- A.9: the brief's `getByText("Brisbane (AEST)")` matched Radix's hidden native option too; the test queries the visible combobox instead.
- B.4: a test fixture needed `name` to pass `mergeStopPatch`'s schema.
- B.6: `grownTo` became `windowMovedTo` (a start write without an end grow still refreshes the header); "first scheduled arrive" reads as the earliest `arriveDate`.
- D.1: `chapterSortOrder` is cleared to `0`, not `null` (the column is not nullable).
- E.1: `prisma format` was run once by mistake and reverted; only the three models changed.
- E.2: `replaceAbout`'s signature widened to `P extends object` to pass `tsc` (behaviour unchanged).
- E.4–E.5, E.10: page-test mocks rewritten around `readRemindersAbout` / `readReminderAboutOptions`; an unused `orderPlanStops` dropped from Home.
- E.16: CONTEXT.md's Reminder entry gained only the new clauses (the rest was already there).
- F.7, F.13–F.16, F.18: test helpers typed `unknown` where the brief's type failed `tsc`; F.17 also updated a second `addNote` assertion.

### Batch gate fixes (Z)

- Em-dashes in Traveller- and Claude-facing copy caught by `test/copy-style.test.ts`: the Home timezone Activity line (C.3), two Reminder strings in `lists-write.ts` (E.15), the Item notes description (F.17), and the pre-batch `MORE_THAN_ONE_COST` refusal (`46d19856`, already failing on `main`).
- Unused exports flagged by knip made file-local: `CHAPTER_DATES_OFF_WARNING` (D.2), five `plan-shapes.ts` names (F.1), `McpDayEntry` (F.6), `snapshotPlanStops` (F.10).
- Build check: the tz-lookup table is in exactly one client chunk, loaded only by a dynamic `import()`, and in no route's first-load JS.
