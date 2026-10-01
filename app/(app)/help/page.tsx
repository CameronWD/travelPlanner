import type { Metadata } from "next";
import { HelpGuide } from "@/components/trip/help-guide";
import { OnThisPage } from "@/components/ui/on-this-page";
import { helpContents } from "@/lib/help-guide";

export const metadata: Metadata = {
  title: "How to use Teepee",
  description: "A short guide to planning a trip together in Teepee.",
};

export default function HelpPage() {
  return (
    <div className="flex w-full flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground lg:text-4xl">
          How to use Teepee
        </h1>
        <p className="max-w-[60ch] text-[13px] font-medium text-muted-foreground">
          Everything you need, shortest bits first. Open a trip to get links
          that jump straight to the right screen.
        </p>
      </div>
      {/* From lg the guide's three-up card grid keeps the fluid column and the
          rail takes a fixed 14rem (What's new's proportions); legal-page's
          38rem reading track would squeeze the cards. Below lg the guide's own
          "What's in here" chip box is the contents and the rail is hidden. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-x-12">
        <HelpGuide />
        <OnThisPage groups={helpContents()} className="help-print-hide" />
      </div>
    </div>
  );
}
