# Working instructions

At the start of every session, use the grill-with-docs skill to interview me and produce the spec. Work through the back-and-forth with me until the plan is agreed and you've played the full spec back to me.

Do NOT write any code until I explicitly say "go for it" (or similar).

Once I say go, do NOT build it in a single pass. Always run this pipeline:

1. Use the **superpowers:writing-plans** skill to turn the agreed spec into a plan of independent, ordered tasks.
2. Use the **superpowers:subagent-driven-development** skill to execute that plan — one fresh subagent per task, with the spec-compliance and code-quality review loops it prescribes.

This is mandatory regardless of how small the build seems. Run it end to end without stopping to ask permission on individual tasks. I care about working output, not polish.
