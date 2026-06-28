import { nightsBetween } from "@/lib/dates";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type { TransportMode } from "@/lib/enums";

export const DISCREET_COOKIE = "teepee-discreet";
export const DISCREET_LABEL_COOKIE = "teepee-discreet-label";
export const DEFAULT_DISCREET_LABEL = "Workspace";
const LABEL_MAX = 40;

export function resolveDiscreetLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return DEFAULT_DISCREET_LABEL;
  return trimmed.slice(0, LABEL_MAX);
}

export function columnLetter(index: number): string {
  let i = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return out;
}

export interface SheetStopInput {
  id: string; name: string; country: string | null;
  arriveDate: string | null; departDate: string | null;
  nights: number | null; pinned: boolean; notes: string | null;
  accommodations: { name: string }[];
}
export interface SheetTransportInput { mode: string; fromStopId?: string | null; toStopId?: string | null; }
export interface BuildStopSheetRowsInput {
  stops: SheetStopInput[];
  transports: SheetTransportInput[];
  costHomeMinorByStopId: Record<string, number>;
  homeCurrency: string;
}
export interface SheetRow {
  id: string; location: string; country: string | null;
  arriveDate: string | null; departDate: string | null;
  nights: number; scheduled: boolean; pinned: boolean;
  transportInLabel: string | null; stayLabel: string | null;
  estCostMinor: number; notes: string | null;
}

export function buildStopSheetRows(input: BuildStopSheetRowsInput): SheetRow[] {
  const { stops, transports, costHomeMinorByStopId } = input;
  return stops.map((s) => {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    const nights = scheduled
      ? nightsBetween(s.arriveDate as string, s.departDate as string)
      : (s.nights ?? 0);
    const tIn = transports.find((t) => t.toStopId === s.id);
    const transportInLabel = tIn
      ? (TRANSPORT_MODE_META[tIn.mode as TransportMode]?.label ?? tIn.mode)
      : null;
    return {
      id: s.id, location: s.name, country: s.country,
      arriveDate: s.arriveDate, departDate: s.departDate,
      nights, scheduled, pinned: s.pinned,
      transportInLabel, stayLabel: s.accommodations[0]?.name ?? null,
      estCostMinor: costHomeMinorByStopId[s.id] ?? 0, notes: s.notes,
    };
  });
}
