import { NextResponse } from "next/server";
import { z } from "zod";
import { healRotatedSubscription } from "@/server/actions/push";

/**
 * The service worker's only way to reach the server.
 *
 * `pushsubscriptionchange` fires inside the service worker, which cannot call
 * a server action — hence a route. It carries a session cookie like any
 * same-origin fetch, and a session is REQUIRED: matching on the old endpoint
 * alone would let anyone holding a victim's endpoint redirect that Traveller's
 * Digests to their own device (see healRotatedSubscription).
 */
const bodySchema = z.object({
  oldEndpoint: z.string().min(1).optional(),
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  timezone: z.string().min(1).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  try {
    const result = await healRotatedSubscription({
      ...parsed.data,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    // "invalid" (bad key material) and "forbidden" (endpoint owned by someone
    // else) are the caller's problem — 400. "internal" (an unexpected DB
    // failure inside the action) is ours, and reporting it as 400 would mask
    // a server fault as a client error on a path nobody is watching.
    const status = result.ok ? 200 : result.reason === "internal" ? 500 : 400;
    return NextResponse.json(result, { status });
  } catch (err) {
    // requireUser() redirects when signed out, and Next's redirect() throws
    // an error whose `digest` starts with NEXT_REDIRECT. A service worker
    // cannot follow that redirect to a sign-in page, so answer 401 plainly
    // and let the Device heal on its next visit instead.
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }
    // Anything else is our fault, not the caller's. Nothing watches this
    // path, so this log line is the only way anyone finds out it broke.
    console.error("[api/push] heal failed:", err);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
