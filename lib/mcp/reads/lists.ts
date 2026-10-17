/**
 * Single-row reads for the Checklists and the Wishlist, in get_checklists'
 * and get_wishlist's shapes: the read-back of every list write (spec
 * 2026-10-16 F6). Checklists are trip-wide and never inside a Surprise.
 * Wishlist ideas carry the Surprise fragment anyway; a Vote's Item is
 * checked through `requireRealPlanRow`, which refuses one hidden from the
 * caller.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRowAccess, requireTripAccess } from "@/lib/guards";
import { REAL_PLAN, WISHLIST_IDEA_WHERE } from "@/lib/plan-scope";
import { sortChecklist } from "@/lib/checklists";
import { travellerName, TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { requireRealPlanRow } from "../real-plan";

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

export const CHECKLIST_VIEW_SELECT = { id: true, kind: true, text: true, done: true, dueDate: true, sortOrder: true, buy: true } as const;
type ChecklistRow = { id: string; kind: string; text: string; done: boolean; dueDate: string | null; sortOrder: number; buy: string | null };

/** One Checklist item as get_checklists lists it. */
export interface McpChecklistItem { id: string; text: string; done: boolean; dueDate: string | null; buyState: string | null }

export const toChecklistView = (i: ChecklistRow): McpChecklistItem => ({
  id: i.id, text: i.text, done: i.done, dueDate: i.dueDate, buyState: i.buy,
});

/** One list in get_checklists' order. Callers have checked access. */
export async function readChecklist(tripId: string, kind: string): Promise<McpChecklistItem[]> {
  const rows = await db.checklistItem.findMany({ where: { tripId, kind }, orderBy: { sortOrder: "asc" }, select: CHECKLIST_VIEW_SELECT });
  return sortChecklist(rows).map(toChecklistView);
}

/** One Checklist item, plus the list it is on. */
export async function loadChecklistItemForMcp(itemId: string): Promise<McpChecklistItem & { kind: string }> {
  await requireRowAccess("checklistItem", itemId);
  const row = await db.checklistItem.findUnique({ where: { id: itemId }, select: CHECKLIST_VIEW_SELECT });
  if (!row) notFound();
  return { ...toChecklistView(row), kind: row.kind };
}

/** The whole list a Checklist item is on, in its new order (move_checklist_item's read-back). */
export async function loadChecklistOfItemForMcp(itemId: string): Promise<{ kind: string; items: McpChecklistItem[] }> {
  const { row } = await requireRowAccess("checklistItem", itemId);
  return { kind: row.kind, items: await readChecklist(row.tripId, row.kind) };
}

// ---------------------------------------------------------------------------
// Wishlist ideas and Votes
// ---------------------------------------------------------------------------

export const WISHLIST_IDEA_SELECT = {
  id: true, title: true, category: true, notes: true, link: true,
  votes: { select: { level: true, user: { select: TRAVELLER_SELECT } } },
} as const;

/** One Wishlist idea as get_wishlist lists it. */
export interface McpIdea {
  id: string; title: string; category: string; notes: string | null; link: string | null;
  votes: { traveller: string; level: string }[];
}

type VoteRow = { level: string; user: TravellerLike };
const toVotes = (votes: VoteRow[]) => votes.map((v) => ({ traveller: travellerName(v.user), level: v.level }));

export const toMcpIdea = (i: {
  id: string; title: string; category: string; notes: string | null; link: string | null; votes: VoteRow[];
}): McpIdea => ({ id: i.id, title: i.title, category: i.category, notes: i.notes, link: i.link, votes: toVotes(i.votes) });

/** One real-plan Wishlist idea (no Stop, no date). A placed or scheduled Item is not an idea: notFound. */
export async function loadWishlistIdeaForMcp(itemId: string): Promise<McpIdea> {
  const { tripId } = await requireRealPlanRow("item", itemId);
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  const row = await db.item.findFirst({
    where: { id: itemId, tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE, ...v.where.item },
    select: WISHLIST_IDEA_SELECT,
  });
  if (!row) notFound();
  return toMcpIdea(row);
}

/** The Votes on one real-plan Item (set_vote / clear_vote's read-back): get_wishlist's `votes`. */
export async function loadVotesForMcp(itemId: string): Promise<{ itemId: string; votes: McpIdea["votes"] }> {
  await requireRealPlanRow("item", itemId);
  const votes = await db.vote.findMany({
    where: { itemId },
    orderBy: { createdAt: "asc" },
    select: { level: true, user: { select: TRAVELLER_SELECT } },
  });
  return { itemId, votes: toVotes(votes) };
}
