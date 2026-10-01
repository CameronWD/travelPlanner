"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { markWelcomeSeen } from "@/server/actions/welcome";
import { requestAttention } from "@/lib/attention";

/** Spec 2026-10-01 §G, verbatim. */
export const WELCOME_COPY = {
  title: "Welcome to Teepee.",
  body: "It's early days and I need as much feedback as I can get. The speech-bubble button in the bottom corner opens a Feedback note from any page. Big or small, I want to hear it all.",
  button: "Got it",
} as const;

/**
 * The first-sign-in Welcome. Mounted by WelcomeGate on the Trips page only,
 * and only while `User.welcomeSeenAt` is null. Opens on mount; closing by any
 * means — Got it, the X, Escape, a tap outside — marks it seen, so there is
 * no way to dismiss it into "never seen" and have it nag again.
 */
export function WelcomeDialog() {
  const [open, setOpen] = React.useState(true);
  // Radix reports every dismissal while `open` is still true (Escape then X
  // in the same beat), and Got it calls close() directly: stamp once.
  const closed = React.useRef(false);

  function close() {
    if (closed.current) return;
    closed.current = true;
    setOpen(false);
    // The body points at "the speech-bubble button in the bottom corner";
    // make it nod (components/feedback/feedback-launcher.tsx).
    requestAttention("feedback");
    // Hide first; the write is best-effort. Offline it rejects and the
    // Welcome shows again next load — a second tap, not lost work.
    markWelcomeSeen().catch(() => {});
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogTitle className="pr-12 text-[26px]">{WELCOME_COPY.title}</DialogTitle>
        <DialogDescription className="text-[15px] font-medium leading-[1.5] text-foreground">
          {WELCOME_COPY.body}
        </DialogDescription>
        <DialogFooter>
          <Button type="button" size="lg" onClick={close}>
            {WELCOME_COPY.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
