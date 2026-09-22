import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { RELEASE_NOTES, releaseNoteDate } from "@/lib/release-notes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "What's new · TEEPEE" };
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
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          What&apos;s new
        </h1>
        <p className="text-sm text-muted-foreground">
          Changes to TEEPEE, newest first.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.date} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {formatDate(group.date)}
              </h2>
              <ul className="space-y-1.5">
                {group.notes.map((note) => (
                  <li key={note.publishedAt} className="flex gap-2 text-sm">
                    <span aria-hidden="true" className="select-none text-primary">
                      ·
                    </span>
                    <span className="text-foreground">{note.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
