import type { VoteLevel } from "@/lib/enums";

/** The score weight for each vote level. */
const VOTE_WEIGHTS: Record<VoteLevel, number> = {
  MUST: 2,
  KEEN: 1,
  MEH: 0,
};

/** Minimal shape of a vote needed for scoring. */
export interface VoteLike {
  level: VoteLevel;
}

/**
 * Sum the vote weights across all votes for a single item.
 * MUST=2, KEEN=1, MEH=0.
 */
export function combinedScore(votes: readonly VoteLike[]): number {
  return votes.reduce((sum, v) => sum + VOTE_WEIGHTS[v.level], 0);
}

/** Minimal shape of an item needed for vote-sorting. */
export interface SortableItem {
  id: string;
  title: string;
  votes: readonly VoteLike[];
}

/**
 * Sort items by descending combined vote score.
 * Ties are broken alphabetically by title (case-insensitive).
 * Returns a new array — does not mutate the input.
 */
export function sortItemsByVotes<T extends SortableItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const scoreA = combinedScore(a.votes);
    const scoreB = combinedScore(b.votes);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}
