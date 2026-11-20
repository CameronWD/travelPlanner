import { formatDayLabel, formatDayMonth } from "@/lib/dates";
import { plural } from "@/lib/plural";
import { SCREEN_LABELS, actionLabel, formatMicroUsd } from "./labels";
import type { UsageScreen } from "./lists";
import type { UsageOverview, UsageTripReport } from "./report";

const ZONE_SHAPE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/;

export function isValidTimeZone(tz: string): boolean {
  if (tz === "UTC") return true;
  if (!ZONE_SHAPE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveReportZone(requested: string | null, machineZone: string): { zone: string } | { error: string } {
  if (requested === null) return { zone: machineZone };
  return isValidTimeZone(requested) ? { zone: requested } : { error: `Unknown zone ${requested}. Use UTC or a name like Australia/Brisbane.` };
}

export function renderUsageReport(
  trip: { name: string },
  overview: UsageOverview,
  report: UsageTripReport,
  timeZone: string,
): string {
  const lines: string[] = [];
  lines.push(`Usage for ${trip.name} (days in ${timeZone})`);
  lines.push(`Recording: ${overview.recording ? "on" : "off"}`);
  lines.push(`Records from the main site: ${overview.total}`);
  lines.push(`Last arrived: ${overview.lastReceivedAt ? overview.lastReceivedAt.toISOString() : "never"}`);
  if (overview.fromOtherSites > 0) {
    lines.push(`Records from beta and other sites, not counted below: ${overview.fromOtherSites}`);
  }
  if (report.fromOtherSites > 0) {
    lines.push(`Of those, for this Trip: ${report.fromOtherSites}`);
  }

  const { microUsd, runs, unpriced } = report.ai;
  lines.push(
    runs === 0
      ? "AI: no runs"
      : `AI: ${formatMicroUsd(microUsd)} across ${plural(runs, "run")}${unpriced > 0 ? `, ${unpriced} with no price` : ""}`,
  );
  if (report.google) {
    const range = `${formatDayMonth(report.google.from)} to ${formatDayMonth(report.google.to)}`;
    lines.push(
      report.google.calls.length === 0
        ? `Google calls, app-wide, ${range}: none`
        : `Google calls, app-wide, ${range}: ${report.google.calls.map((c) => `${c.sku} ${c.count}`).join(", ")}`,
    );
  }
  lines.push("The AI and Google counts include beta, which they can’t tell apart.");

  if (report.travellers.length === 0) {
    lines.push("", "No Usage for this Trip yet.");
    return lines.join("\n");
  }

  for (const traveller of report.travellers) {
    lines.push("", traveller.name);
    for (const day of traveller.days) {
      const head = [`${formatDayLabel(day.day)} (${day.day})`, plural(day.screenCount, "screen"), plural(day.actionCount, "action")];
      if (day.medianMs !== null) head.push(`median ${day.medianMs} ms`);
      if (day.savedCopies > 0) head.push(`${day.savedCopies} from a saved copy`);
      lines.push(`  ${head.join(", ")}`);

      const screens = (Object.entries(day.screens) as [UsageScreen, number][])
        .sort((a, b) => b[1] - a[1] || SCREEN_LABELS[a[0]].localeCompare(SCREEN_LABELS[b[0]]))
        .map(([screen, count]) => `${SCREEN_LABELS[screen]} ${count}`);
      if (screens.length > 0) lines.push(`    Screens: ${screens.join(", ")}`);

      const actions = day.actions
        .map((a) => ({ label: actionLabel(a.action, a.detail), count: a.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .map((a) => `${a.label} ${a.count}`);
      if (actions.length > 0) lines.push(`    Actions: ${actions.join(", ")}`);
    }
  }
  return lines.join("\n");
}
