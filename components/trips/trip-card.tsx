import Link from "next/link";
import { tripPath } from "@/lib/trip-path";
import type { SortRow } from "@/lib/sort-these-out";
import { cardAccessibleName, type BigNumber, type TripCardKind } from "@/lib/trips/trip-status";
import { TripCover, type TripCoverInput } from "@/components/trips/trip-cover";
import { StatusPill } from "@/components/trips/status-pill";
import { HUE_CLASSES } from "@/lib/hues";
import { cn } from "@/lib/cn";

export interface TripCardModel {
  id: string;
  /** The Trip's current slug, or id fallback — its URL ref (ADR 0064). */
  ref: string;
  name: string;
  kind: TripCardKind;
  big: BigNumber;
  dateLine: string;
  href: string;
  cover: TripCoverInput;
  /** Position among the standard cards (polaroid tilt). */
  index: number;
  /** Up next / On the road only: the first "Sort these out" row. */
  nextStep?: SortRow | null;
}

/** Stretched link: the whole card is one link; siblings with `relative z-10` stay clickable. */
export function StretchedLink({ model, className }: { model: TripCardModel; className?: string }) {
  return (
    <Link
      href={model.href}
      aria-label={cardAccessibleName(model.name, model.kind, model.big)}
      className={cn("absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
    />
  );
}

/** Big number + stacked two-line unit. */
export function BigNumberBlock({ big, numberClass, unitClass }: { big: BigNumber; numberClass: string; unitClass: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={cn("font-display font-extrabold", numberClass)}>{big.value}</span>
      {big.unit ? (
        <span className={cn("whitespace-pre-line font-display font-extrabold", unitClass)}>{`${big.unit[0]}\n${big.unit[1]}`}</span>
      ) : null}
    </div>
  );
}

/** Standard card (TRIPS_PAGE.md §4b): 300×280 desktop, 220 wide mobile (cover hidden). */
export function TripCard({ model }: { model: TripCardModel }) {
  const { kind } = model;
  return (
    <article
      className={cn(
        "relative flex h-[250px] w-[220px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border-2 border-border p-[18px] shadow-hard-2",
        "md:h-[280px] md:w-[300px] md:rounded-[24px] md:p-5 md:shadow-hard-3",
        kind === "done" ? "bg-canvas" : "bg-card",
      )}
    >
      <StretchedLink model={model} />
      {/* Phones hide the small cover, so the Trip colour would otherwise never
          reach the card there (Feedback cmumchso1000204l0s15n8asx). */}
      <span
        data-trip-colour-strip
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-1.5 md:hidden", HUE_CLASSES[model.cover.hue].fill)}
      />
      <div className="pointer-events-none absolute right-[18px] top-[22px] hidden md:block">
        <div className="pointer-events-auto">
          <TripCover {...model.cover} size="small" index={model.index} />
        </div>
      </div>
      <StatusPill kind={kind} className="self-start" />
      <div className="mt-auto">
        <BigNumberBlock big={model.big} numberClass="text-[48px] leading-[0.85] tracking-[-0.05em] md:text-[56px]" unitClass="text-[14px] leading-[1.02] md:text-[16px]" />
        <h2 className="mt-3 truncate font-display text-[20px] font-extrabold leading-[1.1] md:text-[22px]">{model.name}</h2>
        {kind === "idea" ? (
          <Link href={tripPath(model.ref, "/settings")} className="relative z-10 mt-1 inline-block text-[13px] font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring md:text-sm">
            {model.dateLine}
          </Link>
        ) : (
          <p className="mt-1 text-[13px] font-semibold text-foreground md:text-sm">{model.dateLine}</p>
        )}
      </div>
    </article>
  );
}
