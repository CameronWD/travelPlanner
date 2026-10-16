export type AcceptArgs = {
  id: string;
  /** Look the note up and report the change without making it. */
  dryRun: boolean;
};

/**
 * Parse `feedback:accept` arguments (ADR 0040, amended 2026-09-29).
 *
 * Usage: <id> [--dry-run]
 * Pure, like `parseResolveArgs`. Unknown flags are an error, not a shrug — a
 * typo'd flag must never look like a successful accept, and `--note` or
 * `--wontfix` here almost certainly meant `feedback:resolve`.
 */
export function parseAcceptArgs(argv: string[]): AcceptArgs | { error: string } {
  let id: string | null = null;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--")) {
      return { error: `Unknown flag ${arg}` };
    } else if (id === null) {
      id = arg;
    } else {
      return { error: `Unexpected argument ${arg}` };
    }
  }

  if (!id) {
    return {
      error: "A Feedback note id is required, e.g. npm run feedback:accept -- n1",
    };
  }

  return { id, dryRun };
}
