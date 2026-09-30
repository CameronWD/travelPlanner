import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { NewTripFlow } from "@/components/new-trip/new-trip-flow";

type SearchParams = Promise<{ past?: string; name?: string; step?: string; fromShare?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const past = (await searchParams).past === "1";
  return { title: past ? "Log a past trip" : "New trip" };
}

export default async function NewTripPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const past = sp.past === "1";
  const [me, tripCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { displayName: true } }),
    db.tripMember.count({ where: { userId: user.id } }),
  ]);
  const displayName = me?.displayName?.trim().split(/\s+/)[0] || null;
  const initialName = typeof sp.name === "string" ? sp.name : undefined;
  const step = Number(sp.step);

  return (
    <NewTripFlow
      // "Log a past trip" is a soft navigation to this same route: re-key so the
      // flow starts over in that mode with the name adopted.
      key={`${past}:${initialName ?? ""}`}
      past={past}
      firstTrip={tripCount === 0}
      displayName={displayName}
      initialName={initialName}
      initialStep={sp.step && Number.isInteger(step) ? step : undefined}
      fromShareToken={typeof sp.fromShare === "string" && sp.fromShare ? sp.fromShare : undefined}
    />
  );
}
