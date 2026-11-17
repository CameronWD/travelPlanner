import type { Flag } from "@/lib/flags";

export interface MarkedFineRow {
  flagId: string;
  fingerprint: string;
  markedByName: string;
  createdAt: Date;
}

export type MarkedFineFlag = Flag & { markedByName: string; markedAt: Date };

export interface MarkedFineSplit {
  shown: Flag[];
  markedFine: MarkedFineFlag[];
}

/** CONTEXT.md "Marked fine": a row hides its Flag only while the Flag still fires with the fingerprint it was marked at. */
export function applyMarkedFine(flags: Flag[], rows: readonly MarkedFineRow[]): MarkedFineSplit {
  if (rows.length === 0) return { shown: flags, markedFine: [] };
  const byFlagId = new Map(rows.map((r) => [r.flagId, r]));
  const shown: Flag[] = [];
  const markedFine: MarkedFineFlag[] = [];
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
