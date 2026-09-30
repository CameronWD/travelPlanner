"use client";

import { useEffect, useState } from "react";
import { instantToZonedTime } from "@/lib/tz";

// ---------------------------------------------------------------------------
// Spec §E4: a tiny clock ticking each minute rather than a page revalidate.
// It must SSR-match — render the server-computed `initial` on first paint,
// then only start reading the client's clock after mount, aligned to the
// next minute boundary so it doesn't drift.
// ---------------------------------------------------------------------------

export function LocalClock({ timeZone, initial }: { timeZone: string; initial: string }) {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        setNow(instantToZonedTime(new Date(), timeZone));
        interval = setInterval(() => {
          setNow(instantToZonedTime(new Date(), timeZone));
        }, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [timeZone]);

  return (
    <time className="tabular-nums" suppressHydrationWarning>
      {now}
    </time>
  );
}
