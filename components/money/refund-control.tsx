"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/money/refund-dialog";
import { RefundTag } from "@/components/money/refund-tag";
import type { CostRow } from "@/lib/money/cost-row";

/** The Refund button and tag a paid Cost's edit dialog shows. Nothing for an unpaid Cost. */
export function RefundControl({ cost }: { cost: CostRow }) {
  const [open, setOpen] = React.useState(false);
  if (cost.paidAt == null || cost.paidMinor == null) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <RefundTag cost={cost} />
      <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
        Refund
      </Button>
      {open ? <RefundDialog cost={cost} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
