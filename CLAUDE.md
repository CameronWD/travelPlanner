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

Close a Feedback note only when the work has actually landed:
`npm run feedback:resolve -- <id> --note "what you did"`. Never hand-edit
`docs/feedback/inbox.md` — it is generated (ADR 0040).

At the start of every session, use the grill-with-docs skill to interview me and produce the spec. Work through the back-and-forth with me until the plan is agreed and you've played the full spec back to me.

Do NOT write any code until I explicitly say "go for it" (or similar).

Once I say go, do NOT build it in a single pass. Always run this pipeline:

1. Use the **superpowers:writing-plans** skill to turn the agreed spec into a plan of independent, ordered tasks.
2. Use the **superpowers:subagent-driven-development** skill to execute that plan — one fresh subagent per task, with the spec-compliance and code-quality review loops it prescribes.

This is mandatory regardless of how small the build seems. Run it end to end without stopping to ask permission on individual tasks. I care about working output, not polish.
