import { NextRequest, NextResponse } from "next/server";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { staticMapId } from "@/lib/map/google-config";
import { fetchStaticMapBytes } from "@/lib/map/static-map-fetch";
import { decodeSnapshotPins, SNAPSHOT_SIZE, type SnapshotShape } from "@/lib/trips/route-snapshot";

/**
 * GET /api/trips/:tripId/route-snapshot?shape=<tall|square|band>&p=<pins>
 *
 * Draws the pins the URL carries as a Google static map. The page chooses the
 * pins and the route never reads Stops, so it can draw nothing the caller did
 * not send. It only checks the caller is a member of the Trip.
 */
const NO_STORE = { "Cache-Control": "no-store" };

function isShape(value: string | null): value is SnapshotShape {
  return value !== null && Object.hasOwn(SNAPSHOT_SIZE, value);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  await requireUser();
  await requireTripAccess(tripId);

  const shape = req.nextUrl.searchParams.get("shape");
  const pins = decodeSnapshotPins(req.nextUrl.searchParams.get("p"));
  if (!isShape(shape) || !pins) {
    return NextResponse.json({ error: "Bad snapshot request" }, { status: 400, headers: NO_STORE });
  }

  const mapId = staticMapId();
  const bytes = mapId
    ? await fetchStaticMapBytes({
        mapId,
        ...SNAPSHOT_SIZE[shape],
        home: null,
        showReturn: false,
        stops: pins.map((p) => ({ id: String(p.number), lat: p.lat, lng: p.lng, sortOrder: p.sortOrder, number: p.number })),
      })
    : null;
  if (!bytes) {
    return NextResponse.json({ error: "Map unavailable" }, { status: 503, headers: NO_STORE });
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
