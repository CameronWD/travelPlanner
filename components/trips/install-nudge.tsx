"use client";

import * as React from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStandalone } from "@/lib/standalone";
import { isIosWithoutInstall } from "@/components/account/device-state";
import { clearInstallPrompt, getInstallPrompt, subscribeInstallPrompt } from "@/lib/install-prompt";
import { cn } from "@/lib/cn";

export const INSTALL_NUDGE_KEY = "teepee:install-nudge";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_NUDGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(INSTALL_NUDGE_KEY, "dismissed");
  } catch {
    // Storage unavailable: the card simply shows again next time.
  }
}

function useInstallPrompt() {
  return React.useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);
}

const subscribeNever = () => () => {};

function readFacts(): string {
  const facts: string[] = [];
  if (isIosWithoutInstall()) facts.push("ios");
  if (isStandalone()) facts.push("standalone");
  if (readDismissed()) facts.push("dismissed");
  return facts.join(",") || "none";
}

/**
 * The Install nudge (CONTEXT.md; spec 2026-10-02 §A): phones only, in a
 * browser tab rather than the installed app. Android gets the real install
 * (the prompt captured in lib/install-prompt.ts); iPhone gets the Share →
 * Add to Home Screen steps, since iOS has no install API. Dismissal is per
 * browser, in localStorage, because this is about this browser — unlike
 * What's new (ADR 0056), which is about the person. The three client-only
 * facts come from a client-only snapshot so the server pass renders nothing and the
 * installed app never flashes a card it does not need. A declined browser
 * dialog spends the prompt, so the card goes for this page load and returns
 * next load; only Not now / Got it are remembered.
 */
export function InstallNudge({ className }: { className?: string }) {
  const prompt = useInstallPrompt();
  const facts = React.useSyncExternalStore(subscribeNever, readFacts, () => null);
  const [dismissedNow, setDismissedNow] = React.useState(false);

  if (!facts || dismissedNow || facts.includes("standalone") || facts.includes("dismissed")) return null;
  const android = prompt !== null;
  if (!facts.includes("ios") && !android) return null;

  function dismiss() {
    writeDismissed();
    setDismissedNow(true);
  }

  async function install() {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      clearInstallPrompt();
      if (outcome === "accepted") dismiss();
    } catch {
      clearInstallPrompt();
    }
  }

  return (
    <section
      aria-labelledby="install-nudge-title"
      data-testid="install-nudge"
      className={cn("rounded-2xl border-2 border-border bg-card p-4 shadow-hard-2 md:hidden", className)}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border-2 border-border bg-sun">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="install-nudge-title" className="font-display text-base font-extrabold tracking-[-0.02em]">
            Put Teepee on your Home Screen
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            It opens like an app, keeps your trips with you offline, and on iPhone it&apos;s the only way the Digest can reach you.
          </p>
          {android ? (
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="primary" size="md" onClick={install}>
                Install
              </Button>
              <Button type="button" variant="outline" size="md" onClick={dismiss}>
                Not now
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm font-semibold">Tap Share, then &quot;Add to Home Screen&quot;, then open Teepee from there.</p>
              <Button type="button" variant="outline" size="md" className="mt-3" onClick={dismiss}>
                Got it
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
