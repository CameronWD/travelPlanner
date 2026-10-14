/**
 * Booking import duplicates (spec 2026-10-14 "Duplicates"): the same
 * reference already on this plan. A return flight shares one reference, so a
 * Transport also needs the same mode and local departure date. The loader
 * (load-context.ts) leaves out records hidden from the importer (Surprise).
 */
import type { DuplicateRef } from "./types";

export interface ExistingBookings {
  transports: { id: string; mode: string; reference: string; depLocalDate: string | null; label: string }[];
  accommodations: { id: string; confirmation: string; label: string }[];
  items: { id: string; booking: string; label: string }[];
}

export const NO_EXISTING: ExistingBookings = { transports: [], accommodations: [], items: [] };

export function normaliseRef(ref: string | null | undefined): string {
  return (ref ?? "").toLowerCase().replace(/\s+/g, "");
}

export type DuplicateCandidate =
  | { kind: "transport"; reference?: string; mode: string; date: string | null }
  | { kind: "accommodation"; confirmation?: string }
  | { kind: "item"; booking?: string };

export function findDuplicate(candidate: DuplicateCandidate, existing: ExistingBookings): DuplicateRef | null {
  if (candidate.kind === "transport") {
    const ref = normaliseRef(candidate.reference);
    if (!ref || !candidate.date) return null;
    const hit = existing.transports.find(
      (t) => normaliseRef(t.reference) === ref && t.mode === candidate.mode && t.depLocalDate === candidate.date,
    );
    return hit ? { kind: "transport", id: hit.id, label: hit.label } : null;
  }
  if (candidate.kind === "accommodation") {
    const ref = normaliseRef(candidate.confirmation);
    const hit = ref ? existing.accommodations.find((a) => normaliseRef(a.confirmation) === ref) : undefined;
    return hit ? { kind: "accommodation", id: hit.id, label: hit.label } : null;
  }
  const ref = normaliseRef(candidate.booking);
  const hit = ref ? existing.items.find((i) => normaliseRef(i.booking) === ref) : undefined;
  return hit ? { kind: "item", id: hit.id, label: hit.label } : null;
}
