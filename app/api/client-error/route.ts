import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { reportError } from "@/lib/error-sink";

/**
 * POST /api/client-error
 *
 * The client half of ARCH-OBS-2. The app's three error boundaries
 * (app/(app)/error.tsx, app/global-error.tsx, app/(app)/trips/[tripId]/error.tsx)
 * are client components — a `console.error` there lands only in the
 * Traveller's own devtools, where nobody but that Traveller can ever see it.
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
 * No normalisation of the client-supplied `message` is done here before it
 * reaches reportError, even though interpolated ids/URLs in a rendering
 * error's message will each mint their own ErrorReport row (reportError
 * hashes name + message + first stack frame — see lib/error-sink.ts). That
 * gap is real but left to the review this task's brief already flags it
 * for: a normaliser written blind, with no sample of what client messages
 * actually look like in production, risks collapsing genuinely distinct
 * failures together as easily as it collapses noise. Safer to let the
 * review look at real rows through the /admin surface below and decide
 * what (if anything) to collapse, than to guess a regex now.
 */

// A stack trace with dozens of frames, comfortably including source-mapped
// ones, still fits well under this — it exists only to stop an unbounded
// client-supplied string (a hostile or pathological caller) from reaching
// the database uncapped.
const MAX_STACK_CHARS = 8_000;

const bodySchema = z.object({
  message: z.string().min(1),
  stack: z.string().optional(),
  route: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const raw: unknown = await req.json();
    const parsed = bodySchema.safeParse(raw);

    if (parsed.success) {
      const { message, stack, route } = parsed.data;
      const session = await auth();

      const err = new Error(message);
      if (stack) err.stack = stack.slice(0, MAX_STACK_CHARS);

      await reportError(err, {
        source: "client",
        route,
        userId: session?.user?.id,
      });
    }
  } catch {
    // Malformed JSON, a rejected reportError, anything at all — see the
    // module doc for why this endpoint never surfaces a failure.
  }

  return new NextResponse(null, { status: 204 });
}
