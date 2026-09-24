import type { Metadata } from "next";
import { requireTripAccess } from "@/lib/guards";
import { HelpGuide } from "@/components/trip/help-guide";

export const metadata: Metadata = {
  title: "How to use Teepee",
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
    <div className="flex w-full flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-1.5">
        {/* <h2>, not <h1>: the trip layout already renders the trip name as the
            page <h1> above {children}, and every other trip page tops out at
            <h2>. The guide below starts at <h3> (level={3}) to nest under it. */}
        <h2 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground lg:text-4xl">
          How to use Teepee
        </h2>
        <p className="max-w-prose text-[13px] font-medium text-muted-foreground">
          Everything you need, shortest bits first. The links jump straight to
          the right screen in this trip.
        </p>
      </div>
      <HelpGuide tripId={tripId} level={3} />
    </div>
  );
}
