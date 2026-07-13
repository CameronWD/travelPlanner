import type { Metadata } from "next";
import { requireGlobeAccess } from "@/lib/globe";
import { db } from "@/lib/db";
import { getDiscreetState } from "@/lib/discreet-server";
import { GlobeView } from "@/components/globe/globe-view";
import type { MarkerView, GlobeMemberView } from "@/components/globe/types";
import type { AttachmentView } from "@/components/trip/attachment-list";

export async function generateMetadata(): Promise<Metadata> {
  const { discreet, label } = await getDiscreetState();
  return { title: discreet ? label : "Globe · TEEPEE" };
}

export default async function GlobePage() {
  const { globe } = await requireGlobeAccess();

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Globe</h1>
      </div>
      <GlobeView
        markers={markers}
        members={members}
        globeId={globe.id}
        attachmentsByMarkerId={attachmentsByMarkerId}
      />
    </div>
  );
}
