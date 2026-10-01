import type { Metadata } from "next";
import { requireTripAccess } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { HelpGuide } from "@/components/trip/help-guide";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { OnThisPage } from "@/components/ui/on-this-page";
import { helpContents } from "@/lib/help-guide";

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
          level={2}: this page's own h1 (PageHeader) is the only heading above it now.
          Same two-column shape as /help: fluid guide, 14rem sticky rail from lg. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-x-12">
        <HelpGuide tripId={slug} level={2} />
        <OnThisPage groups={helpContents()} className="help-print-hide" />
      </div>
    </div>
  );
}
