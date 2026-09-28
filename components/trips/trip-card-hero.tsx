import { StatusPill } from "@/components/trips/status-pill";
import { NextStepChip } from "@/components/trips/next-step-chip";
import { TripCover } from "@/components/trips/trip-cover";
import { StretchedLink, BigNumberBlock, type TripCardModel } from "@/components/trips/trip-card";

/** "Up next" hero (TRIPS_PAGE.md §4a, §8): coral, 600×280 desktop; 300×250 mobile with the chip dropped. */
export function TripCardHero({ model }: { model: TripCardModel }) {
  return (
    <article className="island relative flex h-[250px] w-[300px] shrink-0 snap-start gap-5 overflow-hidden rounded-[22px] border-2 border-border bg-coral p-[18px] shadow-hard-2 md:h-[280px] md:w-[600px] md:rounded-[24px] md:px-6 md:py-[22px] md:shadow-hard-3">
      <StretchedLink model={model} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <StatusPill kind={model.kind} />
          <span className="hidden truncate text-[13px] font-bold md:block">{model.dateLine}</span>
        </div>
        <h2 className="mt-3 hidden font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:[display:-webkit-box]">
          {model.name}
        </h2>
        <div className="mt-auto">
          <BigNumberBlock big={model.big} numberClass="text-[72px] leading-[0.85] tracking-[-0.06em] md:text-[96px]" unitClass="text-[18px] leading-[1.02] md:text-[24px]" />
          <h2 className="mt-2 font-display text-[20px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:hidden">
            {model.name}
          </h2>
          <p className="mt-1 text-[13px] font-semibold md:hidden">{model.dateLine}</p>
        </div>
        {model.nextStep ? <div className="hidden md:block"><NextStepChip row={model.nextStep} /></div> : null}
      </div>
      {/*
        One TripCover, one Polaroid instance. Polaroid's own "hero" frame is
        responsive (components/trips/polaroid.tsx): it wears the mobile-hero
        frame below `md` and the desktop hero frame from `md`, so there is no
        need to mount two size-swapped covers here.
      */}
      <div className="pointer-events-none absolute right-4 top-[18px] md:static md:flex md:items-center">
        <div className="pointer-events-auto"><TripCover {...model.cover} size="hero" /></div>
      </div>
    </article>
  );
}
