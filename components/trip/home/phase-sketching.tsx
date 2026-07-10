import Link from "next/link";
import { MapPin, Compass } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { QuickActions } from "@/components/trip/home/quick-actions";

interface PhaseSketchingProps {
  tripId: string;
  tripName: string;
}

export async function PhaseSketching({ tripId, tripName }: PhaseSketchingProps) {
  const [stops, chapters] = await Promise.all([
    db.stop.findMany({
      where: { tripId },
      orderBy: [{ chapterSortOrder: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, country: true, nights: true, chapterId: true, arriveDate: true },
    }),
    db.chapter.findMany({
      where: { tripId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true },
    }),
  ]);

  const totalNights = stops.reduce((n, s) => n + (s.nights ?? 0), 0);
  const chapterById = new Map(chapters.map((c) => [c.id, c]));

  if (stops.length === 0) {
    return (
      <EmptyState
        icon={Compass}
        title="Let's shape this trip."
        description="Add a place or a chapter to start sketching. Set dates whenever you're ready."
        action={
          <Button asChild>
            <Link href={`/trips/${tripId}/plan`}>Open the canvas</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sketching</span>
        <p className="font-display text-2xl font-semibold tracking-tight text-foreground">{tripName}</p>
        <p className="text-sm text-muted-foreground">
          {stops.length} place{stops.length === 1 ? "" : "s"} · ~{totalNights} night{totalNights === 1 ? "" : "s"} sketched
        </p>
        <div className="mt-3">
          <Button asChild>
            <Link href={`/trips/${tripId}/plan`}>Set dates / firm up →</Link>
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 font-display text-lg font-semibold text-foreground">Your shape so far</h2>
        <ul className="flex flex-col gap-2">
          {stops.map((s) => {
            const chapter = s.chapterId ? chapterById.get(s.chapterId) : undefined;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{s.name}</span>
                {s.country && <span className="text-muted-foreground">{s.country}</span>}
                <span className="text-muted-foreground">~{s.nights ?? 0}n</span>
                {chapter && <ChapterChip name={chapter.name} colour={chapter.colour} />}
              </li>
            );
          })}
        </ul>
      </section>

      <QuickActions tripId={tripId} phase="sketching" />
    </div>
  );
}
