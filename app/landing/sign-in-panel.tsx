"use client";

import { createContext, useContext, useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

/**
 * The Landing's way in (spec 2026-09-29 collage, C2/C3; wording spec
 * 2026-10-01 §G): "Sign in" and "Become a tester" under the hero open one
 * small panel — the shared Dialog, a bottom sheet on phones and a centred
 * dialog from sm. Both modes hold the same Google controls; a refused Google
 * sign-in already records an Access request (lib/auth.ts), so "Become a
 * tester" only changes the words around them.
 *
 * A refused sign-in redirects Auth.js back to "/?error=AccessDenied"
 * (lib/auth.ts pages.error); the Landing passes `initialMode="denied"` so
 * this panel opens on load with the neutral denied copy — the same controls,
 * no header button to fall back to.
 *
 * `controls` is the server-rendered sign-in controls component (it reads
 * server-only environment config to decide which methods are configured),
 * passed in as a node — never import that module directly here.
 */
type Mode = "sign-in" | "request" | "denied";

const COPY: Record<Mode, { title: string; line: string }> = {
  "sign-in": {
    title: "Come on in",
    line: "Teepee is in testing. Sign in with the Google account you were invited with.",
  },
  request: {
    title: "Want to test it?",
    line: "Teepee is in testing and the door is by invitation. Sign in with Google and we'll pass your name to the admin. Nothing else to fill in.",
  },
  // One neutral message for everyone Auth.js refuses — a brand-new stranger,
  // someone waiting, dismissed or revoked. Telling a reader which bucket they
  // are in would make this panel an oracle about the Admin's decisions
  // (2026-09-26 final fix wave, I2). Keep the line verbatim; only the title
  // changed on 2026-10-01 (§G: "in testing" is the reason, the gate is unchanged).
  denied: {
    title: "Teepee is in testing.",
    line: "Your Google account isn't on the list. We've recorded the attempt for the admin — there's nothing else to do here. This page can't tell you where a request stands, and not every request is granted; if you're expecting access, ask whoever invited you.",
  },
};

const OpenPanel = createContext<(mode: Mode) => void>(() => {});

export function SignInPanelProvider({
  controls,
  initialMode,
  children,
}: {
  controls: ReactNode;
  initialMode?: Mode;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<Mode | null>(initialMode ?? null);
  // Keep the last mode while the close animation plays, so the copy doesn't flip.
  const [shown, setShown] = useState<Mode>(initialMode ?? "sign-in");
  // This dialog is controlled with no DialogTrigger, so Radix's own
  // triggerRef is always null and its default close-focus behaviour has
  // nothing to return focus to — it falls back to <body>. Remember whatever
  // was focused when we opened it and restore that ourselves on close. When
  // the panel opened on load (denied mode, no click), there is no opener to
  // restore to — leave Radix's own default focus-handling alone.
  const opener = useRef<HTMLElement | null>(null);
  const open = (m: Mode) => {
    opener.current = document.activeElement as HTMLElement | null;
    setShown(m);
    setMode(m);
  };
  const close = () => {
    setMode(null);
    // Arrived from a refused sign-in: drop ?error so a refresh doesn't reopen
    // the panel. Other params (callbackUrl) stay.
    const url = new URL(window.location.href);
    if (url.searchParams.has("error")) {
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  };

  return (
    <OpenPanel.Provider value={open}>
      {children}
      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) close(); }}>
        {/* Portalled to <body>, outside the page's light root: force light here too. */}
        <DialogContent
          data-theme="light"
          className="light"
          onCloseAutoFocus={(e) => {
            if (opener.current) {
              e.preventDefault();
              opener.current.focus();
            }
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

export function LandingActions({ size, align = "start" }: { size: "md" | "lg"; align?: "start" | "center" }) {
  const open = useContext(OpenPanel);
  const grow = size === "md" ? "flex-1" : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button type="button" size={size} className={grow} onClick={() => open("sign-in")}>
          Sign in
        </Button>
        <Button type="button" variant="secondary" size={size} className={grow} onClick={() => open("request")}>
          Become a tester
        </Button>
      </div>
      {/* One line even at 393px; centred under the phone hero (LANDING.md §2.1). */}
      <div
        className={cn(
          "flex items-center gap-x-1.5 whitespace-nowrap text-[13px] font-medium text-muted-foreground",
          align === "center" && "justify-center",
        )}
      >
        <span>Teepee is in testing</span>
        <span aria-hidden="true">·</span>
        <nav aria-label="Legal" className="flex items-center gap-x-1.5">
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
