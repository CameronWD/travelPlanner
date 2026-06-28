"use client";

import * as React from "react";
import { columnLetter, type SheetRow } from "@/lib/discreet";
import { formatMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/dates";

const COLUMNS = ["Location", "Country", "Arrive", "Depart", "Nights", "Transport", "Stay", "Est. cost", "Notes"];
const cellBase = "border border-border px-2 py-1 align-top text-sm";

export interface StopSpreadsheetProps {
  tripId: string;
  rows: SheetRow[];
  homeCurrency: string;
}

export function StopSpreadsheet({ tripId, rows, homeCurrency }: StopSpreadsheetProps) {
  return (
    <div className="flex flex-col" data-trip-id={tripId}>
      <div className="flex gap-4 rounded-t border border-b-0 border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
        {["File", "Edit", "View", "Insert", "Format", "Data"].map((m) => (<span key={m}>{m}</span>))}
      </div>
      <div className="overflow-x-auto rounded-b border border-border">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-muted text-left text-xs text-muted-foreground">
              <th className="border border-border px-2 py-1 font-mono font-normal" />
              {COLUMNS.map((c, i) => (
                <th key={c} className="border border-border px-2 py-1 font-mono font-normal">
                  <span className="mr-2 text-muted-foreground/60">{columnLetter(i)}</span>{c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="hover:bg-accent/60">
                <td className="border border-border bg-muted px-2 py-1 text-center font-mono text-xs text-muted-foreground">{i + 1}</td>
                <td className={`${cellBase} font-medium text-foreground`}>
                  {row.location}
                  {row.pinned && <span title="Locked" className="ml-1 text-muted-foreground">📌</span>}
                </td>
                <td className={`${cellBase} text-muted-foreground`}>{row.country ?? "—"}</td>
                <td className={`${cellBase} font-mono`}>{row.arriveDate ? formatLongDate(row.arriveDate) : "—"}</td>
                <td className={`${cellBase} font-mono`}>{row.departDate ? formatLongDate(row.departDate) : "—"}</td>
                <td className={`${cellBase} font-mono`}>{row.nights}</td>
                <td className={`${cellBase} text-muted-foreground`}>{row.transportInLabel ?? "—"}</td>
                <td className={`${cellBase} text-muted-foreground`}>{row.stayLabel ?? "—"}</td>
                <td className={`${cellBase} font-mono text-right`}>{row.estCostMinor > 0 ? formatMoney(row.estCostMinor, homeCurrency) : "—"}</td>
                <td className={`${cellBase} text-muted-foreground`}>{row.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
