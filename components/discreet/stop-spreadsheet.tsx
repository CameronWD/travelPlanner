"use client";

import * as React from "react";
import { columnLetter, type SheetRow } from "@/lib/discreet";
import { formatMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/dates";
import { setStopNotes, setStopNights, setStopDates } from "@/server/actions/stops";
import { toast } from "@/components/ui/use-toast";

const COLUMNS = ["Location", "Country", "Arrive", "Depart", "Nights", "Transport", "Stay", "Est. cost", "Notes"];
const cellBase = "border border-border px-2 py-1 align-top text-sm";

function EditableDateCell({ value, scheduled, onSave, className }: { value: string | null; scheduled: boolean; onSave: (iso: string) => Promise<boolean>; className?: string }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [pending, startTransition] = React.useTransition();
  const committed = React.useRef(false);

  if (!scheduled || value == null) {
    return <td className={className}>—</td>;
  }

  function startEditing() {
    committed.current = false;
    setDraft(value ?? "");
    setEditing(true);
  }

  function commit() {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    if (!draft || draft === value) return;
    const next = draft;
    startTransition(async () => {
      await onSave(next);
    });
  }

  if (editing) {
    return (
      <td className={className}>
        <input type="date" autoFocus value={draft} disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-full bg-background px-1 outline-none ring-1 ring-primary" />
      </td>
    );
  }
  return (<td className={`${className} cursor-text`} onClick={startEditing}>{formatLongDate(value)}</td>);
}

export interface StopSpreadsheetProps {
  tripId: string;
  rows: SheetRow[];
  homeCurrency: string;
}

function EditableTextCell({ value, onSave, className }: { value: string | null; onSave: (next: string) => Promise<boolean>; className?: string }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [pending, startTransition] = React.useTransition();
  const committed = React.useRef(false);

  function startEditing() {
    committed.current = false;
    setDraft(value ?? "");
    setEditing(true);
  }

  function commit() {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    if ((value ?? "") === draft) return;
    const next = draft;
    startTransition(async () => {
      await onSave(next);
    });
  }

  if (editing) {
    return (
      <td className={className}>
        <input autoFocus value={draft} disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-full bg-background px-1 outline-none ring-1 ring-primary" />
      </td>
    );
  }
  return (<td className={`${className} cursor-text`} onClick={startEditing}>{value ?? "—"}</td>);
}

function EditableNumberCell({ value, onSave, className }: { value: number; onSave: (next: number) => Promise<boolean>; className?: string }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));
  const [pending, startTransition] = React.useTransition();
  const committed = React.useRef(false);

  function startEditing() {
    committed.current = false;
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0 || n === value) return;
    startTransition(async () => {
      await onSave(n);
    });
  }

  if (editing) {
    return (
      <td className={className}>
        <input type="number" min={0} autoFocus value={draft} disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
          className="w-full bg-background px-1 outline-none ring-1 ring-primary" />
      </td>
    );
  }
  return (<td className={`${className} cursor-text`} onClick={startEditing}>{value}</td>);
}

