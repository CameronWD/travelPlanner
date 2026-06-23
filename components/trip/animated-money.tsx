"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { formatMoney } from "@/lib/money";

/**
 * Count-up wrapper around formatMoney for whole-currency totals (minor units).
 */
export function AnimatedMoney({
  minor,
  currency,
  className,
}: {
  minor: number;
  currency: string;
  className?: string;
}) {
  return (
    <AnimatedNumber
      value={minor}
      format={(n) => formatMoney(Math.round(n), currency)}
      className={className}
    />
  );
}
