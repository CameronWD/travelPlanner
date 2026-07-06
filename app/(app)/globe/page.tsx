import type { Metadata } from "next";
import { requireGlobeAccess } from "@/lib/globe";
import { db } from "@/lib/db";
import { getDiscreetState } from "@/lib/discreet-server";
import { GlobeView } from "@/components/globe/globe-view";
import type { MarkerView, GlobeMemberView } from "@/components/globe/types";

export async function generateMetadata(): Promise<Metadata> {
  const { discreet, label } = await getDiscreetState();
  return { title: discreet ? label : "Globe · TEEPEE" };
}

export default async function GlobePage() {
  const { globe } = await requireGlobeAccess();

  const [markersRaw, membersRaw] = await Promise.all([
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
  ]);

  const markers: MarkerView[] = markersRaw;
  const members: GlobeMemberView[] = membersRaw.map((m) => ({
    userId: m.userId,
    role: m.role,
    name: m.user.name,
    email: m.user.email,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Globe</h1>
      </div>
      <GlobeView markers={markers} members={members} />
    </div>
  );
}
