import type { Metadata } from "next";
import { HelpGuide } from "@/components/trip/help-guide";

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
        <p className="max-w-prose text-[13px] font-medium text-muted-foreground">
          Everything you need, shortest bits first. Open a trip to get links
          that jump straight to the right screen.
        </p>
      </div>
      <HelpGuide />
    </div>
  );
}
