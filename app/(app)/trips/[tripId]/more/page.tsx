import type { Metadata } from "next";
import Link from "next/link";
import { requireTripAccess } from "@/lib/guards";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "More",
};

/**
 * The sections the rail has no slot of its own for. Same order as the
 * phone's More sheet (Summary, then moreNav without Wishlist), Help last.
 * Hrefs are spelled here rather than read from components/trip/trip-nav.tsx:
 * that is a client module, and none of these routes is plan-scoped.
 */
const SECTIONS = [
  { segment: "summary", label: "Summary", description: "The whole trip at a glance" },
  { segment: "journal", label: "Journal", description: "What happened, day by day" },
  { segment: "checklists", label: "Checklists", description: "Things to tick off before and during" },
  { segment: "files", label: "Files", description: "Tickets, bookings and documents" },
  { segment: "activity", label: "Activity", description: "What everyone's changed" },
  { segment: "settings", label: "Settings", description: "Travellers, sharing, digests and details" },
  { segment: "help", label: "Help", description: "How to use Teepee" },
] as const;

/** The rail's More entry as a page of section tiles (beta feedback G2). */
export default async function TripMorePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  return (
    <div className="flex w-full flex-col gap-6 lg:gap-8">
      {/* <h2>: the trip layout already renders the trip name as the page <h1>. */}
      <h2 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground lg:text-4xl">
        More
      </h2>
      <ul aria-label="Trip sections" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <li key={s.segment}>
            <Link href={`/trips/${tripId}/${s.segment}`} className="block h-full rounded-lg">
              <Card interactive className="flex h-full flex-col gap-1 p-4">
                <span className="font-display text-lg font-extrabold tracking-[-0.02em]">{s.label}</span>
                <span className="text-[13px] font-medium text-muted-foreground">{s.description}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
