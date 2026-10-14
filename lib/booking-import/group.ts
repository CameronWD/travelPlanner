/**
 * Booking import sheet grouping (spec 2026-10-14 "Preview"): Proposals under
 * their Stop in plan order; proposed Stops as "New stop" headings in date order.
 */
import { proposedRef, type BookingProposal, type ImportContext, type Proposal, type StopProposal } from "./types";

export const UNPLACED_GROUP = "unplaced";

export interface ProposalGroup {
  key: string;
  title: string;
  isNew: boolean;
  stop: StopProposal | null;
  proposals: BookingProposal[];
}

export function proposalGroupKey(p: Proposal): string {
  if (p.kind === "stop") return proposedRef(p.clientId);
  if (p.kind === "transport") {
    const to = p.input.arrIsHome ? undefined : p.input.toStopId;
    const from = p.input.depIsHome ? undefined : p.input.fromStopId;
    return to || from || UNPLACED_GROUP;
  }
  return p.input.stopId || UNPLACED_GROUP;
}

export function groupProposals(proposals: readonly Proposal[], context: ImportContext): ProposalGroup[] {
  const groups = new Map<string, ProposalGroup>();
  for (const p of proposals) {
    const key = proposalGroupKey(p);
    const g = groups.get(key) ?? { key, title: "", isNew: key.startsWith("proposed:"), stop: null, proposals: [] };
    if (p.kind === "stop") g.stop = p;
    else g.proposals.push(p);
    groups.set(key, g);
  }

  // A rough Stop sorts with the dated Stop before it on the plan.
  const index = new Map(context.stops.map((s, i) => [s.id, i]));
  const effective = new Map<string, string>();
  let last = "";
  for (const s of context.stops) {
    if (s.arriveDate) last = s.arriveDate;
    effective.set(s.id, last);
  }
  const rank = (g: ProposalGroup): [string, number, number] => {
    if (g.key === UNPLACED_GROUP) return ["￿", 2, 0];
    if (index.has(g.key)) return [effective.get(g.key) ?? "", 0, index.get(g.key)!];
    return [g.stop?.input.arriveDate ?? "￿", 1, 0];
  };
  const titleOf = (g: ProposalGroup) =>
    g.key === UNPLACED_GROUP ? "Not on a Stop" : g.stop ? `New stop: ${g.stop.input.name}` : (context.stops.find((s) => s.id === g.key)?.name ?? "Stop");

  return [...groups.values()]
    .filter((g) => g.stop || g.proposals.length > 0)
    .map((g) => ({ ...g, title: titleOf(g) }))
    .sort((a, b) => {
      const [ad, at, ai] = rank(a);
      const [bd, bt, bi] = rank(b);
      return ad.localeCompare(bd) || at - bt || ai - bi;
    });
}
