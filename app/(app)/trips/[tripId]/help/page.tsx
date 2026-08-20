import type { Metadata } from "next";
import { requireTripAccess } from "@/lib/guards";
import { HelpGuide } from "@/components/trip/help-guide";

export const metadata: Metadata = {
  title: "How to use TEEPEE",
  description: "A short guide to planning this trip together.",
};

export default async function TripHelpPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          How to use TEEPEE
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything you need, shortest bits first. The links jump straight to
          the right screen in this trip.
        </p>
      </div>
      <HelpGuide tripId={tripId} />
    </div>
  );
}
