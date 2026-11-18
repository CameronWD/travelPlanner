import type { Flag } from "@/lib/flags";

export interface MarkedFineRow {
  flagId: string;
  fingerprint: string;
  markedByName: string;
  createdAt: Date;
}

type MarkedFineFlag<F extends Flag = Flag> = F & { markedByName: string; markedAt: Date };

export interface MarkedFineSplit<F extends Flag = Flag> {
  shown: F[];
  markedFine: MarkedFineFlag<F>[];
}

export function applyMarkedFine<F extends Flag>(flags: F[], rows: readonly MarkedFineRow[]): MarkedFineSplit<F> {
  if (rows.length === 0) return { shown: flags, markedFine: [] };
  const byFlagId = new Map(rows.map((r) => [r.flagId, r]));
  const shown: F[] = [];
  const markedFine: MarkedFineFlag<F>[] = [];
  for (const flag of flags) {
    const row = byFlagId.get(flag.id);
    if (row && flag.fingerprint !== undefined && row.fingerprint === flag.fingerprint) {
      markedFine.push({ ...flag, markedByName: row.markedByName, markedAt: row.createdAt });
    } else {
      shown.push(flag);
    }
  }
  return { shown, markedFine };
}
