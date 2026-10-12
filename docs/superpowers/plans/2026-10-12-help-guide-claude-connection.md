# Help guide: Claude and your trips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Claude and your trips" card to the in-app guide (`/help`) explaining what the Claude connection is, how to connect it, how to manage it under Connected apps, and what to ask.

**Architecture:** The guide is data plus prose: `lib/help-guide.ts` holds `HELP_SECTIONS` (id, title, blurb, group) and the drift guards (`GUIDE_UI_STRINGS`, which a test proves still appear in real UI source); `components/trip/help-guide.tsx` (a server component) renders one `<Section>` per id. One new section in the `advanced` group after `links`, the connector URL built from `siteUrl()` so beta shows its own address, and the quoted control names added to the drift guard.

**Tech Stack:** Next.js server component, Vitest.

**Spec:** Agreed in conversation 2026-10-12 (text below is the agreed copy). Domain: CONTEXT.md **Claude connection**, **Connected apps**, **Activity** ("via Claude").

## Global Constraints

- Branch `feat/help-guide-claude-connection-2026-10-12`. Never commit to `main`. Never push or deploy. No feedback:*/mcp:token/db:* scripts.
- Do not import `lib/auth.ts` into the guide (server-only, boots Better Auth on import). Use `siteUrl()` from `lib/site-url.ts` for the address.
- Match the guide's existing voice and markup exactly (see the `account` and `feedback` sections in `components/trip/help-guide.tsx`): `<Section heading={Sub} section={sectionById("…")}>`, `<p>`, `<ul className={\`list-disc ${LIST_CLASS}\`}>`, `<strong className="font-semibold">` for control names, `&rsquo;` for apostrophes, `<SiteLink href="/account">` for the Account link.
- Never document `ADMIN_EMAILS` or any operator override (HG-01/HG-11).
- Copy style: no em dashes (test/copy-style.test.ts) and no semicolons in the new prose; the ones in the agreed copy below must be rewritten as full stops or commas.
- Every control name the new prose quotes in bold must be added to `GUIDE_UI_STRINGS` and must exist verbatim in UI source outside the guide: "Connected apps", "Disconnect", "Allow". Check `app/connect/*.tsx` and `components/account/connected-apps-panel.tsx` for the exact strings before quoting them (e.g. the consent heading is "Claude wants to access your trips as …"; quote only the part that exists verbatim, or don't bold it).
- Verification: `npx vitest run lib/help-guide.test.ts 'app/(app)/help/page.test.tsx' components/trip/help-guide.test.tsx test/copy-style.test.ts` (whichever exist), then `npx vitest related --run lib/help-guide.ts components/trip/help-guide.tsx` + `npx tsc --noEmit` + `npx eslint <changed files>`. Not the full suite, not `next build`.
- Commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. The On-this-page rail and the group-contiguity test must still pass with the new `advanced` entry (`sectionsInGroup`, rail test in `app/(app)/help/page.test.tsx`) — Task 1 runs them.
2. On the trip-scoped guide (`/trips/[tripId]/help`) and the global one, the section renders identically (no tripId dependence) — Task 1 asserts it renders under both.

---

### Task 1: The "Claude and your trips" section

**Files:**
- Modify: `lib/help-guide.ts` (HELP_SECTIONS + GUIDE_UI_STRINGS)
- Modify: `components/trip/help-guide.tsx` (new `<Section>` after `links`)
- Test: `lib/help-guide.test.ts`, `components/trip/help-guide.test.tsx` (if present; else `app/(app)/help/page.test.tsx`)

- [ ] **Step 1: Failing tests.** In `lib/help-guide.test.ts` add: `HELP_SECTIONS` contains `{ id: "claude", group: "advanced" }` immediately after `links`; `GUIDE_UI_STRINGS` includes "Connected apps", "Disconnect" and "Allow" (the drift guard then proves they exist). In the component test (global `/help` render), assert the heading "Claude and your trips" is present, the text contains "/api/mcp", "via Claude", and "Connected apps". Run — FAIL.

- [ ] **Step 2: Data.** In `HELP_SECTIONS`, after the `links` entry:

```ts
  {
    id: "claude",
    title: "Claude and your trips",
    blurb: "Let your own Claude read and build your trips, as you.",
    group: "advanced",
  },
```

  Add to `GUIDE_UI_STRINGS` under a `// Claude connection` comment: `"Connected apps"`, `"Disconnect"`, `"Allow"` (verify each exists verbatim in UI source first; if "Allow" renders differently, use the real label).

- [ ] **Step 3: Prose.** In `components/trip/help-guide.tsx`, import `siteUrl` from `@/lib/site-url` and add after the `links` section (compute `const mcpUrl = \`${siteUrl()}/api/mcp\`;` near the other derived values in the component):

```tsx
          <Section heading={Sub} section={sectionById("claude")}>
            <p>
              If you use Claude (the app on your phone, claude.ai, Claude Desktop
              or Claude Code) you can connect it to Teepee. It then sees exactly
              the trips you see and can do exactly what you can: read the plan,
              costs and files, add things to do, schedule a day, tick off the
              checklist. Nothing it does is hidden. Every change shows in{" "}
              <strong className="font-semibold">Activity</strong> marked{" "}
              <strong className="font-semibold">via Claude</strong>, so the
              others always know it was you, through Claude.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Connecting.</strong> In Claude,
                add a connector with the address{" "}
                <code className="…same code styling the guide uses elsewhere, or plain text if none…">{mcpUrl}</code>. In
                claude.ai it is under Settings, Connectors, Add custom connector.
                Choose Sign in now and let it register itself. Teepee asks you to
                sign in and shows what Claude wants and where it is returning to.
                Press <strong className="font-semibold">Allow</strong>. One
                connection covers your phone, the web and Desktop.
              </li>
              <li>
                <strong className="font-semibold">Managing it.</strong>{" "}
                <strong className="font-semibold">Connected apps</strong> on your{" "}
                <SiteLink href="/account">Account</SiteLink> page lists every
                connection. <strong className="font-semibold">Disconnect</strong>{" "}
                ends one at once, and Claude has to ask again. Signing out of
                Teepee on the web also cuts it off until it next refreshes.
              </li>
              <li>
                <strong className="font-semibold">Good things to ask.</strong>{" "}
                &ldquo;Plan Thursday in Lisbon&rdquo;, &ldquo;what&rsquo;s due in
                the next 30 days&rdquo;, &ldquo;what time does the Porto train
                leave, local time&rdquo;, &ldquo;what&rsquo;s in the castle
                tickets&rdquo;, &ldquo;check Saturday&rsquo;s logistics&rdquo;.
                Claude has been told to build real things to do rather than
                notes, to check opening hours and travel times online, and to say
                when it couldn&rsquo;t verify something.
              </li>
            </ul>
            <p>It only ever works on the real plan, never a What-if plan.</p>
          </Section>
```

  Check how the guide renders inline code elsewhere (grep `<code` in the file); if it has no code styling, render the address as plain text inside `<strong className="font-semibold">`.

- [ ] **Step 4: Run** the tests — PASS, including the rail and contiguity tests and copy-style. **Step 5:** task-done checks; commit `docs(help): Claude and your trips section in the in-app guide`.

---

## Branch finish (main session, once)

`npm test` + `npm run build`. Then finishing-a-development-branch.
