import type { FeedbackStatus } from "@/lib/enums";

export type ResolveArgs = {
  id: string;
  status: FeedbackStatus;
  resolution: string | null;
};

/**
 * Parse `feedback:resolve` arguments.
 *
 * Usage: <id> [--note "what you did" | --note=…] [--wontfix]
 * Unknown flags are an error, not a shrug — a typo'd flag must never look like
 * a successful close.
 */
export function parseResolveArgs(
  argv: string[],
): ResolveArgs | { error: string } {
  let id: string | null = null;
  let status: FeedbackStatus = "DONE";
  let resolution: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--wontfix") {
      status = "WONTFIX";
    } else if (arg === "--note") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { error: "--note needs a value, e.g. --note \"fixed the drag handle\"" };
      }
      resolution = value;
      i++;
    } else if (arg.startsWith("--note=")) {
      resolution = arg.slice("--note=".length);
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
      error: "A feedback note id is required, e.g. npm run feedback:resolve -- n1 --note \"fixed\"",
    };
  }

  return { id, status, resolution: resolution?.trim() || null };
}
