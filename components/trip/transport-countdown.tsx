"use client";

import * as React from "react";
import { Paperclip, Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttachmentLink } from "@/components/trip/attachment-link";
import { attachmentName } from "@/lib/attachment-name";
import type { AttachmentView } from "@/lib/attachment-view";

interface TransportCountdownProps {
  depAt: string; // ISO string of the departure instant
  depTimeLabel?: string; // e.g. "14:30"
  depZone?: string | null; // e.g. "JST" — shown after the time label
  label: string; // e.g. "Flight BA123"
  attachments?: AttachmentView[];
}

/**
 * Live countdown to a transport departure.
 * Recomputes every minute. Renders nothing if the departure has passed.
 */
export function TransportCountdown({ depAt, depTimeLabel, depZone, label, attachments }: TransportCountdownProps) {
  const [msLeft, setMsLeft] = React.useState(() => new Date(depAt).getTime() - Date.now());

  React.useEffect(() => {
    const tick = () => {
      setMsLeft(new Date(depAt).getTime() - Date.now());
    };
    // Tick immediately in case of clock drift between render and now
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [depAt]);

  // Already departed — don't render
  if (msLeft <= 0) return null;

  const totalMinutes = Math.floor(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  let countdown: string;
  if (hours > 0) {
    countdown = `${hours}h ${minutes}m`;
  } else {
    countdown = `${minutes}m`;
  }

  // Kit shared/onthego.jsx "Up next": coral island Card, chip + big title +
  // "Leaves" time. Coral is the kit's primary accent here, not a status.
  return (
    <Card tone="coral" shadow={4} radius="xl" className="p-[18px] lg:p-6">
      <Badge caps className="self-start">
        <Timer aria-hidden="true" />
        Next departure · in {countdown}
      </Badge>
      <p className="mt-3.5 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.04em] text-balance lg:text-4xl">
        {label}
      </p>
      {depTimeLabel && (
        <div className="mt-3">
          <div className="text-label">Leaves</div>
          <div className="font-display text-3xl font-extrabold leading-none tracking-[-0.04em] tabular-nums">
            {depTimeLabel}
          </div>
          {depZone && <div className="mt-1 text-xs font-semibold">{depZone}</div>}
        </div>
      )}
      {attachments && attachments.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <AttachmentLink
              key={a.id}
              href={a.url}
              mime={a.mime}
              className="inline-flex min-h-11 max-w-full min-w-0 items-center gap-1.5 rounded-full border-2 border-border bg-card px-3.5 text-sm font-extrabold text-foreground"
            >
              <Paperclip aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{attachmentName(a)}</span>
            </AttachmentLink>
          ))}
        </div>
      )}
    </Card>
  );
}
