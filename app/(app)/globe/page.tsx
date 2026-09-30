import type { Metadata } from "next";
import { requireGlobeAccess } from "@/lib/globe";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { GlobeView } from "@/components/globe/globe-view";
import type { MarkerView, GlobeMemberView, GlobeArrival } from "@/components/globe/types";
import type { AttachmentView } from "@/components/trip/attachment-list";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Globe" };
}

export default async function GlobePage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const { user, globe } = await requireGlobeAccess();

  const [markersRaw, membersRaw, attachmentsRaw] = await Promise.all([
    db.marker.findMany({
      where: { globeId: globe.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, category: true, note: true, link: true, timing: true,
        lat: true, lng: true, city: true, country: true, countryCode: true,
      },
    }),
    db.globeMember.findMany({
      where: { globeId: globe.id },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    }),
    db.attachment.findMany({
      where: { globeId: globe.id, targetType: "MARKER" },
      select: {
        id: true, filename: true, mime: true, size: true, url: true,
        uploadedById: true, createdAt: true, targetId: true,
      },
    }),
  ]);

  const markers: MarkerView[] = markersRaw;
  const members: GlobeMemberView[] = membersRaw.map((m) => ({
    userId: m.userId,
    role: m.role,
    name: m.user.name,
    email: m.user.email,
  }));

  const attachmentsByMarkerId: Record<string, AttachmentView[]> = {};
  for (const att of attachmentsRaw) {
    if (!att.targetId) continue;
    (attachmentsByMarkerId[att.targetId] ??= []).push({
      id: att.id,
      filename: att.filename,
      mime: att.mime,
      size: att.size,
      url: att.url,
      uploadedById: att.uploadedById,
      createdAt: att.createdAt,
    });
  }

  const added = (await searchParams).added;
  const arrival = typeof added === "string" && added ? await loadArrival(user.id, added) : null;

  return (
    <GlobeView
      markers={markers}
      members={members}
      globeId={globe.id}
      attachmentsByMarkerId={attachmentsByMarkerId}
      arrival={arrival}
    />
  );
}

/**
 * The just-created Trip's located real-plan Stops, drawn as the Globe's
 * `?added=` arrival pins. The `added` id comes straight from the URL, so this
 * only loads a Trip the signed-in user is a member of — an unknown or foreign
 * id silently shows nothing (no error, no leak of another Trip's Stops).
 */
async function loadArrival(userId: string, tripId: string): Promise<GlobeArrival | null> {
  const member = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { id: true },
  });
  if (!member) return null;
  const stops = await db.stop.findMany({
    where: { tripId, ...REAL_PLAN, lat: { not: null }, lng: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, lat: true, lng: true },
  });
  return { tripId, pins: stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat as number, lng: s.lng as number })) };
}
