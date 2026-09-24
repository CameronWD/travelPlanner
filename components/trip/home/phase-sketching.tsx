import Link from "next/link";
import { Route } from "lucide-react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { QuickActions } from "@/components/trip/home/quick-actions";

interface PhaseSketchingProps {
  tripId: string;
  tripName: string;
  /** A disabled trip renders as if it had no chapters (Task 13). Defaults to
   * on so existing call sites that predate the toggle keep their chapters. */
  chaptersEnabled?: boolean;
}

export async function PhaseSketching({ tripId, tripName, chaptersEnabled = true }: PhaseSketchingProps) {
  const [stops, chapters] = await Promise.all([
    db.stop.findMany({
      // Dated views follow the real plan — CONTEXT.md; consistent with
      // calendar/day/print/summary. Policy (not a BND-2 spelling exemption):
      // deliberately ignores `?plan=` — never wire in a variable plan here.
      where: { tripId, ...REAL_PLAN },
      orderBy: [{ chapterSortOrder: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, country: true, nights: true, chapterId: true, arriveDate: true },
    }),
    // A disabled trip renders as if it had no chapters — skip the query
    // entirely rather than fetch-then-discard.
    chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN },
          orderBy: { name: "asc" },
          select: { id: true, name: true, colour: true },
        })
      : Promise.resolve([]),
  ]);

  const totalNights = stops.reduce((n, s) => n + (s.nights ?? 0), 0);
  const chapterById = new Map(chapters.map((c) => [c.id, c]));

  if (stops.length === 0) {
    // Kit shared/states.jsx "Plan" empty.
    return (
      <EmptyState
        icon={Route}
        tone="teal"
        title="No stops yet"
        description="Add the first place. We'll draw the route as you go."
        action={
          <Button asChild>
            <Link href={`/trips/${tripId}/plan`}>+ Add a place</Link>
          </Button>
        }
      />
    );
  }

  // Kit DHome.jsx / Home.jsx: coral hero (chip + name + figure) beside the
  // Route card; quick actions below.
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <Card tone="coral" shadow={3} radius="xl" className="flex flex-col p-[18px] lg:p-[22px]">
          <Badge caps className="self-start">Sketching</Badge>
          <h2 className="mt-3.5 font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] text-balance">
            {tripName}
          </h2>
          <p className="mt-2 text-[13px] font-semibold">
            {stops.length} place{stops.length === 1 ? "" : "s"} · ~{totalNights} night{totalNights === 1 ? "" : "s"} sketched
          </p>
          <div className="mt-4">
            {/* secondary, not primary: the island re-scopes --primary but not
                --primary-foreground, so an ink button here goes dark-on-dark
                in dark mode. */}
            <Button asChild variant="secondary">
              <Link href={`/trips/${tripId}/plan`}>Firm up →</Link>
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-label text-muted-foreground">Route</h3>
          <ul className="mt-1.5 flex flex-col gap-1">
            {stops.map((s) => {
              const chapter = s.chapterId ? chapterById.get(s.chapterId) : undefined;
              return (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-[15px] font-extrabold tracking-[-0.02em] text-foreground">{s.name}</span>
                  <span className="text-xs font-semibold text-muted-foreground">~{s.nights ?? 0}n</span>
                  {s.country && <span className="text-xs font-semibold text-muted-foreground">{s.country}</span>}
                  {chapter && <ChapterChip name={chapter.name} colour={chapter.colour} />}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <QuickActions tripId={tripId} phase="sketching" />
    </div>
  );
}
