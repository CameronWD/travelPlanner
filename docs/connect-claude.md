# Connect Claude to TEEPEE

For Cam and his partner.

## What it is

A **Claude connection** lets Claude read and change your Trips directly, as
you, by signing in to Teepee the same way you do in the browser, so it sees
exactly the Trips you're on and can do exactly what you could do in the app.
Nothing it changes is hidden: every change to the plan shows up in the Trip's
Activity feed marked **via Claude**, same as any other change, so your travel
partner always sees what happened and who (really) did it. A little personal
bookkeeping, listed below, deliberately doesn't.

It only ever works on the real plan, never a What-if plan.

## Connect from claude.ai or the phone app

1. Settings → Connectors → Add custom connector.
2. URL: `https://<site>/api/mcp`
3. Connect, then sign in to Teepee the way you normally do (Google, or the
   Sign-in link).
4. Allow, on the page that shows what it's asking for.

## Claude Desktop

Same connector settings as above (Settings → Connectors → Add custom
connector → `https://<site>/api/mcp`), then sign in and Allow. Desktop no
longer needs `mcp-remote`. That workaround was only ever needed because
Desktop's own connectors couldn't carry a per-person token, and there's no
token to carry anymore.

## Claude Code

```
claude mcp add --transport http teepee https://<site>/api/mcp
```

Then run `/mcp` and sign in from there.

**If Claude Code doesn't connect but your phone and the web both do:**
Claude Code needs to register itself as a native app so it can use a
`localhost` callback, and it may not always do that. `MCP_REDIRECT_HOSTS`
(the operator setting that extends which hosts a redirect can return to)
isn't the fix here. It only adds hosts, and this is about the app declaring
itself native, not about which host it's allowed to return to.

## Connected apps

Account page → Connected apps lists everything you've connected, where it
returns to, when you connected it, and when it was last used. **Disconnect**
ends that app's access at once, the next thing it tries fails, and it has
to ask again. Reconnect the same way you connected the first time: add it
again from Claude and sign in.

Signing out of Teepee on the web does not disconnect Claude. It only cuts
Claude off until Claude next refreshes its own access, which happens on its
own before long. If you want a connection ended for good, right now,
Disconnect is the way to do it.

## If it stops working

Disconnect it in Connected apps, then connect again from Claude. That
clears out anything stale on both sides.

## Watch what it asks you to sign in to

The consent page shows **where the access will return to**, for example
"Returns to claude.ai". That should always say claude.ai (or the Claude
client you're actually using). If a request asks you to sign in and says it
returns somewhere else, Cancel it rather than Allow it.

## What it can and cannot do

Claude acts with exactly your own permissions — if you're a Traveller on a
Trip, Claude can do what you can; if you're the owner, it can do what the
owner can; nothing more.

It can read:

- your Trips and a Trip's real plan — Stops with nights and dates and their
  own timezone, Transport (where it actually leaves from and arrives at, and
  local times at each end in that end's own timezone), Accommodation, things
  to do by Stop and day (plus any dated thing to do that falls on no Stop's
  days), Day titles, Chapters, and the trip's Travellers (names and roles)
- the Wishlist (with Votes) and Notes
- Budget (totals in your Home currency, unpaid) and Flags
- each Cost individually (its own currency and the home-currency amount,
  paid or due, and what it belongs to), so "what's due in the next 30 days?"
  actually works
- Activity since a time
- Reminders
- Checklists (pre-trip, Packing, Shopping) and packing templates
- files: which files are attached to what, and reading one's contents.
  Images come back up to 3 MB, a PDF's text up to 10 MB, and a scanned PDF
  with no text layer can't be read
- Globe Markers (read-only)
- place search, for choosing Stop and Item locations

It can change:

- Trips: create; edit name, dates, Hard end date
- Stops: add, edit, move/reorder, set nights or dates, pin or unpin
  (`set_stop_pinned`), make rough, set notes, Firm up, delete
- things to do: add, edit, schedule onto a day, unschedule, add to Wishlist,
  place a Wishlist idea at a Stop, delete
- Accommodation, Transport, Costs: add, edit, delete; mark a Cost paid or
  unpaid
- Chapters: add, edit, assign Stops
- Day titles: set and clear
- Notes: add
- Votes: set and clear on Wishlist ideas
- Reminders: add, edit, delete
- Checklists: add, edit, tick/untick, reorder, delete; mark Need to buy;
  save as packing template; apply a template
- Make it fit: preview, then apply

Editing something through Claude changes only what you asked for; everything
else about it stays as it was.

It cannot touch: What-if plans, Trip delete/duplicate/restore, members,
Invites, Share links, Calendar feeds, uploading, renaming or deleting
Attachments, Item photos, covers, Journal, Globe writes, push, Admin or
Feedback.

Deleting a Stop, an Item, a Cost, an Accommodation, a Transport, a Reminder
or a Checklist item through Claude is **permanent** — unlike a Trip, none of
these go to Recently deleted. Claude is told to confirm with you before it
deletes anything, but it is still worth saying "wait, don't delete that yet"
if you're unsure.

Some changes leave no trace in the feed, for anyone, Claude included — these
are deliberate exclusions, not gaps (ADR 0012 amendment 2026-10-11):
ticking an item off the Packing or Shopping list, marking something Need to
buy, reordering a checklist, saving a packing template, and clearing a Vote.
Adding many items at once — applying a packing template, or the AI packing
list's "Add all" — shows as a single line ("added 12 items to the packing
list"), not one per item.

## Ready-made prompts

Claude Code and Claude Desktop both list these as ready-made starting points,
so you don't have to describe the task from scratch each time:

- **review-plan**: reviews a Trip's plan for gaps, clashes, unbooked stays
  and the deadline, and proposes fixes.
- **pack-for**: builds a Trip's packing list from its plan, grouped by type,
  with anything to buy flagged.
- **plan-day**: plans a day as timed things to do. It checks each stop's
  address, the getting-there options between them (walk, metro or train, bus
  or tram, car or taxi) with a recommendation, opening hours, and fixed times
  like flights and check-in or check-out, then proposes the day and only
  builds it once you agree.
- **check-day**: runs that same logistics check against a day already
  planned, and suggests fixes.

Opening hours and travel times come from Claude's own web search, not from
anything stored in TEEPEE, so turn web search on in your Claude client for
the best results from `plan-day` and `check-day`. Anything Claude couldn't
verify is marked unverified rather than guessed. Claude has also been told to
keep what it writes into TEEPEE plain and short, and to check real-world
facts online before relying on them.