export function StopSpreadsheet({ tripId, rows, homeCurrency }: StopSpreadsheetProps) {
  const [patches, setPatches] = React.useState<Map<string, Partial<SheetRow>>>(new Map());

  function applyPatch(id: string, patch: Partial<SheetRow> | null) {
    setPatches((prev) => {
      const next = new Map(prev);
      if (patch === null) {
        next.delete(id);
      } else {
        next.set(id, { ...(next.get(id) ?? {}), ...patch });
      }
      return next;
    });
  }

  const data = rows.map((r) => {
    const patch = patches.get(r.id);
    return patch ? { ...r, ...patch } : r;
  });

  async function saveNights(id: string, next: number): Promise<boolean> {
    applyPatch(id, { nights: next }); // optimistic
    const r = await setStopNights(id, next);
    if (!r.success) {
      applyPatch(id, null); // revert: evict patch
      toast({ variant: "destructive", title: "Couldn't update nights." });
      return false;
    }
    if (r.conflicts?.length) {
      toast({ title: "Heads up — earlier stops run past a pinned date; the pin was kept." });
    }
    applyPatch(id, null); // drop patch: let revalidated rows prop be source of truth
    return true;
  }

  async function saveDates(row: SheetRow, dates: { arriveDate: string; departDate: string }): Promise<boolean> {
    applyPatch(row.id, dates); // optimistic
    const r = await setStopDates(row.id, dates);
    if (!r.success) {
      applyPatch(row.id, null);
      toast({ variant: "destructive", title: "Couldn't update dates." });
      return false;
    }
    if (r.conflicts?.length) {
      toast({ title: "Heads up — earlier stops run past a pinned date; the pin was kept." });
    }
    applyPatch(row.id, null); // drop patch: let revalidated rows prop be source of truth
    return true;
  }

  async function saveNotes(id: string, next: string): Promise<boolean> {
    const trimmed = next.trim();
    applyPatch(id, { notes: trimmed === "" ? null : trimmed }); // optimistic, mirrors server
    const r = await setStopNotes(id, next);
    if (!r.success) {
      applyPatch(id, null); // revert: evict patch, fall back to authoritative rows prop
      toast({ variant: "destructive", title: "Couldn't save that change." });
      return false;
    }
    applyPatch(id, null); // drop patch: let revalidated rows prop be source of truth
    return true;
  }

  return (
    <div className="flex flex-col" data-trip-id={tripId}>
      <div className="flex gap-4 rounded-t border border-b-0 border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
        {["File", "Edit", "View", "Insert", "Format", "Data"].map((m) => (<span key={m}>{m}</span>))}
      </div>
      <div className="overflow-x-auto rounded-b border border-border">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-muted text-left text-xs text-muted-foreground">
              <th scope="col" aria-label="Row" className="sticky left-0 z-10 w-10 border border-border bg-muted px-2 py-1 font-mono font-normal" />
              {COLUMNS.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={
                    c === "Location"
                      ? "sticky left-10 z-10 border border-border bg-muted px-2 py-1 font-mono font-normal"
                      : "border border-border px-2 py-1 font-mono font-normal"
                  }
                >
                  <span className="mr-2 text-muted-foreground/60">{columnLetter(i)}</span>{c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.id} className="hover:bg-accent/60">
                <td className="sticky left-0 z-10 w-10 border border-border bg-muted px-2 py-1 text-center font-mono text-xs text-muted-foreground">{i + 1}</td>
                <td className={`${cellBase} sticky left-10 z-10 bg-background font-medium text-foreground`}>
                  {row.location}
                  {row.pinned && <span role="img" aria-label="Pinned" className="ml-1 text-muted-foreground">📌</span>}
                </td>
                <td className={`${cellBase} text-muted-foreground`}>{row.country ?? "—"}</td>
                <EditableDateCell value={row.arriveDate} scheduled={row.scheduled} onSave={(iso) => saveDates(row, { arriveDate: iso, departDate: row.departDate as string })} className={`${cellBase} font-mono`} />
                <EditableDateCell value={row.departDate} scheduled={row.scheduled} onSave={(iso) => saveDates(row, { arriveDate: row.arriveDate as string, departDate: iso })} className={`${cellBase} font-mono`} />
                <EditableNumberCell value={row.nights} onSave={(n) => saveNights(row.id, n)} className={`${cellBase} font-mono`} />
                <td className={`${cellBase} text-muted-foreground`}>{row.transportInLabel ?? "—"}</td>
                <td className={`${cellBase} text-muted-foreground`}>{row.stayLabel ?? "—"}</td>
                <td className={`${cellBase} font-mono text-right`}>{row.estCostMinor > 0 ? formatMoney(row.estCostMinor, homeCurrency) : "—"}</td>
                <EditableTextCell value={row.notes} onSave={(next) => saveNotes(row.id, next)} className={`${cellBase} text-muted-foreground`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
