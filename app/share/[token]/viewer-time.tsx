"use client";

import { useEffect, useState } from "react";
import { formatWeekday } from "@/lib/dates";
import { deviceTimeZone, instantToZonedDateISO, instantToZonedTime } from "@/lib/tz";
import { wallClock } from "./wall-clock";

// The viewer's zone is known only in the browser, so both pieces render nothing
// on the server and on first client render, then fill in after mount (the same
// no-mismatch rule as LocalClock). A time that already reads the same in the
// viewer's zone is not repeated.

function viewerZoneFor(instant: Date, placeLocal: string): string | null {
  const zone = deviceTimeZone();
  return zone && wallClock(instant, zone) !== placeLocal ? zone : null;
}

export function ViewerNow({ timeZone }: { timeZone: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      const now = new Date();
      const zone = viewerZoneFor(now, wallClock(now, timeZone));
      setText(zone ? instantToZonedTime(now, zone) : null);
    };
    update();
    const timeout = setTimeout(() => {
      update();
      interval = setInterval(update, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [timeZone]);

  if (!text) return null;
  return <span className="whitespace-nowrap tabular-nums">{`· ${text} for you`}</span>;
}

export function ViewerArrival({ instant: iso, placeLocal }: { instant: string; placeLocal: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const show = () => {
      const instant = new Date(iso);
      const zone = viewerZoneFor(instant, placeLocal);
      setText(zone ? `arrives ${formatWeekday(instantToZonedDateISO(instant, zone))} ${instantToZonedTime(instant, zone)} your time` : null);
    };
    show();
  }, [iso, placeLocal]);

  if (!text) return null;
  return <span className="text-[13px] font-medium tabular-nums text-muted-foreground">{text}</span>;
}
