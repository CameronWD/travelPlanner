import { cn } from "@/lib/cn";

const TONE = { coral: "bg-coral text-on-accent", sun: "bg-sun text-on-accent", teal: "bg-teal text-on-accent", lilac: "bg-lilac text-on-accent", ink: "bg-primary text-primary-foreground" } as const;

/** Server Component. Round count. Decorative, so put the meaning in the parent's accessible name. Key it on count to replay tp-pop. */
function CountBadge({ count, tone = "coral", className }: { count: number | string; tone?: keyof typeof TONE; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-grid h-6 min-w-6 place-items-center rounded-full border-2 border-border px-1.5 text-[11px] font-extrabold leading-none motion-safe:tp-pop", TONE[tone], className)}>{count}</span>;
}

export { CountBadge };
