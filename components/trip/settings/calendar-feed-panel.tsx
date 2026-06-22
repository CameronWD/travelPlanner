"use client";

import * as React from "react";
import { Link as LinkIcon, Copy, Check, RefreshCw, Trash2, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCalendarFeed,
  rotateCalendarFeed,
  revokeCalendarFeed,
} from "@/server/actions/calendar-feed";

export interface CalendarFeedPanelProps {
  tripId: string;
  initialToken: string | null;
}

export function CalendarFeedPanel({ tripId, initialToken }: CalendarFeedPanelProps) {
  const [token, setToken] = React.useState<string | null>(initialToken);
  const [copied, setCopied] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const path = token ? `/api/calendar/${token}` : null;
  const httpsUrl =
    path && typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  const webcalUrl =
    path && typeof window !== "undefined"
      ? `webcal://${window.location.host}${path}`
      : null;

  const handleCreate = () =>
    startTransition(async () => setToken((await createCalendarFeed(tripId)).token));
  const handleRotate = () =>
    startTransition(async () => setToken((await rotateCalendarFeed(tripId)).token));
  const handleRevoke = () =>
    startTransition(async () => {
      await revokeCalendarFeed(tripId);
      setToken(null);
    });

  const handleCopy = async () => {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  if (!path) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No calendar feed active. Create one to subscribe in Google, Apple or Outlook Calendar.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={handleCreate} loading={isPending}>
            <CalendarPlus className="size-4" aria-hidden="true" />
            Create calendar feed
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 truncate font-mono text-sm text-foreground">{httpsUrl}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={isPending}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden="true" /> Copied!
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" /> Copy URL
            </>
          )}
        </Button>
        {webcalUrl && (
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={webcalUrl}>
              <CalendarPlus className="size-4" aria-hidden="true" /> Subscribe
            </a>
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={handleRotate} loading={isPending}>
          <RefreshCw className="size-4" aria-hidden="true" /> Regenerate
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRevoke}
          loading={isPending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" /> Revoke
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        One-way: your itinerary publishes to this feed. Calendar apps refresh on their own
        schedule (often several hours), so changes are not instant. Regenerating invalidates the
        old URL immediately.
      </p>
    </div>
  );
}
