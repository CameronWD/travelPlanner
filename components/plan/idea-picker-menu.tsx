"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryDotClass } from "@/components/trip/category-dot";
import { cn } from "@/lib/cn";
import type { ThingToDo } from "./types";

/**
 * "or pick an idea" in an empty day section (spec 2026-10-04 §I): the Stop's
 * ideas as a menu; picking one schedules it onto that day — the same path as
 * an opened idea's Pick a day, so the day then opens and flashes (P7).
 */
export function IdeaPickerMenu({
  ideas,
  dayLabel,
  onPick,
}: {
  ideas: ThingToDo[];
  dayLabel: string;
  onPick(idea: ThingToDo): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="tap-target font-bold text-coral-text">
          or pick an idea
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>Add to {dayLabel}</DropdownMenuLabel>
        {ideas.map((idea) => (
          <DropdownMenuItem key={idea.id} onSelect={() => onPick(idea)}>
            <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(idea.category))} aria-hidden="true" />
            <span className="truncate">{idea.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
