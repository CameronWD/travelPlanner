import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { Sparkles } from "lucide-react";
import { RELEASE_NOTES, releaseNoteDate } from "@/lib/release-notes";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "What's new" };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The full **What's new** list — every **Release note**, newest first,
 * grouped under the day it shipped.
 *
 * Deliberately read-only: visiting does NOT mark anything read. Dismissing
 * the card is the single write, so rendering this page never has a side
 * effect.
 */
export default async function WhatsNewPage() {
  await requireUser();

  const groups: { date: string; notes: typeof RELEASE_NOTES }[] = [];
  for (const note of RELEASE_NOTES) {
    const date = releaseNoteDate(note);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.notes.push(note);
    else groups.push({ date, notes: [note] });
  }

  return (
    <div className="flex flex-col gap-3 lg:gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground lg:text-4xl">
          What&apos;s new
        </h1>
        <p className="text-[13px] font-medium text-muted-foreground">
          Changes to Teepee, newest first.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={Sparkles} tone="coral" title="Nothing yet" className="lg:max-w-[720px]" />
      ) : (
        // The kit's release column: one Card per release, the newest a coral
        // lead card (shadow 4), the rest white (shadow 2), capped at 720px.
        <div className="flex flex-col gap-3 lg:max-w-[720px]">
          {groups.map((group, i) => {
            const lead = i === 0;
            return (
              <Card
                key={group.date}
                data-slot="release"
                tone={lead ? "coral" : "white"}
                shadow={lead ? 4 : 2}
                className="p-[18px]"
              >
                <h2
                  className={cn(
                    "text-[11px] font-bold uppercase leading-tight tracking-[0.08em]",
                    lead ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {formatDate(group.date)}
                </h2>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {group.notes.map((note) => (
                    <li
                      key={note.publishedAt}
                      className={cn(
                        "flex gap-2 font-medium leading-snug text-foreground",
                        lead ? "text-[15px]" : "text-[13px]",
                      )}
                    >
                      <span aria-hidden="true" className="select-none font-extrabold">
                        ·
                      </span>
                      <span>{note.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
