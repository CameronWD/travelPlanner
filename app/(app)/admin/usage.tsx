"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formError } from "@/components/ui/action-failure";
import { formatDayLabel, formatDayMonth } from "@/lib/dates";
import { plural } from "@/lib/plural";
import { relativeTime } from "@/lib/relative-time";
import { deviceTimeZone } from "@/lib/tz";
import { SCREEN_LABELS, actionLabel, formatMicroUsd } from "@/lib/usage/labels";
import type { UsageScreen } from "@/lib/usage/lists";
import type { UsageDayFigures, UsageTripReport } from "@/lib/usage/report";
import { readUsageTrip, setUsageRecording, type UsageOverviewView } from "@/server/actions/usage";

const badgeClass = "min-w-0 max-w-full whitespace-normal break-words";

function daySummary(day: UsageDayFigures): string {
  const parts = [formatDayLabel(day.day), plural(day.screenCount, "screen"), plural(day.actionCount, "action")];
  if (day.medianMs !== null) parts.push(`median ${day.medianMs} ms`);
  if (day.savedCopies > 0) parts.push(`${day.savedCopies} from a saved copy`);
  return parts.join(" · ");
}

function overviewSentence(o: UsageOverviewView, now: Date): string {
  const others = o.fromOtherSites;
  if (o.total > 0) {
    const last = o.lastReceivedAt ? ` The last one arrived ${relativeTime(new Date(o.lastReceivedAt), now)}.` : "";
    const more = others > 0 ? ` ${others} more came from beta and other sites.` : "";
    return `${plural(o.total, "record")}.${last}${more}`;
  }
  if (others > 0) return `No records from the main site yet. ${others} came from beta and other sites.`;
  return "No records yet.";
}

function costsLine(report: UsageTripReport): string {
  const { microUsd, runs, unpriced } = report.ai;
  if (runs === 0) return "AI: no runs";
  const unpricedPart = unpriced > 0 ? `, ${unpriced} with no price` : "";
  return `AI: ${formatMicroUsd(microUsd)} across ${plural(runs, "run")}${unpricedPart}`;
}

function googleLine(google: NonNullable<UsageTripReport["google"]>): string {
  const range = `${formatDayMonth(google.from)} to ${formatDayMonth(google.to)}`;
  if (google.calls.length === 0) return "No Google calls in those dates";
  const calls = google.calls.map((c) => `${c.sku} ${c.count}`).join(", ");
  return `Google calls on every Trip, ${range}: ${calls}`;
}

