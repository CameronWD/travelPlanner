"use client";

import { createContext, useContext, useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * The Landing's way in (spec 2026-09-29 collage, C2/C3): "Sign in" and
 * "Request access" open one small panel — the shared Dialog, a bottom sheet
 * on phones and a centred dialog from sm. Both modes hold the same Google
 * controls; a refused Google sign-in already records an Access request
 * (lib/auth.ts), so "Request access" only changes the words around them.
 *
 * `controls` is the server-rendered sign-in controls component (it reads
 * server-only environment config to decide which methods are configured),
 * passed in as a node — never import that module directly here.
 */
type Mode = "sign-in" | "request";

const COPY: Record<Mode, { title: string; line: string }> = {
  "sign-in": {
    title: "Come on in",
    line: "Teepee is invite-only — sign in with the Google account you were invited with.",
  },
  request: {
    title: "Ask to join",
    line: "Teepee is invite-only. Sign in with Google and we'll pass your name to the admin — there's nothing else to fill in.",
  },
};

const OpenPanel = createContext<(mode: Mode) => void>(() => {});

export function SignInPanelProvider({ controls, children }: { controls: ReactNode; children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  // Keep the last mode while the close animation plays, so the copy doesn't flip.
  const [shown, setShown] = useState<Mode>("sign-in");
  // This dialog is controlled with no DialogTrigger, so Radix's own
  // triggerRef is always null and its default close-focus behaviour has
  // nothing to return focus to — it falls back to <body>. Remember whatever
  // was focused when we opened it and restore that ourselves on close.
  const opener = useRef<HTMLElement | null>(null);
  const open = (m: Mode) => {
    opener.current = document.activeElement as HTMLElement | null;
    setShown(m);
    setMode(m);
  };

  return (
    <OpenPanel.Provider value={open}>
      {children}
      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) setMode(null); }}>
        {/* Portalled to <body>, outside the page's light root: force light here too. */}
        <DialogContent
          data-theme="light"
          className="light"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
        >
          <DialogTitle className="pr-12 text-[26px]">{COPY[shown].title}</DialogTitle>
          <DialogDescription>{COPY[shown].line}</DialogDescription>
          <div className="mt-2">{controls}</div>
        </DialogContent>
      </Dialog>
    </OpenPanel.Provider>
  );
}

export function HeaderSignIn() {
  const open = useContext(OpenPanel);
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => open("sign-in")}>
      Sign in
    </Button>
  );
}

export function LandingActions({ size }: { size: "md" | "lg" }) {
  const open = useContext(OpenPanel);
  const grow = size === "md" ? "flex-1" : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button type="button" size={size} className={grow} onClick={() => open("sign-in")}>
          Sign in
        </Button>
        <Button type="button" variant="secondary" size={size} className={grow} onClick={() => open("request")}>
          Request access
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-muted-foreground">
        <span>Teepee is invite-only</span>
        <span aria-hidden="true">·</span>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-1.5">
          <Link href="/privacy" className="tap-target underline underline-offset-2">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="tap-target underline underline-offset-2">
            Terms
          </Link>
        </nav>
      </div>
    </div>
  );
}
