# 0074 — Actions fail three ways: guards throw, validation returns, infrastructure reports

## Status
Accepted (2026-10-14). Decided in the tidy-up grilling
(`docs/specs/2026-10-14-tidy-up-pass.md`, card D).

## Context

By October 2026 the 175 exported Server Actions returned five different
failure shapes: `ActionResult` (`{ success, errors }`), `{ success: false,
error }`, `{ ok, reason, message }`, `{ ok, error }`, and bare `void` or a
throw. Form-level validation errors were keyed `"_"` in twelve action files
(what `lib/action-result.ts` documents and what `fail()` emits from zod's
form errors) and `"_form"` in five others; components read one key or the
other. Three adapters (`components/ui/action-failure.ts`,
`lib/mcp/run-tool.ts`, two private `firstErrorMessage` copies) each knew
both shapes. One refusal was lost to the split: `updateStop` returned the
ADR 0073 lone-Stop message under `"_"` and the Stop form rendered only
`"_form"`.

Underneath, three conventions were already in force but never written down.

## Decision

1. **Guards throw.** An access or existence check that fails calls
   `notFound()`. The caller learns nothing about whether the row exists.
   This includes a `forkId` that is not a Fork of the Trip on a write.
2. **Validation returns.** Every `"use server"` export returns
   `ActionResult<T>`. A failure is `fail(errors, code?)`: field errors keyed
   by field, form-level errors under `"_"`, and an optional machine-readable
   `code` (for example `"disabled"`, `"rate-limited"`) where the UI branches
   on the reason. `"_form"` is retired. `lib/server-action-exports.test.ts`
   asserts the return type, so a sixth shape cannot appear.
3. **Infrastructure reports.** A failure that is nobody's input (storage,
   mail, the AI call, a swallowed Activity write) goes to `reportError`
   (ADR 0059) and the action still returns a result the UI can show.

Components read failures only through `firstErrorMessage(result)` and
`formError(result)` in `components/ui/action-failure.ts`; the MCP adapter
reads the same shape and nothing else.

## Considered options

Throwing typed errors from every action was rejected: a Server Action that
throws reaches the client as an opaque error boundary, which is wrong for
validation the Traveller can fix. Keeping `{ success: false, error }` as a
second blessed shape was rejected because every reader then needs a branch,
which is how the lost refusal happened.
