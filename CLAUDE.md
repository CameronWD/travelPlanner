# Working instructions

> **Who these apply to.** Everything in this file that talks about "the
> session", "the start of every session", interviewing me, or waiting for my
> go-ahead is addressed to the **main session** — the agent I am talking to
> directly. A subagent or scoped subtask is not a session: it has no-one to
> interview, no go-ahead to wait for, and must not re-run session-start steps.
> If you were dispatched by another agent, your instructions are the ones in
> your dispatch; treat this file as background about the project, not as a
> checklist to execute. The pipeline rules below still bind the main session.

## Feedback inbox — read this first

**This section is for the main session only — the one talking to me directly.**
If you are a subagent, a scoped subtask, or any agent dispatched by another
agent, skip it entirely: you are not starting a session, and `feedback:pull`
opens a connection to the **production** database. Subagents have read
"the start of every session" as applying to themselves and hit production
more than once. Your orchestrator has already done this; you do not repeat it.

Main session only, at the start of the session, before the grilling interview:

1. Run `npm run feedback:pull` — it rewrites `docs/feedback/inbox.md` from the
   Feedback notes written inside the app. It reads `.env.production.local`, so
   it queries production; it is read-only and only ever writes the local inbox
   file. (`npm run feedback:resolve` is the only writer — never run it to
   "check" anything, not even with `--dry-run`.)
2. Read the inbox and lead with what's open in it.
3. Commit the refreshed `docs/feedback/inbox.md` on your working branch — only
   if it actually changed.

### Closing a Feedback note (ADR 0040, amended 2026-09-22)

**"Landed" means deployed, not merged.** `feedback:resolve` writes to
production, so resolving before a Traveller can actually use the fix makes
production report **Done** for something that does not exist yet. That failure
is silent and permanent: a resolved note drops out of *Open*, so an abandoned
or reverted branch buries a real request where nobody looks again.

So, while the work is on a branch:

- **Record the link in a commit trailer**, on the commit that does the work:

  ```
  Resolves-Feedback: <id>
  ```

  This is a statement of intent about the repo, not a claim about production —
  it can honestly live on the branch, it is reviewable in the diff, and it
  survives in `git log` whether or not the branch ever ships. It is how "which
  notes does this branch close?" becomes answerable without my memory.

- **Do NOT run `feedback:resolve` on the branch**, and do NOT hand-edit
  `docs/feedback/inbox.md` to show the note as closed. The file is generated
  and the database is the truth; a committed printout cannot be made true
  earlier than the thing it prints.

After I confirm the deploy is live:

1. `npm run feedback:resolve -- <id> --note "what you did"` for each
   `Resolves-Feedback:` trailer on `main` since the last deploy. Write the note
   for *me* — what changed and any caveat worth knowing — not for a changelog.
2. `npm run feedback:pull`, then commit the regenerated `inbox.md`.

`main` therefore carries a briefly-stale inbox between merge and deploy. That
is correct, not a defect: the note **is** still open until the fix is reachable.

At the start of every session, use the grill-with-docs skill to interview me and produce the spec. Work through the back-and-forth with me until the plan is agreed and you've played the full spec back to me.

Do NOT write any code until I explicitly say "go for it" (or similar).

Once I say go, do NOT build it in a single pass. Always run this pipeline:

1. Use the **superpowers:writing-plans** skill to turn the agreed spec into a plan of independent, ordered tasks.
2. Use the **superpowers:subagent-driven-development** skill to execute that plan — one fresh subagent per task, with the spec-compliance and code-quality review loops it prescribes.

This is mandatory regardless of how small the build seems. Run it end to end without stopping to ask permission on individual tasks. I care about working output, not polish.
