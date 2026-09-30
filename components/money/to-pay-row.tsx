"use client";

import * as React from "react";
import { Check, Ellipsis } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatMoneyWhole } from "@/lib/money/format-parts";
import type { ToPayRow, DueTone } from "@/lib/money/to-pay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TONE: Record<DueTone, string> = {
  overdue: "text-coral-text",
  soon: "text-coral-text",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
  paid: "text-teal-text",
  legacy: "text-sun-text",
};

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * One merged To pay row (MONEY.md §4): checkbox, label + due line, amount, ⋯ menu.
 * A `motion.li` with `layout`, so a reorder slides rows into place (MOTION.md M7).
 */
export function ToPayRowView({
  row,
  homeCurrency,
  pending,
  onToggle,
  onPartlyPaid,
  onEdit,
  onDelete,
  onOpen,
  className,
}: {
  row: ToPayRow;
  homeCurrency: string;
  pending: boolean;
  onToggle: () => void;
  onPartlyPaid?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
  className?: string;
}) {
  const hasMenu = Boolean(onPartlyPaid || onEdit || onDelete);
  // The check pops only when ticked here, not for rows already paid at mount (MOTION.md M7).
  const [prevPaid, setPrevPaid] = React.useState(row.paid);
  const [ticked, setTicked] = React.useState(false);
  if (prevPaid !== row.paid) {
    setPrevPaid(row.paid);
    setTicked(row.paid);
  }

  const label = (
    <>
      <p className="truncate text-sm font-bold">
        <span
          className={cn(
            "bg-[linear-gradient(currentColor,currentColor)] bg-[position:0_55%] bg-no-repeat transition-[background-size] duration-[var(--dur-base)] ease-pop",
            row.paid ? "bg-[length:100%_2px] text-muted-foreground" : "bg-[length:0%_2px]",
          )}
        >
          {row.label}
        </span>
      </p>
      {row.dueLine ? <p className={cn("text-xs font-semibold", TONE[row.dueTone])}>{row.dueLine}</p> : null}
    </>
  );

  return (
    <motion.li
      layout="position"
      transition={{ duration: 0.32, ease: EASE_POP }}
      aria-label={row.label}
      aria-busy={pending || undefined}
      className={cn("flex min-h-[52px] items-center gap-1 border-b-2 border-muted py-2.5", className)}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={row.paid}
        aria-label={row.label}
        onClick={onToggle}
        disabled={pending}
        className="-ml-2.5 grid size-11 shrink-0 place-items-center"
      >
        <span
          data-testid="to-pay-box"
          className={cn(
            "grid size-[26px] place-items-center rounded-[7px] border-2 md:size-6",
            row.paid ? "border-teal-text bg-teal-text text-background" : "border-border",
            row.legacy && "border-dashed",
          )}
        >
          {row.paid ? <Check className={cn("size-4", ticked && "tp-pop")} strokeWidth={3} aria-hidden="true" /> : null}
        </span>
      </button>

      {onOpen ? (
        <button type="button" aria-label={`Edit ${row.label}`} onClick={onOpen} className="min-w-0 flex-1 text-left">
          {label}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{label}</div>
      )}

      <div className="shrink-0 text-right">
        <p className="text-[15px] font-extrabold tabular-nums">
          {row.homeMinor != null ? formatMoneyWhole(row.homeMinor, homeCurrency) : formatMoneyWhole(row.originalMinor, row.currency)}
        </p>
        {row.foreign && row.homeMinor != null ? (
          <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">{formatMoneyWhole(row.originalMinor, row.currency)}</p>
        ) : null}
      </div>

      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More for ${row.label}`}
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <Ellipsis className="size-5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onPartlyPaid ? <DropdownMenuItem onSelect={onPartlyPaid}>Mark partly paid</DropdownMenuItem> : null}
            {onEdit ? <DropdownMenuItem onSelect={onEdit}>Edit cost</DropdownMenuItem> : null}
            {onDelete ? <DropdownMenuItem onSelect={onDelete}>Delete cost</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </motion.li>
  );
}
