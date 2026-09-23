"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { relativeTime } from "@/lib/relative-time";
import {
  clearErrorReport,
  clearAllErrorReports,
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
 * renders it, capped at `listErrorReports`' own LIST_LIMIT. `clearErrorReport`
 * and `clearAllErrorReports` both call `requireAdmin()` server-side before
 * doing anything; this panel only reflects that, it grants nothing on its
 * own.
 *
 * Per-row Clear has no confirm dialog (a log row the sink will simply
 * recreate on the next occurrence is not an access grant, and a modal per
 * row would make the panel unusable) — but "Clear all" is a different blast
 * radius entirely, so it's the one destructive action here that does confirm.
 */
export function ErrorReportsPanel({ initial, now }: ErrorReportsPanelProps) {
  const [reports, setReports] = React.useState<ErrorReportView[]>(initial);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [clearingAll, setClearingAll] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  // Both handlers wrap the server call in try/finally (final fix wave).
  // Neither had a catch, so a rejection — requireAdmin's notFound(), a dropped
  // connection, a deploy mid-click — skipped the loading reset and left the
  // button spinning forever with no message, which reads as "still working"
  // rather than "failed".
  async function handleClear(report: ErrorReportView) {
    setPendingId(report.id);
    setMessage(null);
    try {
      const result = await clearErrorReport(report.id);
      if (result.success) {
        setReports((prev) => prev.filter((r) => r.id !== report.id));
      } else {
        setMessage(result.errors._form?.[0] ?? "Couldn't clear that error.");
      }
    } catch {
      setMessage("Couldn't clear that error.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleClearAll() {
    // No count in the title: `reports` is capped at listErrorReports' own
    // LIST_LIMIT while clearAllErrorReports is `deleteMany({})`, so citing
    // `reports.length` understated the blast radius exactly when the table was
    // biggest — the one time an admin most needs the number to be right.
    const confirmed = await confirm({
      title: "Clear every reported error?",
      description:
        "This clears every reported error in the database, including any beyond the ones listed here. Anything that happens again will simply be reported fresh.",
      confirmLabel: "Clear all",
      destructive: true,
    });
    if (!confirmed) return;

    setClearingAll(true);
    setMessage(null);
    try {
      const result = await clearAllErrorReports();
      if (result.success) {
        setReports([]);
      } else {
        setMessage(result.errors._form?.[0] ?? "Couldn't clear all errors.");
      }
    } catch {
      setMessage("Couldn't clear all errors.");
    } finally {
      setClearingAll(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-destructive text-destructive hover:bg-destructive/5"
            loading={clearingAll}
            onClick={handleClearAll}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Clear all
          </Button>
        </div>
      )}

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
                {report.digest && ` · digest ${report.digest}`}
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

      {dialog}
    </div>
  );
}
