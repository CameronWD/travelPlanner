import { StatusPill } from "@/components/trips/status-pill";
import { NextStepChip } from "@/components/trips/next-step-chip";
import { Polaroid } from "@/components/trips/polaroid";
import { CoverStamp } from "@/components/trips/cover-stamp";
import { BigNumberBlock } from "@/components/trips/trip-card";
import { TripCardHeroView } from "@/components/trips/trip-card-hero";
import { cardBigNumber } from "@/lib/trips/trip-status";
import { formatDateRangeCompact, formatNights, nightsBetween } from "@/lib/dates";
import { previewModel, type PreviewInput, type PreviewModel } from "./preview-model";
import { cn } from "@/lib/cn";

function Bottom({ bottom }: { bottom: PreviewModel["bottom"] }) {
  if (bottom.kind === "skeleton") {
    return (
      <div data-preview-skeleton className="flex flex-col gap-2">
        <span className="h-3.5 w-[120px] rounded-full bg-foreground/15" />
        <span className="h-3.5 w-[84px] rounded-full bg-foreground/15" />
      </div>
    );
  }
  const big = bottom.kind === "big" ? bottom.big : { value: bottom.month, unit: null, lead: "Sometime in" };
  return <BigNumberBlock big={big} numberClass="text-[72px] leading-[0.85] tracking-[-0.06em] md:text-[84px]" unitClass="text-[18px] leading-[1.02] md:text-[22px]" />;
}

function Cover({ m, coverUrl, size }: { m: PreviewModel; coverUrl?: string; size: "hero" | "small" }) {
  if (coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local object URL
    return <img src={coverUrl} alt="" className="size-full object-cover" />;
  }
  return <CoverStamp name={m.title} place={m.stamp.place} startDate={m.stamp.startDate} dateLabel={m.stamp.dateLabel} hue="coral" size={size} />;
}

/** Desktop preview column (NEW_TRIP.md §7): the real Trips hero, fed by the draft. */
export function TripPreview({ coverUrl, className, ...input }: PreviewInput & { coverUrl?: string; className?: string }) {
  const m = previewModel(input);
  return (
    <div data-testid="trip-preview" aria-hidden="true" inert className={cn("w-[420px] max-w-full origin-center md:scale-[0.85] xl:scale-100", className)}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">On your trips page</p>
      <div className="mt-3">
        <TripCardHeroView
          className="md:w-[420px] md:shadow-hard-4"
          pill={<StatusPill kind={m.pill.kind} label={m.pill.label} />}
          dateLine={m.dateLine ?? undefined}
          name={<span className={cn(m.placeholder && "text-foreground/40")}>{m.title}</span>}
          big={<Bottom bottom={m.bottom} />}
          chip={m.chip ? <NextStepChip row={{ id: "preview-first-stop", title: "Add your first stop", href: "#", tone: "coral", icon: "map-pin" }} /> : null}
          cover={<Polaroid size="hero"><Cover m={m} coverUrl={coverUrl} size="hero" /></Polaroid>}
        />
      </div>
      <p className="mt-3 text-sm font-semibold text-on-accent-muted">{m.caption}</p>
    </div>
  );
}

/** Phones, step 1: a 250px tilted mini card (NEW_TRIP.md §7 "Mobile"). */
export function TripPreviewMini(input: PreviewInput) {
  const m = previewModel(input);
  return (
    <div data-testid="trip-preview-mini" aria-hidden="true" className="island mx-auto mt-8 flex w-[250px] -rotate-2 gap-3 rounded-[18px] border-2 border-border bg-coral p-3.5 shadow-hard-2 md:hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusPill kind={m.pill.kind} label={m.pill.label} className="self-start" />
        <p className={cn("mt-2 font-display text-[20px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden", m.placeholder && "text-foreground/40")}>{m.title}</p>
      </div>
      <div className="w-[70px] shrink-0 rotate-[5deg] self-center rounded-[8px] border-2 border-border bg-card p-[4px] pb-[12px]">
        <div className="aspect-[3/4] overflow-hidden rounded-[3px] border-2 border-border">
          <Cover m={m} size="small" />
        </div>
      </div>
    </div>
  );
}

/** Phones, step 2: the coral countdown strip under the calendar. */
export function CountdownStrip({ startDate, endDate, today }: { startDate: string; endDate: string; today: string }) {
  const big = cardBigNumber({ kind: "up-next", startDate, endDate, today });
  return (
    <div data-testid="countdown-strip" className="island mt-3 flex items-center gap-3 rounded-2xl border-2 border-border bg-coral px-4 py-2.5 text-on-accent md:hidden">
      <span className="font-display text-4xl font-extrabold leading-none tabular-nums">{big.value}</span>
      {big.unit ? (
        <span className="flex flex-col text-[13px] font-extrabold leading-tight">
          <span>{big.unit[0]}</span>
          <span>{big.unit[1]}</span>
        </span>
      ) : null}
      <span className="ml-auto flex flex-col text-right text-[13px] font-extrabold leading-tight tabular-nums">
        <span>{formatDateRangeCompact(startDate, endDate)}</span>
        <span>{formatNights(nightsBetween(startDate, endDate))}</span>
      </span>
    </div>
  );
}
