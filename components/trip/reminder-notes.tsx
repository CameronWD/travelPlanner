import { ChevronRight } from "lucide-react";

/**
 * A Reminder's notes (spec 2026-10-16 F8): folded under a "Notes" tap target
 * wherever a Reminder is listed, so the list stays a list of titles. Native
 * <details> — keyboard and screen-reader behaviour for free, no state.
 *
 * The chevron is the only open/closed cue for sighted users (the summary's
 * `list-none` removes the native disclosure triangle); it rotates on open and
 * is `aria-hidden` since <details>/<summary> already expose the state to
 * assistive tech.
 */
export function ReminderNotes({ notes }: { notes: string }) {
  return (
    <details className="group mt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground sm:min-h-0 sm:py-0">
        <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
        Notes
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">{notes}</p>
    </details>
  );
}
