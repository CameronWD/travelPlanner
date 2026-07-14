"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { setVote, clearVote } from "@/server/actions/votes";
import { VOTE_LEVELS, type VoteLevel } from "@/lib/enums";
import { SPRING_POP } from "@/lib/motion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoteView {
  userId: string;
  level: VoteLevel;
  user: {
    name: string | null;
    image: string | null;
  };
}

export interface VoteControlProps {
  tripId: string;
  itemId: string;
  votes: VoteView[];
  currentUserId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVEL_LABEL: Record<VoteLevel, string> = {
  MUST: "Must",
  KEEN: "Keen",
  MEH: "Meh",
};

const LEVEL_EMOJI: Record<VoteLevel, string> = {
  MUST: "🔥",
  KEEN: "👍",
  MEH: "🤷",
};

/** Per-level active-state class overrides (twMerge wins over the base data-[state=on]:bg-card). */
const ACTIVE_CLASS: Record<VoteLevel, string> = {
  MUST: "data-[state=on]:bg-warning data-[state=on]:text-warning-foreground data-[state=on]:shadow-none",
  KEEN: "data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-[state=on]:shadow-none",
  MEH: "data-[state=on]:bg-muted-foreground/20 data-[state=on]:text-foreground data-[state=on]:shadow-none",
};

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wishlist vote control.
 *
 * Shows a segmented button group for the current user to pick their
 * enthusiasm level (MUST / KEEN / MEH). Clicking the active level clears it.
 * Also shows the other traveller's vote as a small avatar + chip.
 */
export function VoteControl({
  tripId,
  itemId,
  votes,
  currentUserId,
}: VoteControlProps) {
  const reduce = useReducedMotion();
  const [isPending, startTransition] = React.useTransition();

  const myVote = votes.find((v) => v.userId === currentUserId);
  const otherVotes = votes.filter((v) => v.userId !== currentUserId);

  function handleSelect(level: VoteLevel) {
    startTransition(async () => {
      if (myVote?.level === level) {
        // Clicking the active level clears the vote
        await clearVote(tripId, itemId);
      } else {
        await setVote(tripId, itemId, level);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Current user's vote picker */}
      <Segmented
        type="single"
        value={myVote?.level ?? ""}
        onValueChange={(val) => {
          if (val) handleSelect(val as VoteLevel);
        }}
        aria-label="Your vote"
        className={cn(
          "rounded-full p-1 transition-opacity",
          isPending && "pointer-events-none opacity-50",
        )}
      >
        {VOTE_LEVELS.map((level) => (
          <SegmentedItem
            key={level}
            value={level}
            aria-label={
              myVote?.level === level
                ? `${LEVEL_LABEL[level]} (active — click to clear your vote)`
                : LEVEL_LABEL[level]
            }
            title={
              myVote?.level === level
                ? "Click again to clear your vote"
                : undefined
            }
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              ACTIVE_CLASS[level],
            )}
            onClick={() => {
              // Handle clicking the currently-active item (Radix won't fire onValueChange
              // when the same value is selected, so we handle clear here)
              if (myVote?.level === level) {
                handleSelect(level);
              }
            }}
          >
            {/* Pop only the chosen level: the active emoji mounts fresh and
                springs in; inactive levels are plain spans (no mount pop). */}
            {myVote?.level === level ? (
              <motion.span
                aria-hidden="true"
                initial={reduce ? false : { scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={reduce ? { duration: 0 } : SPRING_POP}
              >
                {LEVEL_EMOJI[level]}
              </motion.span>
            ) : (
              <span aria-hidden="true">{LEVEL_EMOJI[level]}</span>
            )}
            {LEVEL_LABEL[level]}
          </SegmentedItem>
        ))}
      </Segmented>

      {/* Other traveller's votes */}
      {otherVotes.map((vote) => (
        <span
          key={vote.userId}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            // Theme-aware level chips — bumped to /20 tint; avatar lives inside the pill
            // MUST → warning (amber/orange family); KEEN → accent (teal); MEH → muted
            vote.level === "MUST" && "bg-warning/20 text-warning",
            vote.level === "KEEN" && "bg-accent/20 text-accent",
            vote.level === "MEH" && "bg-muted text-muted-foreground",
          )}
          title={`${vote.user.name ?? "Traveller"}: ${LEVEL_LABEL[vote.level]}`}
        >
          <Avatar className="size-4 shrink-0">
            {vote.user.image && (
              <AvatarImage
                src={vote.user.image}
                alt={vote.user.name ?? ""}
              />
            )}
            <AvatarFallback className="text-[8px]">
              {initials(vote.user.name)}
            </AvatarFallback>
          </Avatar>
          {LEVEL_LABEL[vote.level]}
        </span>
      ))}
    </div>
  );
}
