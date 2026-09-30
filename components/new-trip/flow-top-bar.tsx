"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Step } from "@/lib/new-trip/draft";
import { cn } from "@/lib/cn";

export function stepLabels(past: boolean) {
  return (past ? ["Name", "When", "Where", "Cover"] : ["Name", "When", "From", "Cover"]) as readonly [string, string, string, string];
}

export function FlowTopBar({ labels, step, disabled, onGo, onCancel }: {
  labels: readonly string[];
  step: Step;
  disabled: boolean;
  onGo: (s: Step) => void;
  onCancel: () => void;
}) {
  return (
    <header className="tp-bar-drop island hidden h-[84px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b-2 border-border bg-sun px-10 text-on-accent md:grid">
      <Link
        href="/trips"
        aria-label="Teepee — back to your trips"
        onClick={(e) => {
          e.preventDefault();
          onCancel();
        }}
        className="justify-self-start rounded-md focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Logo variant="lockup" size={39} />
      </Link>
      <ol aria-label="Steps" className="flex gap-2">
        {labels.map((label, i) => {
          const n = (i + 1) as Step;
          const state = n < step ? "done" : n === step ? "current" : "upcoming";
          const pill = cn(
            "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border pl-1.5 pr-3.5 text-sm font-bold text-foreground",
            state === "done" && "pressable bg-card",
            state === "current" && "island bg-coral shadow-hard-1 transition-[background-color,box-shadow] duration-[var(--dur-base)]",
            state === "upcoming" && "bg-transparent",
          );
          const dot = cn(
            "grid size-[22px] shrink-0 place-items-center rounded-full text-xs font-extrabold",
            state === "done" && "tp-pop bg-foreground text-background",
            state === "current" && "border-2 border-border bg-card",
            state === "upcoming" && "border-2 border-border",
          );
          const inner = (
            <>
              <span aria-hidden="true" data-step-dot className={dot}>
                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {state === "done" ? (
                <button type="button" disabled={disabled} onClick={() => onGo(n)} aria-label={`Step ${n}: ${label}, done. Go back`} className={pill}>
                  {inner}
                </button>
              ) : (
                <span aria-current={state === "current" ? "step" : undefined} className={pill}>{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={onCancel} disabled={disabled} className="pressable inline-flex h-11 items-center gap-1.5 justify-self-end whitespace-nowrap rounded-full border-2 border-border bg-card px-4 text-[15px] font-extrabold text-foreground disabled:opacity-45">
        <X aria-hidden="true" className="size-4" />
        Cancel
      </button>
    </header>
  );
}

export function LeaveDialog({ open, onOpenChange, onLeave }: { open: boolean; onOpenChange: (o: boolean) => void; onLeave: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>Your answers so far won&apos;t be kept.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onLeave}>Leave</Button>
          <Button autoFocus onClick={() => onOpenChange(false)}>Keep going</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
