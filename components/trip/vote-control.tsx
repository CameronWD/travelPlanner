"use client";

import * as React from "react";
import { motion } from "motion/react";
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
          "transition-opacity",
          isPending && "pointer-events-none opacity-50",
        )}
      >
        {VOTE_LEVELS.map((level) => (
          <SegmentedItem
            key={level}
            value={level}
            aria-label={LEVEL_LABEL[level]}
            className="gap-1 px-2 py-1 text-xs"
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
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={SPRING_POP}
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
        <div
          key={vote.userId}
          className="flex items-center gap-1.5"
          title={`${vote.user.name ?? "Traveller"}: ${LEVEL_LABEL[vote.level]}`}
        >
          <Avatar className="size-5 shrink-0">
            {vote.user.image && (
              <AvatarImage
                src={vote.user.image}
                alt={vote.user.name ?? ""}
              />
            )}
            <AvatarFallback className="text-[9px]">
              {initials(vote.user.name)}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              vote.level === "MUST" &&
                "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
              vote.level === "KEEN" &&
                "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
              vote.level === "MEH" &&
                "bg-muted text-muted-foreground",
            )}
          >
            <span aria-hidden="true">{LEVEL_EMOJI[vote.level]}</span>
            {LEVEL_LABEL[vote.level]}
          </span>
        </div>
      ))}
    </div>
  );
}
