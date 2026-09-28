"use client";

import * as React from "react";
import { startFirstTrip } from "@/app/(app)/trips/actions";
import { cn } from "@/lib/cn";

/** Empty hero polaroid: dashed inner box reading "+ Cover / photo" (desktop) or "+ Photo" (mobile). Decorative. */
function EmptyPolaroid({ mobile }: { mobile: boolean }) {
  return (
    <div aria-hidden="true" className={cn("shrink-0 border-2 border-border bg-card", mobile ? "w-[86px] rounded-[8px] p-[5px] pb-[14px] shadow-hard-1 rotate-[5deg]" : "mr-3 w-[150px] self-center rounded-[10px] p-[7px] pb-[24px] shadow-hard-2 rotate-[4deg]")}>
      <div className="grid aspect-[3/4] place-items-center rounded-[4px] border-2 border-dashed border-border bg-background text-center text-[12px] font-bold leading-tight text-foreground">
        {mobile ? "+ Photo" : <>+ Cover<br />photo</>}
      </div>
    </div>
  );
}

export function FirstTripCard({ variant }: { variant: "desktop" | "mobile" }) {
  const mobile = variant === "mobile";
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const ready = name.trim().length > 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await startFirstTrip(name.trim());
      // On success the action redirects; we only get here on failure.
      if (r && !r.success) setError(r.errors.name?.[0] ?? r.errors._?.[0] ?? "Something went wrong. Try again.");
    });
  }

  return (
    <section
      aria-label="First trip"
      className={cn(
        "island relative flex overflow-hidden border-2 border-border bg-coral",
        mobile ? "flex-col rounded-[22px] p-[18px] shadow-hard-2" : "gap-6 rounded-[24px] p-6 shadow-hard-3",
      )}
    >
      {mobile ? <div className="absolute right-[18px] top-[18px]"><EmptyPolaroid mobile /></div> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="self-start whitespace-nowrap shrink-0 rounded-full border-2 border-border bg-card px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.08em]">FIRST TRIP</span>
        <h2 className={cn("font-display font-extrabold leading-[0.9] tracking-[-0.04em]", mobile ? "mt-14 text-[44px]" : "mt-auto text-[64px]")}>
          Where to <br />first?
        </h2>
        <form onSubmit={onSubmit} className={cn("flex", mobile ? "mt-4 flex-col gap-2.5" : "mt-[18px] items-center gap-2.5")}>
          <input
            aria-label="Trip name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="Name it, e.g. Japan in spring"
            disabled={pending}
            className={cn("h-12 rounded-[14px] border-2 border-border bg-card px-3.5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring", mobile ? "w-full" : "min-w-0 flex-1")}
          />
          <button
            type="submit"
            disabled={!ready || pending}
            className={cn("h-12 shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-primary px-5 text-[15px] font-extrabold text-primary-foreground shadow-[4px_4px_0_hsl(var(--sun))] disabled:opacity-60 disabled:shadow-none", mobile && "w-full")}
          >
            {pending ? "Starting…" : "Start planning"}
          </button>
        </form>
        {error ? <p role="alert" className="mt-2 text-[13px] font-semibold text-foreground">{error}</p> : null}
      </div>
      {!mobile ? <EmptyPolaroid mobile={false} /> : null}
    </section>
  );
}
