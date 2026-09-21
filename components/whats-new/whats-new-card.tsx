"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { dismissWhatsNew } from "@/server/actions/release-notes";
import type { ReleaseNote } from "@/lib/release-notes";

/**
 * The **What's new** card: how a release finds a **Traveller**.
 *
 * Renders in the content flow rather than over it, and only where a Traveller
 * *arrives* — the trips list and a Trip's Home. It is deliberately absent from
 * a Day view or the plan editor, which are places you are using the app rather
 * than returning to it.
 *
 * `notes` arrives already filtered to unread and already capped at
 * WHATS_NEW_CARD_LIMIT; `totalUnread` is how many there really are, so the
 * card can point at the rest. Dismissing marks the whole release read — see
 * dismissWhatsNew.
 */
export function WhatsNewCard({
  notes,
  totalUnread,
}: {
  notes: ReleaseNote[];
  totalUnread: number;
}) {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed || notes.length === 0) return null;

  const overflow = totalUnread - notes.length;

  async function handleDismiss() {
    // Hide first. The write is best-effort: offline it rejects and the card
    // returns on the next online load, which is a second tap rather than lost
    // work. What it must never do is spring back under the cursor.
    setDismissed(true);
    try {
      await dismissWhatsNew();
    } catch {
      // Deliberately swallowed — see above.
    }
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss What's new"
        className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2 pr-10">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold tracking-tight">
          What&apos;s new
        </h2>
      </div>

      <ul className="mt-3 space-y-1.5">
        {notes.map((note, index) => (
          // ReleaseNote has no id, and nothing guarantees publishedAt is
          // unique across notes — the index disambiguates a same-timestamp
          // pair so two notes never collide on one React key.
          <li
            key={`${note.publishedAt}-${index}`}
            className="flex gap-2 text-sm text-muted-foreground"
          >
            <span aria-hidden="true" className="select-none text-primary">
              ·
            </span>
            <span className="text-foreground">{note.text}</span>
          </li>
        ))}
      </ul>

      {overflow > 0 ? (
        <Link
          href="/whats-new"
          className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          and {overflow} more →
        </Link>
      ) : null}
    </div>
  );
}
