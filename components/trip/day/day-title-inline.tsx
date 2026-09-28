"use client";

import * as React from "react";
import { formatDayLabel } from "@/lib/dates";
import { useDayTitleEditor, DAY_TITLE_MAX_LENGTH } from "@/components/trip/day-title-editor";

/**
 * The Day view header's Day title line (CONTEXT.md "Day title") — the
 * primary place to add or edit one (spec 2026-09-28 D4). Fills the fixed
 * 20px slot `DayHeader` reserves: "Add a title" when empty, the title as a
 * button when set, an input while editing (the slot may grow while the input
 * is open; the arrows only need to be stable between days).
 *
 * `stopId` null is a gap day — no Stop can own a title, so nothing is offered.
 */
export function DayTitleInline({ stopId, date, title }: { stopId: string | null; date: string; title: string | null }) {
  const ed = useDayTitleEditor({ stopId, date, title });
  const inputId = React.useId();
  if (!stopId) return null;

  if (ed.editing) {
    return (
      <>
        <label htmlFor={inputId} className="sr-only">
          Day title for {formatDayLabel(date)}
        </label>
        <input
          id={inputId}
          autoFocus
          value={ed.value}
          onChange={(e) => ed.setValue(e.target.value)}
          onBlur={() => void ed.save()}
          onKeyDown={ed.onKeyDown}
          placeholder="Sintra day trip"
          maxLength={DAY_TITLE_MAX_LENGTH}
          className="h-8 w-full max-w-xs rounded-md border-2 border-input bg-card px-2 text-center text-sm font-semibold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </>
    );
  }

  if (title) {
    return (
      <button
        type="button"
        onClick={ed.startEditing}
        aria-label={`Edit the day title, ${title}`}
        className="max-w-full truncate rounded px-1 text-sm font-bold leading-5 text-muted-foreground hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span>{title}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={ed.startEditing}
      className="rounded px-1 text-sm font-semibold leading-5 text-muted-foreground hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Add a title
    </button>
  );
}
