"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/** Client Component. Shows while navigator.onLine is false. `queued` = pending edits from your sync queue. */
function OfflineBanner({ queued = 0, className }: { queued?: number; className?: string }) {
  const [offline, setOffline] = React.useState(false);
  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className={cn("flex items-center gap-2.5 rounded-md bg-primary px-3.5 py-2.5 text-[13px] font-bold text-primary-foreground", className)}>
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-sun" />
      <span className="min-w-0 flex-1">Offline · showing what's saved{queued ? " · " + queued + " edits will sync" : ""}</span>
    </div>
  );
}

export { OfflineBanner };
