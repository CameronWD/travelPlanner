"use client";

import { LegCard, LegRow } from "@/components/plan/leg-pill";
import type { LegLabel } from "@/lib/plan/leg-label";
import type { TransportMode } from "@/lib/enum-values";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { ViewerArrival } from "./viewer-time";

export interface ShareTravelRowProps {
  mode: TransportMode;
  label: string;
  when: string;
  number: string | null;
  arrivesAt: string | null;
  arrivesLocal: string | null;
}

// The icon is a component, which a server component cannot hand to a client one:
// so the Plan's LegLabel is built here, from serialisable props only.
export function ShareTravelRow({ mode, label, when, number, arrivesAt, arrivesLocal }: ShareTravelRowProps) {
  const leg: LegLabel = {
    icon: TRANSPORT_MODE_META[mode].icon,
    label,
    sub: when,
    arrival: "",
    detail: number ?? "",
    missing: false,
    accessibleName: "",
  };
  return (
    // 7px right of the Plan's own line: its centre then sits under both a folded Stop's dot and an open Stop's number circle.
    <div data-share-leg className="pl-[7px]">
      <LegRow kind="legs" compact>
        <LegCard
          label={leg}
          compact
          footer={arrivesAt && arrivesLocal ? <ViewerArrival instant={arrivesAt} placeLocal={arrivesLocal} /> : undefined}
        />
      </LegRow>
    </div>
  );
}
