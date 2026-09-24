"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Flame, ThumbsUp, Meh, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
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

/** Level glyphs — lucide per the kit's icon treatment (was emoji-as-illustration). */
const LEVEL_ICON: Record<VoteLevel, LucideIcon> = {
  MUST: Flame,
  KEEN: ThumbsUp,
  MEH: Meh,
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
            // The ≥44px touch hit area comes from SegmentedItem itself.
            className={cn("rounded-full px-2.5 text-xs", ACTIVE_CLASS[level])}
            onClick={() => {
              // Handle clicking the currently-active item (Radix won't fire onValueChange
              // when the same value is selected, so we handle clear here)
              if (myVote?.level === level) {
                handleSelect(level);
              }
            }}
          >
            {/* Pop only the chosen level: the active icon mounts fresh and
                springs in; inactive levels are plain spans (no mount pop). */}
            {myVote?.level === level ? (
              <motion.span
                aria-hidden="true"
                className="inline-flex"
                initial={reduce ? false : { scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={reduce ? { duration: 0 } : SPRING_POP}
              >
                <Icon icon={LEVEL_ICON[level]} size={14} strokeWidth={3} />
              </motion.span>
            ) : (
              <span aria-hidden="true" className="inline-flex">
                <Icon icon={LEVEL_ICON[level]} size={14} strokeWidth={3} />
              </span>
            )}
            {LEVEL_LABEL[level]}
          </SegmentedItem>
        ))}
      </Segmented>

      {/* Other traveller's votes */}
      {otherVotes.map((vote) => (
        <span
          key={vote.userId}
          // Kit chip (2px ink outline, 800 weight). Neutral ink so it reads on
          // white, sun and success cards alike; the level is carried by the word.
          className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card py-0.5 pl-0.5 pr-2 text-[11px] font-extrabold leading-tight text-foreground"
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
