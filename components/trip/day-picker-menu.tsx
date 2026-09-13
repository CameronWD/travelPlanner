"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDayLabel } from "@/lib/dates";

export interface DayPickerMenuProps {
  days: string[];
  label: string;
  onPick: (dateISO: string) => void;
  currentDate?: string | null;
  disabled?: boolean;
}

/**
 * "Pick a day" dropdown for scheduling a thing-to-do onto (or moving a
 * scheduled Item between) a Stop's days. Pure UI — the caller performs the
 * server action (grilling 2026-09-13, Q2b: menu, no drag).
 */
export function DayPickerMenu({
  days,
  label,
  onPick,
  currentDate,
  disabled = false,
}: DayPickerMenuProps) {
  if (days.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          <CalendarClock className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {days.map((d) => (
          <DropdownMenuItem
            key={d}
            disabled={d === currentDate}
            onSelect={() => onPick(d)}
          >
            {formatDayLabel(d)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
