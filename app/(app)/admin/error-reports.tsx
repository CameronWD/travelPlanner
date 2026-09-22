"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relative-time";
import {
  clearErrorReport,
  type ErrorReportView,
} from "@/server/actions/error-reports";

export interface ErrorReportsPanelProps {
  initial: ErrorReportView[];
  /** The server's instant, so a `new Date()` in this client render can't disagree with the server pass (CD-05, same as the other admin panels). */
  now: Date;
}

/**
 * The `ErrorReport` sink (ARCH-OBS-1, ARCH-OBS-2), surfaced by `lastSeen`
 * desc — the same order `listErrorReports` returns, so this component just
 * renders it. `clearErrorReport` calls `requireAdmin()` server-side before
 * doing anything; this panel only reflects that, it grants nothing on its
 * own.
 */
export function ErrorReportsPanel({ initial, now }: ErrorReportsPanelProps) {
  const [reports, setReports] = React.useState<ErrorReportView[]>(initial);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleClear(report: ErrorReportView) {
    setPendingId(report.id);
    setMessage(null);
    const result = await clearErrorReport(report.id);
    setPendingId(null);
    if (result.success) {
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } else {
      setMessage(result.errors._form?.[0] ?? "Couldn't clear that error.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.length === 0 && (
        <p className="text-sm text-muted-foreground">No errors reported.</p>
      )}

      {reports.map((report) => {
        const busy = pendingId === report.id;
        return (
          <div
            key={report.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={report.source === "client" ? "accent" : "secondary"}>
                  {report.source}
                </Badge>
                <Badge variant="muted">
                  {report.count} {report.count === 1 ? "occurrence" : "occurrences"}
                </Badge>
                {report.route && (
                  <span className="truncate text-xs text-muted-foreground">
                    {report.route}
                  </span>
                )}
              </div>
              <span className="break-words text-sm font-medium text-foreground">
                {report.message}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                First {relativeTime(new Date(report.firstSeen), now)} · last{" "}
                {relativeTime(new Date(report.lastSeen), now)}
              </span>
              <span className="truncate text-[10px] text-muted-foreground/70">
                {report.signature}
              </span>
            </div>

            <div className="shrink-0 self-end sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-destructive text-destructive hover:bg-destructive/5"
                loading={busy}
                onClick={() => handleClear(report)}
                aria-label={`Clear ${report.message}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Clear
              </Button>
            </div>
          </div>
        );
      })}

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
