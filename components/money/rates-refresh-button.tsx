"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { refreshRates } from "@/server/actions/rates";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/cn";

export function RatesRefreshButton({
  tripId,
  homeCurrency,
  currencies,
  onRefreshed,
}: {
  tripId: string;
  homeCurrency: string;
  currencies: string[];
  onRefreshed(): void;
}) {
  const [pending, setPending] = React.useState(false);

  async function refresh() {
    setPending(true);
    try {
      const { results } = await refreshRates(tripId, currencies, homeCurrency);
      if (results.length > 0 && results.every((r) => r.rate == null)) throw new Error("no rate came back");
      onRefreshed();
    } catch {
      toast({ variant: "destructive", title: "Couldn’t refresh rates. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      aria-label="Refresh all rates"
      disabled={pending}
      onClick={refresh}
      className="pressable -my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-on-accent disabled:opacity-70"
    >
      <RefreshCw className={cn("size-4", pending && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
    </button>
  );
}
