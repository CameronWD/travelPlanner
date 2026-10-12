"use client";

import * as React from "react";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { SM_HIT } from "@/components/ui/touch-target";
import { relativeTime } from "@/lib/relative-time";
import { disconnectApp, type ConnectedApp } from "@/server/actions/connected-apps";

export interface ConnectedAppsPanelProps {
  initial: ConnectedApp[];
  /** The server's instant, so this "use client" render can't disagree with the server pass (CD-05). */
  now: Date;
}

const FAILED = "Couldn't disconnect that app. Try again.";

/** "12 Oct", with the year only when it isn't this year. In the reader's own timezone, like the Devices list. */
function connectedOn(iso: string, now: Date): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * **Connected apps** (CONTEXT.md): the outside apps this Traveller has
 * allowed to act as them, each with when it was connected and last used,
 * and Disconnect. Disconnecting ends the app's access at once, so it asks
 * first, inline (the viewer has no `confirm()`), and says plainly that the
 * app has to ask again.
 */
export function ConnectedAppsPanel({ initial, now }: ConnectedAppsPanelProps) {
  const [apps, setApps] = React.useState<ConnectedApp[]>(initial);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleDisconnect(app: ConnectedApp) {
    setBusyId(app.id);
    setMessage(null);
    try {
      const result = await disconnectApp(app.id);
      if (result.success) {
        setApps((prev) => prev.filter((a) => a.id !== app.id));
        setMessage(`Disconnected. ${app.clientName} has to ask again before it can use your trips.`);
      } else {
        setMessage(result.errors._?.[0] ?? FAILED);
      }
    } catch {
      setMessage(FAILED);
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {apps.length === 0 && (
        <EmptyState
          icon={Plug}
          tone="lilac"
          title="Nothing is connected yet."
          description="Add Teepee in your Claude app and sign in to connect it."
        />
      )}
      {apps.map((app) => {
        const confirming = confirmingId === app.id;
        return (
          <div key={app.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              {/* Disconnect sits beside the row, not in ListRow's `trailing`
                  slot: that slot is aria-hidden (decorative chevron). */}
              <ListRow
                className="min-w-0 flex-1"
                tile={<Plug className="size-4" strokeWidth={2.5} />}
                tileTone="lilac"
                title={<span className="block truncate">{app.clientName}</span>}
                sub={
                  <span className="block truncate">
                    {app.returnsTo ? `Returns to ${app.returnsTo} · ` : ""}
                    {`Connected ${connectedOn(app.connectedAt, now)} · `}
                    {app.lastUsedAt
                      ? `Last used ${relativeTime(new Date(app.lastUsedAt), now)}`
                      : "Not used yet"}
                  </span>
                }
              />
              {!confirming && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label={`Disconnect ${app.clientName}`}
                  className={SM_HIT}
                  onClick={() => {
                    setMessage(null);
                    setConfirmingId(app.id);
                  }}
                >
                  Disconnect
                </Button>
              )}
            </div>
            {confirming && (
              <div className="flex flex-col gap-2 pl-11">
                <p className="text-xs font-medium text-foreground">
                  {app.clientName} will stop working with your trips until you connect it again.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className={SM_HIT}
                    loading={busyId === app.id}
                    onClick={() => handleDisconnect(app)}
                  >
                    Yes, disconnect
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={SM_HIT}
                    disabled={busyId === app.id}
                    onClick={() => setConfirmingId(null)}
                  >
                    Keep
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {message && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
