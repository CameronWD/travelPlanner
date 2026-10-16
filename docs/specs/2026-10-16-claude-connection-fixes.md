# Spec — Claude connection fixes (Feedback batch, 2026-10-16)

**Status:** agreed in the 2026-10-16 session (grill), after tidy-up batch 3
merged. One branch, `feat/feedback-tz-enddate-review`, target `main`.

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
