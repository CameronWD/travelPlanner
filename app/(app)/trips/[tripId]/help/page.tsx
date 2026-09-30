import type { Metadata } from "next";
import { requireTripAccess } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { HelpGuide } from "@/components/trip/help-guide";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";

export const metadata: Metadata = {
  title: "Help",
  description: "A short guide to planning this trip together.",
};

export default async function TripHelpPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const [shell, slug] = await Promise.all([readTripShell(tripId), tripSlugFor(tripId)]);

  return (
    <div className="flex w-full flex-col gap-6 lg:gap-8">
      <PageHeader
        eyebrow={shell?.name}
        title="How to use Teepee"
        meta="Everything you need, shortest bits first. The links jump straight to the right screen in this trip."
        metaOnMobile
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
      />
      {/* HelpGuide builds links from this; it is the Trip's URL ref (slug), ADR 0064.
          level={2}: this page's own h1 (PageHeader) is the only heading above it now. */}
      <HelpGuide tripId={slug} level={2} />
    </div>
  );
}
