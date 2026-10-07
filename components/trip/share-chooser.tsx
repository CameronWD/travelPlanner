"use client";

import * as React from "react";
import Link from "next/link";
import { Share2, Plus, Link as LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { toastRejected } from "@/components/ui/action-failure";
import { listShareLinks, type ShareLinkView } from "@/server/actions/share";
import { shareUrl } from "@/lib/share-url";
import { useTripHref } from "@/components/trip/use-trip-href";
import { OPEN_SHARE_EVENT } from "@/components/trip/share-events";

/**
 * Hand a Share link's URL to the OS share sheet on phones (coarse pointer),
 * else copy it. Never creates anything (CONTEXT.md "Share link").
 */
async function shareOrCopy(url: string, title: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const phone = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (phone && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Share sheet unavailable after all — fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** The header's "Share" — opens the chooser mounted once by the trip layout. */
export function ShareTripButton() {
  return (
    <button
      type="button"
      aria-label="Share"
      onClick={() => window.dispatchEvent(new Event(OPEN_SHARE_EVENT))}
      className="pressable grid size-11 place-items-center rounded-md border-2 border-border bg-card text-foreground shadow-hard-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <Share2 className="size-5" strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}

/**
 * Spec 2026-10-06 §O: a small chooser listing the Trip's existing Share links
 * by label, plus "New Share link…" to Settings. Opened by OPEN_SHARE_EVENT
 * (header button, Search's Do group). Links load each time it opens.
 */
export function ShareChooserMount({ tripId }: { tripId: string }) {
  const tripHref = useTripHref(tripId);
  const [open, setOpen] = React.useState(false);
  const [links, setLinks] = React.useState<ShareLinkView[] | null>(null);

  React.useEffect(() => {
    function onOpen() {
      setOpen(true);
      setLinks(null);
      listShareLinks(tripId)
        .then(setLinks)
        .catch(() => {
          setLinks([]);
          toastRejected("Couldn't load your Share links.");
        });
    }
    window.addEventListener(OPEN_SHARE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SHARE_EVENT, onOpen);
  }, [tripId]);

  async function pick(link: ShareLinkView) {
    const outcome = await shareOrCopy(shareUrl(link.token), link.label);
    if (outcome === "copied") toast({ title: "Link copied" });
    if (outcome === "failed") toastRejected("Couldn't copy the link.");
    if (outcome !== "cancelled") setOpen(false);
  }

  const row = "pressable flex min-h-11 w-full items-center gap-2.5 rounded-md border-2 border-border bg-card px-3 text-left text-sm font-bold";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Each Share link is made for one audience.</DialogDescription>
        </DialogHeader>
        {links === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.id}>
                <button type="button" className={row} onClick={() => void pick(link)}>
                  <LinkIcon className="size-4 shrink-0" aria-hidden="true" />
                  {link.label}
                </button>
              </li>
            ))}
            <li>
              <Link href={tripHref("/settings#sharing")} className={row} onClick={() => setOpen(false)}>
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                New Share link…
              </Link>
            </li>
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
