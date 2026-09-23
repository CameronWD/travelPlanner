import { cn } from "@/lib/cn";

/** Server Component. Pulses gently; static under reduced motion. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("rounded-sm bg-border-soft/60 motion-safe:tp-pulse", className)} {...props} />;
}

export { Skeleton };
