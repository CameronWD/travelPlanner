import Link from "next/link";
import { cn } from "@/lib/cn";
import type { HistoryRow } from "@/lib/review/view";

/** Spec R10: every Review kept, newest first: kind, who and when, and its summary line. */
export function ReviewHistory({ rows }: { rows: HistoryRow[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 id="review-history" className="font-display text-lg font-extrabold tracking-[-0.02em]">History</h2>
      <ul role="list" aria-labelledby="review-history" className="flex flex-col divide-y-2 divide-border-soft overflow-hidden rounded-xl border-2 border-border bg-card">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={r.href}
              aria-current={r.current ? "page" : undefined}
              className={cn("flex min-h-11 flex-col gap-0.5 px-4 py-3 hover:bg-muted", r.current && "bg-muted")}
            >
              <span className="text-sm font-semibold text-foreground">
                {r.kindLabel} <span className="font-normal text-muted-foreground">by {r.byName}, {r.when}</span>
              </span>
              <span className="text-[13px] text-muted-foreground">{r.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
