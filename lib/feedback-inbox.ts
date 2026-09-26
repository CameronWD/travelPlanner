import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/enums";
import { areaForRoute } from "@/lib/feedback-context";
import { describeDevice } from "@/lib/feedback-device";
import { siteLabel, siteOf } from "@/lib/feedback-site";

/** A Feedback note as the inbox renders it. */
export type InboxNote = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string;
  viewport: string | null;
  userAgent: string | null;
  status: FeedbackStatus;
  authoredAt: Date;
  /** When it reached the server — later than authoredAt for an offline note. */
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
  /** Never null — a note written before sites were recorded reads as "main". */
  site: string;
};

/** The Prisma selection `scripts/feedback-pull.ts` reads. */
export type FeedbackNoteRow = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  viewport: string | null;
  userAgent: string | null;
  status: string;
  authoredAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
  authorName: string | null;
  site: string | null;
};

/**
 * One database row as the inbox sees it.
 *
 * Lived inline in `scripts/feedback-pull.ts`, where it could not be tested —
 * a field silently dropped from the mapping would have shown up only as a
 * missing line in a generated file nobody diffs closely (FN-12). `status`
 * comes back as a plain string, so an unrecognised one falls back to OPEN
 * rather than rendering as a struck-through note with no badge.
 */
export function toInboxNote(row: FeedbackNoteRow): InboxNote {
  return {
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.authorName ?? "Traveller",
    viewport: row.viewport,
    userAgent: row.userAgent,
    status: (FEEDBACK_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as FeedbackStatus)
      : "OPEN",
    authoredAt: row.authoredAt,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
    site: siteOf(row.site),
  };
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: "Open",
  DONE: "Done",
  WONTFIX: "Won't fix",
};

/** "2026-09-07" — the day is enough context; the exact minute never is. */
function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Indent continuation lines so a multi-line body stays one list item. */
function indentBody(body: string): string {
  return body.trim().split("\n").join("\n  ");
}

/** Section order: Beta first (what's about to ship), then Main, then everything else alphabetically. */
const SITE_SECTION_PRIORITY: Record<string, number> = { beta: 0, main: 1 };

function compareSites(a: string, b: string): number {
  const pa = SITE_SECTION_PRIORITY[a] ?? 2;
  const pb = SITE_SECTION_PRIORITY[b] ?? 2;
  if (pa !== pb) return pa - pb;
  return pa === 2 ? a.localeCompare(b) : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Did this note sit in an offline queue long enough to be worth saying so?
 *
 * ADR 0041 promises a note can land materially later than it was written, and
 * that gap changes how you read it. A few minutes' or hours' lag is just the
 * clock, so only a day or more earns a line.
 */
function landedLate(note: InboxNote): boolean {
  return Math.abs(note.createdAt.getTime() - note.authoredAt.getTime()) > DAY_MS;
}

function renderNote(note: InboxNote, { showSite }: { showSite: boolean }): string {
  const meta = [
    showSite ? siteLabel(note.site) : null,
    note.pageLabel,
    note.tripName,
    note.authorName,
    day(note.authoredAt),
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    `- **${meta}** — \`${note.id}\``,
    `  ${indentBody(note.body)}`,
    `  _${note.route}_`,
  ];

  // What the author was actually looking at. Stored on every row since ADR
  // 0040; useless until it is in front of the reader.
  const device = [note.viewport, describeDevice(note.userAgent)]
    .filter(Boolean)
    .join(" · ");
  if (device) lines.push(`  _${device}_`);

  if (landedLate(note)) lines.push(`  _Landed ${day(note.createdAt)}_`);

  if (note.status !== "OPEN") {
    const resolved = note.resolvedAt ? ` on ${day(note.resolvedAt)}` : "";
    lines.push(
      `  → **${STATUS_LABELS[note.status] ?? note.status}**${resolved}${note.resolution ? `: ${note.resolution}` : ""}`,
    );
  }

  return lines.join("\n");
}

/**
 * Render the Feedback inbox (ADR 0040).
 *
 * Open notes first, grouped by the area they came from and oldest first within
 * each group — the oldest annoyance has been annoying the longest. Resolved
 * notes follow as history, most recently resolved first.
 */
export function renderInbox(notes: InboxNote[], generatedAt: Date): string {
  const open = notes
    .filter((n) => n.status === "OPEN")
    .sort((a, b) => a.authoredAt.getTime() - b.authoredAt.getTime());
  const resolved = notes
    .filter((n) => n.status !== "OPEN")
    .sort(
      (a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0),
    );

  // Open notes grouped by the site they were written on — Beta first (what's
  // about to ship), then Main, then any other branch alphabetically.
  const bySite = new Map<string, InboxNote[]>();
  for (const note of open) {
    const bucket = bySite.get(note.site);
    if (bucket) bucket.push(note);
    else bySite.set(note.site, [note]);
  }
  const siteOrder = [...bySite.keys()].sort(compareSites);

  const summary =
    open.length === 0
      ? `_${open.length} open, ${resolved.length} resolved · pulled ${day(generatedAt)}_`
      : `_${open.length} open (${siteOrder
          .map((site) => `${siteLabel(site)} ${bySite.get(site)!.length}`)
          .join(" · ")}), ${resolved.length} resolved · pulled ${day(generatedAt)}_`;

  const out: string[] = [
    "# Feedback inbox",
    "",
    "Feedback notes written from inside Teepee (ADR 0040). **Generated by " +
      "`npm run feedback:pull` — do not edit by hand; the database is the truth " +
      "and this file is its printout.** Resolve a Feedback note with " +
      "`npm run feedback:resolve -- <id> --site <site> --note \"what you did\"`.",
    "",
    // The day, not the instant: this file is committed to make backlog movement
    // readable in git, and a to-the-millisecond stamp makes every pull a diff
    // even when nothing changed.
    summary,
    "",
  ];

  if (open.length === 0) {
    out.push("## Open", "", "No open feedback notes.", "");
  } else {
    for (const site of siteOrder) {
      out.push(`## Open · ${siteLabel(site)}`, "");
      const bucket = bySite.get(site)!;
      const areas = new Map<string, InboxNote[]>();
      for (const note of bucket) {
        const area = areaForRoute(note.route);
        const areaBucket = areas.get(area);
        if (areaBucket) areaBucket.push(note);
        else areas.set(area, [note]);
      }
      for (const [area, areaBucket] of areas) {
        out.push(`### ${area}`, "");
        for (const note of areaBucket) out.push(renderNote(note, { showSite: false }), "");
      }
    }
  }

  if (resolved.length > 0) {
    out.push("## Resolved", "");
    for (const note of resolved) out.push(renderNote(note, { showSite: true }), "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
