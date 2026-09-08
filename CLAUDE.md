# Working instructions

## Feedback inbox — read this first

At the start of every session, before the grilling interview:

1. Run `npm run feedback:pull` — it rewrites `docs/feedback/inbox.md` from the
   Feedback notes written inside the app. (If this feature hasn't been deployed
   yet, the `FeedbackNote` table won't exist and this will fail with a Prisma
   error — that's expected pre-deploy, not something to fix; just note it and
   move on.)
2. Read the inbox and lead with what's open in it.
3. Commit the refreshed `docs/feedback/inbox.md` on your working branch.

Close a note only when the work has actually landed:
`npm run feedback:resolve -- <id> --note "what you did"`. Never hand-edit
`docs/feedback/inbox.md` — it is generated (ADR 0040).

At the start of every session, use the grill-with-docs skill to interview me and produce the spec. Work through the back-and-forth with me until the plan is agreed and you've played the full spec back to me.

Do NOT write any code until I explicitly say "go for it" (or similar).

Once I say go, do NOT build it in a single pass. Always run this pipeline:

1. Use the **superpowers:writing-plans** skill to turn the agreed spec into a plan of independent, ordered tasks.
2. Use the **superpowers:subagent-driven-development** skill to execute that plan — one fresh subagent per task, with the spec-compliance and code-quality review loops it prescribes.

This is mandatory regardless of how small the build seems. Run it end to end without stopping to ask permission on individual tasks. I care about working output, not polish.
