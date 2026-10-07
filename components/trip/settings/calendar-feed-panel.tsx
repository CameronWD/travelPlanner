"use client";

import * as React from "react";
import { Link as LinkIcon, Copy, Check, RefreshCw, Trash2, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCalendarFeed,
  rotateCalendarFeed,
  revokeCalendarFeed,
  updateCalendarFeedFilter,
  updateCalendarFeedAlarms,
} from "@/server/actions/calendar-feed";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toastRejected } from "@/components/ui/action-failure";

const FEED_FAILED = "Couldn't update the calendar feed. Try again.";

export interface CalendarFeedPanelProps {
  tripId: string;
  initialToken: string | null;
  initialFilter?: {
    includeTransport: boolean;
    includeAccommodation: boolean;
    includeActivities: boolean;
  };
  initialAlarms?: {
    alarmTransport: boolean;
    alarmCheckOut: boolean;
  };
}

export function CalendarFeedPanel({
  tripId,
  initialToken,
  initialFilter = {
    includeTransport: true,
    includeAccommodation: true,
    includeActivities: true,
  },
  initialAlarms = {
    alarmTransport: true,
    alarmCheckOut: true,
  },
}: CalendarFeedPanelProps) {
  const [token, setToken] = React.useState<string | null>(initialToken);
  const [copied, setCopied] = React.useState(false);
  const [filter, setFilter] = React.useState(initialFilter);
  const [alarms, setAlarms] = React.useState(initialAlarms);
  const [isPending, startTransition] = React.useTransition();
  const { confirm, dialog } = useConfirm();

  const setType = (
    key: "includeTransport" | "includeAccommodation" | "includeActivities",
    value: boolean,
  ) => {
    const prev = filter;
    const next = { ...filter, [key]: value };
    setFilter(next);
    startTransition(async () => {
      try {
        await updateCalendarFeedFilter(tripId, next);
      } catch {
        setFilter(prev);
        toastRejected(FEED_FAILED);
      }
    });
  };

  const setAlarm = (
    key: "alarmTransport" | "alarmCheckOut",
    value: boolean,
  ) => {
    const prev = alarms;
    const next = { ...alarms, [key]: value };
    setAlarms(next);
    startTransition(async () => {
      try {
        await updateCalendarFeedAlarms(tripId, next);
      } catch {
        setAlarms(prev);
        toastRejected(FEED_FAILED);
      }
    });
  };

  const path = token ? `/api/calendar/${token}` : null;
  const httpsUrl =
    path && typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  const webcalUrl =
    path && typeof window !== "undefined"
      ? `webcal://${window.location.host}${path}`
      : null;

  const handleCreate = () =>
    startTransition(async () => {
      try {
        setToken((await createCalendarFeed(tripId)).token);
      } catch {
        toastRejected(FEED_FAILED);
      }
    });
  const handleRotate = async () => {
    const confirmed = await confirm({
      title: "Regenerate calendar feed?",
      description:
        "This invalidates the current calendar URL — anyone subscribed will need the new link.",
      confirmLabel: "Regenerate",
      destructive: true,
    });
    if (!confirmed) return;
    startTransition(async () => {
      try {
        setToken((await rotateCalendarFeed(tripId)).token);
      } catch {
        toastRejected(FEED_FAILED);
      }
    });
  };
  const handleRevoke = () =>
    startTransition(async () => {
      try {
        await revokeCalendarFeed(tripId);
        setToken(null);
      } catch {
        toastRejected(FEED_FAILED);
      }
    });

  const handleCopy = async () => {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastRejected("Couldn't copy the link.");
    }
  };

  if (!path) {
    return (
      <>
        {dialog}
        <div className="flex flex-col gap-3">
          <p className="max-w-reading text-sm text-muted-foreground">
            No calendar feed active. Create one to subscribe in Google, Apple or Outlook Calendar.
          </p>
          <div>
            <Button type="button" variant="outline" onClick={handleCreate} loading={isPending}>
              <CalendarPlus className="size-4" aria-hidden="true" />
              Create calendar feed
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {dialog}
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 truncate font-mono text-sm text-foreground">{httpsUrl}</span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Include in feed</legend>
        {([
          ["includeTransport", "Transport"],
          ["includeAccommodation", "Accommodation"],
          ["includeActivities", "Activities"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={filter[key]}
              disabled={isPending}
              onChange={(e) => setType(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Alarms</legend>
        {([
          ["alarmTransport", "Alarm before departures"],
          ["alarmCheckOut", "Alarm on check-out mornings"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={alarms[key]}
              disabled={isPending}
              onChange={(e) => setAlarm(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
        <p className="mt-2 max-w-reading text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">On iPhone, do this once:</strong>{" "}
          Settings → Apps → Calendar → Accounts → Subscribed Calendars → this trip →
          turn <strong className="font-medium text-foreground">Remove Alerts</strong> off.
          iOS strips alarms from subscribed calendars by default, and nothing tells you
          it has.
        </p>
      </fieldset>

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

      <p className="max-w-reading text-xs text-muted-foreground">
        One-way: your itinerary publishes to this feed. Calendar apps refresh on their own
        schedule (often several hours), so changes are not instant. Regenerating invalidates the
        old URL immediately.
      </p>
    </div>
    </>
  );
}
