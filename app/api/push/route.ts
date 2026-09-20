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
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
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
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    // requireUser() redirects when signed out, which surfaces here as a throw.
    // The service worker cannot follow a redirect to a sign-in page, so say
    // 401 plainly and let it give up — the Device heals on its next visit.
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
}
