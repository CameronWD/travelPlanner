# AI features: roadmap

TEEPEE's AI features all run through `lib/ai.ts` (one `ANTHROPIC_API_KEY` gate,
one `AI_MODEL`, default `claude-haiku-5-5`). Each is off until the key is set
on the deployment (docs/DEPLOY.md, "Enabling AI").

1. **Booking importer (building now).** Turn tickets, confirmations and booking
   emails into Proposals the Traveller confirms, edits or discards. Spec:
   [docs/specs/2026-10-14-booking-import.md](specs/2026-10-14-booking-import.md).
2. **Evening-before briefing.** A friendly summary of tomorrow's plan: where you
   wake up, what is booked, when to leave. Likely rides on the Digest.
3. **Packing list generator** from the destinations, dates and things to do.
   Overlaps the dormant `draftPackingList` (`lib/ai.ts`) and `aiDraftPackingList`
   (`server/actions/ai.ts`), already mounted on Checklists; extend that rather
   than start again.
4. **Smarter health flags.** Common-sense checks on the plan: a tight connection,
   a closure on the day you planned to visit, one night after a long-haul
   flight. TEEPEE's term is **Flag** (`lib/flags.ts`); these would be new Flag
   kinds, not a separate surface.
5. **Later: "chat with your trip".** An in-app assistant that reads and changes
   the Trip through TEEPEE's own MCP tools (`lib/mcp/`) via the Claude API's MCP
   connector, so it has exactly the powers the Claude connection has.