function DayFigures({ day }: { day: UsageDayFigures }) {
  const screens = (Object.entries(day.screens) as [UsageScreen, number][]).sort(
    (a, b) => b[1] - a[1] || SCREEN_LABELS[a[0]].localeCompare(SCREEN_LABELS[b[0]]),
  );
  const actions = day.actions
    .map((a) => ({ ...a, label: actionLabel(a.action, a.detail) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return (
    <details className="rounded-md border-2 border-border bg-card px-3 py-2">
      <summary className="min-w-0 cursor-pointer break-words text-sm font-medium text-foreground">
        {daySummary(day)}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {screens.length > 0 && (
          <ul aria-label="Screens" className="flex flex-wrap gap-1.5">
            {screens.map(([screen, count]) => (
              <li key={screen} className="min-w-0 max-w-full">
                <Badge className={badgeClass}>{`${SCREEN_LABELS[screen]} ${count}`}</Badge>
              </li>
            ))}
          </ul>
        )}
        {actions.length > 0 && (
          <ul aria-label="Actions" className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <li key={`${a.action}:${a.detail ?? ""}`} className="min-w-0 max-w-full">
                <Badge variant="secondary" className={badgeClass}>{`${a.label} ${a.count}`}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function TripReport({ report }: { report: UsageTripReport }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1 text-sm text-muted-foreground">
        <p className="min-w-0 break-words">{costsLine(report)}</p>
        {report.google && <p className="min-w-0 break-words">{googleLine(report.google)}</p>}
        <p className="min-w-0 break-words text-xs">The AI and Google counts include beta, which they can’t tell apart.</p>
        {report.fromOtherSites > 0 && (
          <p className="min-w-0 break-words">
            {plural(report.fromOtherSites, "more record")} for this Trip came from beta or other sites.
          </p>
        )}
      </div>

      {report.travellers.length === 0 && <p className="text-sm text-muted-foreground">No Usage for this Trip yet.</p>}

      {report.travellers.map((traveller) => (
        <div key={traveller.userId} className="flex min-w-0 flex-col gap-2">
          <h4 className="min-w-0 break-words text-sm font-semibold text-foreground">{traveller.name}</h4>
          {traveller.days.map((day) => (
            <DayFigures key={day.day} day={day} />
          ))}
        </div>
      ))}
    </div>
  );
}

type TripState = { status: "idle" } | { status: "loading" } | { status: "failed" } | { status: "ready"; report: UsageTripReport };

export function UsagePanel({
  initial,
  recording: initialRecording,
  now,
}: {
  initial: UsageOverviewView | null;
  recording: boolean | null;
  now: Date;
}) {
  const [recording, setRecording] = React.useState<boolean | null>(initialRecording);
  const [switching, setSwitching] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [trip, setTrip] = React.useState<TripState>({ status: "idle" });
  const latest = React.useRef(0);

  async function toggle(next: boolean) {
    const before = recording;
    setRecording(next);
    setMessage(null);
    setSwitching(true);
    try {
      const result = await setUsageRecording(next);
      if (!result.success) {
        setRecording(before);
        setMessage(formError(result) ?? "Couldn’t change that.");
      }
    } catch {
      setRecording(before);
      setMessage("Couldn’t change that. Try again.");
    } finally {
      setSwitching(false);
    }
  }

  async function pick(tripId: string) {
    const ticket = ++latest.current;
    setTrip({ status: "loading" });
    let next: TripState;
    try {
      const report = await readUsageTrip(tripId, deviceTimeZone() ?? "UTC");
      next = report ? { status: "ready", report } : { status: "failed" };
    } catch {
      next = { status: "failed" };
    }
    if (ticket === latest.current) setTrip(next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card radius="md" shadow={1} className="flex items-center justify-between gap-3 p-3.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">
            Recording
          </span>
          <span className="min-w-0 break-words text-xs text-muted-foreground">
            Screens and named actions from every signed-in Traveller
          </span>
        </div>
        {recording === null ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={switching} onClick={() => void toggle(false)}>
              Turn recording off
            </Button>
            <Button size="sm" variant="outline" disabled={switching} onClick={() => void toggle(true)}>
              Turn recording on
            </Button>
          </div>
        ) : (
          <Switch aria-label="Recording" checked={recording} disabled={switching} onCheckedChange={(v) => void toggle(v)} />
        )}
      </Card>

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </p>
      )}

      {!initial && (
        <p role="status" className="text-sm text-destructive">
          Couldn’t read Usage just now.
        </p>
      )}

      {initial && (
        <p className="min-w-0 break-words text-sm text-muted-foreground">{overviewSentence(initial, now)}</p>
      )}

      {!initial ? null : initial.trips.length === 0 ? (
        <p className="text-sm text-muted-foreground">You aren’t a Traveller on any Trip.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <label id="usage-trip-label" className="text-label text-muted-foreground">
            Trip
          </label>
          <Select onValueChange={(id) => void pick(id)}>
            <SelectTrigger aria-labelledby="usage-trip-label">
              <SelectValue placeholder="Pick a Trip" />
            </SelectTrigger>
            <SelectContent>
              {initial.trips.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {trip.status === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {trip.status === "failed" && (
        <p role="status" className="text-sm text-destructive">
          Couldn’t read Usage just now.
        </p>
      )}
      {trip.status === "ready" && <TripReport report={trip.report} />}
    </div>
  );
}
