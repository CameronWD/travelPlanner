/**
 * A Reminder's notes (spec 2026-10-16 F8): folded under a "Notes" tap target
 * wherever a Reminder is listed, so the list stays a list of titles. Native
 * <details> — keyboard and screen-reader behaviour for free, no state.
 */
export function ReminderNotes({ notes }: { notes: string }) {
  return (
    <details className="group mt-1">
      <summary className="min-h-11 cursor-pointer list-none py-2 text-xs font-semibold text-muted-foreground hover:text-foreground sm:min-h-0 sm:py-0">
        Notes
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">{notes}</p>
    </details>
  );
}
