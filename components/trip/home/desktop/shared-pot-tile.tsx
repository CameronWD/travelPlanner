import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDayLabel } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

export interface SharedPotNextPayment {
  amountMinor: number;
  currency: string;
  label: string;
  /** YYYY-MM-DD */
  dueDate: string;
}

export interface SharedPotTileProps {
  /** The Money page. */
  href: string;
  hasCover: boolean;
  costTotalMinor: number;
  paidTotalMinor: number;
  /** The Trip's home currency — the totals are in it. */
  currency: string;
  nextPayment: SharedPotNextPayment | null;
}

const EYEBROW = "text-[11px] font-extrabold uppercase tracking-[0.08em]";

/**
 * Desktop Home "Shared pot" tile (spec 2026-09-27-desktop-home §5). Sun card;
 * the whole tile links to Money through a stretched link underneath the
 * content, so the "Add your first cost" link can sit on top without nesting.
 * Money is a shared pot — never split per person. Totals abbreviate ($11.1k);
 * any unabbreviated amount shows 2 decimals ($115.20).
 */
export function SharedPotTile({
  href,
  hasCover,
  costTotalMinor,
  paidTotalMinor,
  currency,
  nextPayment,
}: SharedPotTileProps) {
  const costed = costTotalMinor > 0;
  const pct = costed ? Math.min(100, Math.round((paidTotalMinor / costTotalMinor) * 100)) : 0;
  const total = costed ? formatMoneyCompact(costTotalMinor, currency) : formatMoneyCompact(0, currency);

  const totalBlock = (
    <>
      <h2 className={EYEBROW}>Shared pot</h2>
      <p className="mt-1.5 font-display text-[40px] font-extrabold leading-none tracking-[-0.02em]">{total}</p>
      <p className="text-sm font-semibold">planned so far</p>
    </>
  );

  const progress = costed ? (
    <div>
      <ProgressBar value={pct} label="Paid" className="bg-card" />
      <p className="mt-1.5 text-[13px] font-semibold">
        {formatMoneyCompact(paidTotalMinor, currency)} paid · {pct}%
      </p>
    </div>
  ) : (
    <Link
      href={href}
      className="pointer-events-auto relative z-10 inline-flex min-h-11 items-center self-start text-sm font-bold underline underline-offset-2"
    >
      Add your first cost
    </Link>
  );

  const due = nextPayment ? (
    <p className="text-[13px] text-on-accent-muted">Due {formatDayLabel(nextPayment.dueDate)}</p>
  ) : null;

  const link = (
    <Link
      href={href}
      aria-label={`Shared pot: ${total} planned. Open Money`}
      className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-[3px] focus-visible:-outline-offset-4 focus-visible:outline-ring"
    />
  );

  return (
    <Card tone="sun" radius="xl" shadow={3} className="relative flex h-full min-h-0 overflow-hidden text-on-accent">
      {link}
      {hasCover ? (
        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col p-[22px]">
          {totalBlock}
          <div className="mt-3.5">{progress}</div>
          <div className="mt-auto border-t-2 border-border pt-3">
            <p className={EYEBROW}>Next payment</p>
            {nextPayment ? (
              <>
                <p className="text-[15px] font-bold">
                  {formatMoney(nextPayment.amountMinor, nextPayment.currency)} · {nextPayment.label}
                </p>
                {due}
              </>
            ) : (
              <p className="text-[15px] font-bold">Nothing due</p>
            )}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none relative z-10 grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] gap-6 px-6 py-[22px]">
          <div className="flex min-w-0 flex-col">
            {totalBlock}
            <div className={cn("mt-auto", costed ? "pt-3" : "")}>{progress}</div>
          </div>
          <div className="flex min-w-0 flex-col border-l-2 border-border pl-[22px]">
            <p className={EYEBROW}>Next payment</p>
            {nextPayment ? (
              <>
                <p className="mt-2 font-display text-[28px] font-extrabold leading-none">
                  {formatMoney(nextPayment.amountMinor, nextPayment.currency)}
                </p>
                <p className="mt-1 truncate text-sm font-semibold">{nextPayment.label}</p>
                <div className="mt-auto">{due}</div>
              </>
            ) : (
              <p className="mt-2 text-sm font-semibold">Nothing due</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
