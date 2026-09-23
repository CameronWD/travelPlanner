import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { reportError } from "@/lib/error-sink";

/**
 * POST /api/client-error
 *
 * The client half of ARCH-OBS-2. Every error.tsx boundary under app/(app)/
 * (one per route, since Task 6 of the Playground reskin) plus the root
 * app/global-error.tsx are client components — a `console.error` there lands
 * only in the Traveller's own devtools, where nobody but that Traveller can
 * ever see it.
 * This route gives them somewhere else to send it: the same `ErrorReport`
 * sink server failures already report to (lib/error-sink.ts, ADR 0059).
 *
 * Deliberately reachable without a session. An error boundary can fire on
 * the sign-in page itself — before there is anything to authenticate — so
 * requiring one would silently drop exactly the failures happening where a
 * Traveller has the least other recourse. That openness is an accepted,
 * rate-limited-by-obscurity trade (ADR 0059), not an oversight: the route
 * writes nothing back to the caller (always 204, see below) and accepts no
 * fields that let a caller act as anyone else. When a session *does* exist
 * we still capture its user id, so a signed-in Traveller's report isn't
 * anonymous just because the endpoint tolerates callers who aren't.
 *
 * Always returns 204 — including on malformed input, an unreachable
 * database, or any other internal failure. A reporting endpoint that can
 * itself fail is a second error: a boundary whose recovery screen is
 * already up must never see a failed report and retry, surface a second
 * failure, or otherwise let this fire path back into the Traveller's
 * experience. The whole body is wrapped for exactly that reason, mirroring
 * reportError's own "never throws" contract.
 *
 * `message` and `route` are length-bounded in the schema below (fix round 1,
 * C1) by TRUNCATION, not rejection (final fix wave, D2 — they used to reject,
 * which threw the whole report away). This is not the normalisation
 * ARCH-OBS-2's original brief left for a
 * later review to decide (interpolated ids/URLs in a message still mint
 * their own signature) — that gap is still open, deliberately. Capping is a
 * bound, not a normaliser: it exists because this route is unauthenticated
 * and `message` is the entire entropy of reportError's dedup signature
 * (`name` is always "Error" here, and the first stack frame is effectively
 * constant per call site) — so an uncapped `message` handed a caller full
 * control over signature creation, and on a new signature that used to mean
 * an unauthenticated string landing on every admin Device's lock screen
 * verbatim. lib/error-sink.ts now also refuses to push for
 * `source: "client"` at all (same round, same reasoning) — the cap here is
 * defence in depth on top of that, bounding what reaches the database and
 * the console regardless of whether a push would ever follow.
 */

// A stack trace with dozens of frames, comfortably including source-mapped
// ones, still fits well under this — it exists only to stop an unbounded
// client-supplied string (a hostile or pathological caller) from reaching
// the database uncapped.
const MAX_STACK_CHARS = 8_000;

// No real client-thrown `message` is anywhere near this long; it exists to
// bound the entropy an unauthenticated caller can put into reportError's
// dedup signature (see module doc, C1).
const MAX_MESSAGE_CHARS = 500;

// A pathname, not free text — comfortably covers any real route in this app.
const MAX_ROUTE_CHARS = 200;

// A React error digest is a short hash. Capped defensively for the same
// "unauthenticated caller" reason as message/route, even though it isn't part
// of the dedup signature.
const MAX_DIGEST_CHARS = 200;

// TRUNCATE, NOT REJECT (final fix wave, D2). These were `.max(...)`
// constraints, so an over-cap `message` or `route` failed the whole parse and
// the report was dropped entirely — no row, no console line, nothing. That
// trades an observation away for nothing: truncation bounds the entropy a
// caller can put into reportError's dedup signature exactly as well as
// rejection does, and still keeps the report. `stack` keeps its existing
// slice in the handler below.
const bodySchema = z.object({
  message: z.string().min(1).transform((s) => s.slice(0, MAX_MESSAGE_CHARS)),
  stack: z.string().optional(),
  route: z
    .string()
    .optional()
    .transform((s) => (s === undefined ? undefined : s.slice(0, MAX_ROUTE_CHARS))),
  // React's error digest (Error & { digest?: string }) — see
  // ReportErrorContext.digest in lib/error-sink.ts for why this matters.
  digest: z
    .string()
    .optional()
    .transform((s) => (s === undefined ? undefined : s.slice(0, MAX_DIGEST_CHARS))),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const raw: unknown = await req.json();
    const parsed = bodySchema.safeParse(raw);

    if (parsed.success) {
      const { message, stack, route, digest } = parsed.data;
      const session = await auth();

      const err = new Error(message);
      // I3 (fix round 1): without this, an omitted client `stack` left
      // `new Error(message)`'s OWN stack in place — a frame pointing at
      // this route handler, not at the client failure being reported. That
      // frame would then have been what firstStackFrame (lib/error-sink.ts)
      // hashed into the signature, and what an admin reading the row would
      // have seen: this route's location, not the Traveller's. Always
      // overwrite it, to the capped client value or to nothing.
      err.stack = stack ? stack.slice(0, MAX_STACK_CHARS) : undefined;

      await reportError(err, {
        source: "client",
        route,
        userId: session?.user?.id,
        digest,
      });
    }
  } catch {
    // Malformed JSON, a rejected reportError, anything at all — see the
    // module doc for why this endpoint never surfaces a failure.
  }

  return new NextResponse(null, { status: 204 });
}
