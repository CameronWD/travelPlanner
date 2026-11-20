# Add Reminder Dialog On Phones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** On a phone the Reminders card adds a Reminder through the existing dialog, with the form's About choice.

**Architecture:** `AddReminderDialog` gains an optional list of About choices; the Reminders card's add control opens it below the `md` breakpoint and keeps its inline form from `md` up. No new component, route, dependency or schema.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before using a Next API), React 19, Tailwind, Vitest.

**Spec:** `docs/specs/2026-11-23-add-reminder-dialog-phone.md`

## Global Constraints

- Branch `feat/add-reminder-dialog-phone`. Commit only your own files: `git commit -m "..." -- <paths>`. Never `git add -A`, never stage `AGENTS.md`, never push, switch branch, stash or amend.
- Never run `npm run feedback:*`, `npm test`, `npm run build`, or anything that touches a database. Never call any `mcp__teepee__*` tool. Verification: `TZ=UTC npx vitest related --run <changed source files>`, `npx tsc --noEmit`, `npx eslint <changed files>`.
- Zero code comments unless the why is not obvious. No JSDoc. No refactors or features beyond the task.
- Domain words are `CONTEXT.md`'s (Reminder, Stop, Transport, "thing to do" in copy). Dialog titles are Title Case; copy is sentence case with curly apostrophes, no em dash, no exclamation mark.
- Holds from 320 to 2560 px and in the dark theme. Existing tokens and components only.
- Tests contain no real names, places or bookings.

## Review Focus

- A phone rotated or a window resized across `md` while the form or dialog is open: nothing is lost silently and two add controls never show at once.
- The first render on a phone must not flash the inline form (server render and hydration agree).
- A Reminder added from the dialog with About set to a Stop is stored about that Stop, exactly as the form stores it.
- Cancel, Escape and a failed save leave the card as it was; focus returns to "Add Reminder".
- The About list is the one the form already builds; nothing hidden from this Traveller appears in it.

---

### Task 1: the dialog offers the About choice, and the card opens it on phones

**Files:** `components/trip/add-reminder-dialog.tsx`, `components/trip/add-reminder-dialog.test.tsx`, `components/trip/reminders-card.tsx`, `components/trip/reminders-card.test.tsx`. Read first: how `reminders-card.tsx` builds its About `<select>` (`hasAbout`, `aboutFromPick`, the `about` prop with `stops` and the other groups) and how `components/day/day-add-menu.tsx` decides phone versus desktop (the wave 2 "Add to this day" sheet) so this follows the same mechanism and the same hydration-safe pattern.

- [ ] `AddReminderDialog` (add mode only) accepts an optional prop carrying the card's About choices (reuse the card's existing type for them; name it `aboutChoices`). When given, the dialog renders the same select the card's form renders (same label "About", same "The whole trip" default, same groups and option labels) and submits the chosen About exactly as the form does (`aboutFromPick`). Move the select and its helpers into one shared place both use (a small component or exported helpers in an existing file of this pair) so the list is built once; do not duplicate the markup. When `aboutChoices` is absent the dialog is byte-for-byte what it is today.
- [ ] `reminders-card.tsx`: below `md` the "Add Reminder" button opens `AddReminderDialog` in add mode with `aboutChoices` and `onAdded` wired as the form's success path is; from `md` up it unfolds the inline form as now. Use the mechanism `day-add-menu.tsx` uses; the server-rendered markup must be the same on both sizes (the button), so nothing flashes.
- [ ] If the size crosses `md` while the dialog is open, the dialog stays open until closed; while the inline form is open, it stays until closed.
- [ ] The dialog's title is "Add Reminder"; its footer follows the app's rule (outlined Cancel, primary last, pinned).
- [ ] Tests: on a phone-sized match the button opens a dialog named "Add Reminder" and no inline form; choosing a Stop in About and saving calls `addReminder` with that Stop; "The whole trip" sends no about; Cancel closes with no call; on desktop the inline form opens and no dialog; the dialog without `aboutChoices` renders no About select; the existing dialog and card tests still pass.
- [ ] Verify, then commit `feat(reminders): Add Reminder opens a dialog on phones, with the About choice`.
- [ ] Look at it: the dev server (http://localhost:3000, demo data; sign-in helper `lib.ts` and `auth.json` in the scratchpad `w1-visual/`; `NODE_PATH=$PWD/node_modules npx tsx <script>`) at 402x700 in WebKit on trip home and on Checklists: open the dialog, screenshot, add a Reminder about a Stop, see it on the card, delete it; and at 1512 in Chromium: the inline form still unfolds. Report what you saw.
