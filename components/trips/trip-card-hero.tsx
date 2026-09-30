import type { ReactNode } from "react";
import { StatusPill } from "@/components/trips/status-pill";
import { NextStepChip } from "@/components/trips/next-step-chip";
import { TripCover } from "@/components/trips/trip-cover";
import { StretchedLink, BigNumberBlock, type TripCardModel } from "@/components/trips/trip-card";
import { cn } from "@/lib/cn";

export interface TripCardHeroViewProps {
  pill: ReactNode;
  dateLine?: ReactNode;
  name: ReactNode;
  big: ReactNode;
  chip?: ReactNode;
  cover: ReactNode;
  link?: ReactNode;
  className?: string;
}

/** The hero's markup, data-free, so the New trip preview renders the same card (NEW_TRIP.md §7). */
export function TripCardHeroView({ pill, dateLine, name, big, chip, cover, link, className }: TripCardHeroViewProps) {
  return (
    <article className={cn("island relative flex h-[250px] w-[300px] shrink-0 snap-start gap-5 overflow-hidden rounded-[22px] border-2 border-border bg-coral p-[18px] shadow-hard-2 md:h-[280px] md:w-[600px] md:rounded-[24px] md:px-6 md:py-[22px] md:shadow-hard-3", className)}>
      {link}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          {pill}
          {dateLine ? <span className="hidden truncate text-[13px] font-bold md:block">{dateLine}</span> : null}
        </div>
        <h2 className="mt-3 hidden font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:[display:-webkit-box]">
          {name}
        </h2>
        <div className="mt-auto">
          {big}
          <h2 className="mt-2 font-display text-[20px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:hidden">
            {name}
          </h2>
          {dateLine ? <p className="mt-1 text-[13px] font-semibold md:hidden">{dateLine}</p> : null}
        </div>
        {chip ? <div className="hidden md:block">{chip}</div> : null}
      </div>
      {/* Polaroid's own "hero" frame is responsive (components/trips/polaroid.tsx). */}
      <div className="pointer-events-none absolute right-4 top-[18px] md:static md:flex md:items-center">
        <div className="pointer-events-auto">{cover}</div>
      </div>
    </article>
  );
}

/** "Up next" hero (TRIPS_PAGE.md §4a, §8): coral, 600×280 desktop; 300×250 mobile with the chip dropped. */
export function TripCardHero({ model }: { model: TripCardModel }) {
  return (
    <TripCardHeroView
      link={<StretchedLink model={model} />}
      pill={<StatusPill kind={model.kind} />}
      dateLine={model.dateLine}
      name={model.name}
      big={<BigNumberBlock big={model.big} numberClass="text-[72px] leading-[0.85] tracking-[-0.06em] md:text-[96px]" unitClass="text-[18px] leading-[1.02] md:text-[24px]" />}
      chip={model.nextStep ? <NextStepChip row={model.nextStep} /> : null}
      cover={<TripCover {...model.cover} size="hero" />}
    />
  );
}
