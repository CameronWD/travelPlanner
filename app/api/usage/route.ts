import { after } from "next/server";
import { auth } from "@/lib/auth/auth";
import { reportError } from "@/lib/error-sink";
import { createRateLimiter } from "@/lib/rate-limit";
import { MAX_BODY_BYTES } from "@/lib/usage/lists";
import { storeUsageBatch } from "@/lib/usage/store";
import { readUsageRecording } from "@/lib/usage/switch";
import { parseUsageBatch } from "@/lib/usage/validate";

// A cold or exhausted database must not hold a function open (pg has no connect timeout here).
export const maxDuration = 10;

const usageLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

const NO_STORE = { "Cache-Control": "no-store" };

function status(code: number): Response {
  return new Response(null, { status: code, headers: NO_STORE });
}

function recording(on: boolean): Response {
  return Response.json({ recording: on }, { headers: NO_STORE });
}

export async function POST(req: Request): Promise<Response> {
  let userId: string | undefined;
  try {
    const session = await auth();
    if (!session) return status(401);
    userId = session.user.id;
    if (!usageLimiter.allow(userId)) return status(429);
    if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) return status(413);
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return status(413);

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return status(400);
    }
    const batch = parseUsageBatch(raw, Date.now());
    if (!batch) return status(400);

    if (!(await readUsageRecording())) return recording(false);
    await storeUsageBatch(userId, batch.records);
    return recording(true);
  } catch {
    // A fixed message, never the original error: a database error can carry
    // connection detail that does not belong in the error sink. Reported after
    // the response, because the sink writes to the database that just failed.
    try {
      after(async () => {
        try {
          await reportError(new Error("Usage batch was not stored"), { route: "/api/usage", source: "server", userId });
        } catch {}
      });
    } catch {}
    return status(503);
  }
}
