/**
 * The Reviews this tab has seen running or started itself (final wave I2),
 * so ReviewPoller can toast why one ended FAILED: once, and only for a run
 * this tab was waiting on, never for an old failure in the history. Module
 * state: one set per browser tab, gone on reload, like the poll itself.
 */
const watched = new Set<string>();

export function watchReview(id: string): void {
  watched.add(id);
}

/** True once for a watched Review, which stops being watched. */
export function takeWatchedReview(id: string): boolean {
  return watched.delete(id);
}
