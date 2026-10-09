# Connect Claude to TEEPEE

For Cam and his partner.

## What it is

A **Claude connection** lets Claude Code or Claude Desktop read and change
your Trips directly, as you — it signs in as you with a token Cam gives you,
so it sees exactly the Trips you're on and can do exactly what you could do
in the app. Nothing it changes is hidden: every edit shows up in the Trip's
Activity feed marked **via Claude**, same as any other change, so your
travel partner always sees what happened and who (really) did it.

It only ever works on the real plan — never a What-if plan.

## Getting a token

Ask Cam for a token. He runs:

```
npm run mcp:token -- --email <you> --label <device>
```

and sends you the token it prints. It is shown once, so keep it somewhere
you can paste it from (a password manager is the obvious place). It never
expires, so you only need to do this once per device, until you choose to
revoke it.

## Claude Code

```
claude mcp add --transport http teepee https://<site>/api/mcp --header "Authorization: Bearer <token>"
```

Or, in `.mcp.json`:

```json
{
  "mcpServers": {
    "teepee": {
      "type": "http",
      "url": "https://<site>/api/mcp",
      "headers": { "Authorization": "Bearer ${TEEPEE_TOKEN}" }
    }
  }
}
```

`${TEEPEE_TOKEN}` reads the token from an environment variable called
`TEEPEE_TOKEN`, so the token itself never needs to sit inside `.mcp.json`.

## Claude Desktop

Claude Desktop's own connectors only take an org-wide static header (a beta
feature for teams, not per-person tokens), so it isn't the way in here.
Instead, run the connection through a small local bridge, `mcp-remote`,
which Node runs for you — this needs Node 18 or later on your machine, not
the TEEPEE codebase.

Add this to Claude Desktop's config (verified against `mcp-remote`
0.14.3's own README):

```json
{
  "mcpServers": {
    "teepee": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<site>/api/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer <token>"
      }
    }
  }
}
```

The header is split like that (no spaces around the `:`, the value pulled
from `env`) because Claude Desktop mangles spaces inside `args` on some
platforms — `mcp-remote`'s README calls this out directly as the workaround.
Restart Claude Desktop after adding this.

If a later `mcp-remote` release stops carrying a static header through
cleanly, Desktop connects once TEEPEE moves to OAuth sign-in instead
(`docs/open-follow-ups.md` TC-06) — there's nothing else to try until then.

## What it can and cannot do

Claude acts with exactly your own permissions — if you're a Traveller on a
Trip, Claude can do what you can; if you're the owner, it can do what the
owner can; nothing more. A token minted for an Admin carries Admin rights
the same way, so Cam mints tokens accordingly.

It can read:

- your Trips and a Trip's real plan — Stops with nights and dates,
  Transport, Accommodation, things to do by Stop and day, Day titles,
  Chapters
- the Wishlist (with Votes) and Notes
- Budget (totals in your Home currency, unpaid) and Flags
- Activity since a time
- Reminders
- Checklists (pre-trip, Packing, Shopping) and packing templates
- Globe Markers (read-only)
- place search, for choosing Stop and Item locations

It can change:

- Trips: create; edit name, dates, Hard end date
- Stops: add, edit, move/reorder, set nights or dates, pin/make rough, set
  notes, Firm up, delete
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
Invites, Share links, Calendar feeds, Attachments, Item photos, covers,
Journal, Globe writes, push, Admin or Feedback.

Deleting a Stop, an Item, a Cost, an Accommodation, a Transport, a Reminder
or a Checklist item through Claude is **permanent** — unlike a Trip, none of
these go to Recently deleted. Claude is told to confirm with you before it
deletes anything, but it is still worth saying "wait, don't delete that yet"
if you're unsure.

One gap worth knowing: Checklists, Reminders, Day titles and Votes write no
Activity at all, for anyone, Claude included — so a change Claude makes
there leaves no trace in the feed (tracked as TC-07).

## Operator: mint, list, revoke

```
npm run mcp:token -- --email <email> --label <label>   # mint (shown once)
npm run mcp:token -- --list                             # id, email, label, created, last used
npm run mcp:token -- --revoke <id>                      # takes effect on the next request
```

Tokens never expire on their own. A lost or leaked token is **revoked and a
new one minted** — there is no way to recover a lost token, only to replace
it. `--list` never prints a token, only its id and label, so there's nothing
secret to confirm against; if a Traveller isn't sure which label is theirs,
revoke the ones they don't recognise and mint a fresh one.
