import { CoverArt } from "@/components/trips/trip-cover";
import type { SketchStop } from "@/lib/trips/route-sketch";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { avatarInput, type ShareTraveller } from "@/lib/share-traveller";
import type { DayIndex, ShareStage } from "@/lib/share-view";
import { travellersLabel } from "@/lib/share-view";
import { formatDayRange, formatMonthSpan } from "@/lib/dates";
import { noOrphan } from "./no-orphan";
import { cn } from "@/lib/cn";
import { PlayOnce } from "./share-reveal";
import { ShareCountdown } from "./share-countdown";

export interface ShareHeroProps {
  stage: ShareStage;
  name: string;
  startDate: string;
  endDate: string;
  totalNights: number;
  stopCount: number;
  /** Before only: countdownFor(…) when kind === "sleeps". */
  countdown: { n: number; unit: "sleep" | "sleeps" } | null;
  /** During only. */
  progress: DayIndex | null;
  /** [] unless the link's showTravellers is on. */
  travellers: ShareTraveller[];
  coverStops: SketchStop[];
  /** The link's hashed ref (shareRefParam) — keys the once-per-session countdown; never the raw token. */
  refKey: string;
}

/** The inline S4 script. Only the hashed ref goes in, never the token. */
function countPendingScript(refKey: string): string {
  // Escape "<" so nothing in the key can close the <script> early.
  const key = JSON.stringify(`tp-share-count:${refKey}`).replace(/</g, "\\u003c");
  return `(function(){var s=document.currentScript&&document.currentScript.previousElementSibling;if(!s)return;try{if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(sessionStorage.getItem(${key}))return;s.setAttribute("data-count-pending","")}catch(e){}})()`;
}

const TITLE_SIZE: Record<ShareStage, string> = {
  before: "text-[44px]",
  during: "text-[36px]",
  after: "text-[34px]",
};

/** SHARE.md §3 — the coral hero card: stage-specific pill, title, sub line,
 * countdown/progress, Travellers and the cover polaroid (route sketch or
 * passport stamp only — never the uploaded photo; see the orchestrator
 * note, no public photo route). */
export function ShareHero({
  stage,
  name,
  startDate,
  endDate,
  totalNights,
  stopCount,
  countdown,
  progress,
  travellers,
  coverStops,
  refKey,
}: ShareHeroProps) {
  const s = (n: number) => (n === 1 ? "" : "s");

  return (
    <section
      data-slot="share-hero"
      data-stage={stage}
      aria-labelledby="share-title"
      className="tp-share-hero-in relative flex items-start justify-between gap-4 rounded-3xl border-2 border-border bg-coral p-4 text-on-accent shadow-hard-5 sm:p-7 lg:min-h-80 lg:rounded-[28px] lg:p-8"
    >
      <div className="min-w-0 flex-1">
        <span
          data-slot="share-pill"
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 py-[3px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground"
        >
          {stage === "before" && (
            <>
              <span className="lg:hidden">Shared trip</span>
              <span className="hidden lg:inline">Up next</span>
            </>
          )}
          {stage === "during" && progress && (
            <>
              <span data-live-dot aria-hidden="true" className="tp-live-ring size-2 shrink-0 rounded-full bg-coral" />
              On the road · Day {progress.day} of {progress.total}
            </>
          )}
          {stage === "after" && "Home again"}
        </span>

        <h1
          id="share-title"
          className={cn(
            "mt-4 break-words text-balance font-display font-extrabold leading-[0.95] tracking-[-0.05em] lg:text-[80px] lg:leading-[0.9]",
            TITLE_SIZE[stage],
          )}
        >
          {noOrphan(name)}
        </h1>

        <p className="mt-2 break-words text-sm font-bold lg:text-[17px]">
          {stage === "after"
            ? formatMonthSpan(startDate, endDate)
            : `${formatDayRange(startDate, endDate)} · ${totalNights} night${s(totalNights)} · ${stopCount} stop${s(stopCount)}`}
        </p>

        {stage === "before" && countdown ? (
          <div data-slot="share-countdown" className="mt-4 flex items-end gap-3">
            <ShareCountdown
              value={countdown.n}
              refKey={refKey}
              className="font-display text-[64px] font-extrabold leading-[0.85] tracking-[-0.06em] tabular-nums lg:text-[84px]"
            />
            {/* Cold load (MOTION.md S4): hide the server-rendered number before
                paint when the count will play, so it doesn't flash the final
                value first. Same pattern as day-carousel.tsx's cold-load
                script; React never runs a script it inserts on a client
                navigation, and ShareCountdown handles those. */}
            <script dangerouslySetInnerHTML={{ __html: countPendingScript(refKey) }} />
            <span className="pb-1 text-[15px] font-extrabold leading-[1.02] lg:text-lg">
              {countdown.unit}
              <br />
              to go
            </span>
          </div>
        ) : null}

        {stage === "during" && progress ? (
          <div className="mt-4 lg:hidden">
            <div
              role="progressbar"
              aria-label={`Day ${progress.day} of ${progress.total}`}
              aria-valuemin={1}
              aria-valuemax={progress.total}
              aria-valuenow={progress.day}
              className="h-4 overflow-hidden rounded-full border-2 border-border bg-card"
            >
              <PlayOnce
                play="tp-progress-fill"
                data-slot="share-progress-fill"
                className="h-full origin-left bg-foreground"
                style={{ transform: `scaleX(${progress.fraction})` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between gap-3 text-[13px] font-bold">
              <span className="min-w-0 truncate">{travellersLabel(travellers.map((t) => t.firstName))}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                {progress.nightsLeft} night{s(progress.nightsLeft)} to go
              </span>
            </div>
          </div>
        ) : null}

        {travellers.length > 0 ? (
          <div
            data-slot="share-travellers"
            className={cn("mt-5 items-center gap-2.5", stage === "during" ? "hidden lg:flex" : "flex")}
          >
            <div className="flex pl-2.5">
              {travellers.slice(0, 4).map((t) => (
                <TravellerAvatar
                  key={t.id}
                  traveller={avatarInput(t)}
                  size={32}
                  ring
                  className="-ml-2.5 size-7 ring-border lg:size-[34px]"
                />
              ))}
            </div>
            <span className="min-w-0 truncate text-sm font-bold">
              {travellersLabel(
                travellers.map((t) => t.firstName),
                { possessive: true },
              )}
            </span>
          </div>
        ) : null}

        {travellers.some((t) => t.mobile || t.travelNumber) ? (
          <ul aria-label="Contact details" data-slot="share-contacts" className="mt-3 flex flex-col gap-1 text-[13px]">
            {travellers
              .filter((t) => t.mobile || t.travelNumber)
              .map((t) => (
                <li key={t.id} className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                  <span className="break-words font-bold">{t.firstName}</span>
                  {t.mobile ? <span className="break-words">Mobile {t.mobile}</span> : null}
                  {t.travelNumber ? <span className="break-words">Travel number {t.travelNumber}</span> : null}
                </li>
              ))}
          </ul>
        ) : null}
      </div>

      <PlayOnce
        play="tp-share-polaroid-in"
        data-share-polaroid=""
        className={cn(
          "w-[96px] shrink-0 rotate-[4deg] rounded-[10px] border-2 border-border bg-card p-[6px] pb-[16px] shadow-hard-2 lg:w-[190px] lg:p-[9px] lg:pb-[28px]",
          stage === "after" ? "block" : "hidden lg:block",
        )}
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-[4px] border-2 border-border bg-background">
          <CoverArt
            tripId="share"
            name={name}
            hue="sun"
            photo={null}
            stops={coverStops}
            startDate={startDate}
            canEdit={false}
            size="hero"
            sketchSolid={stage === "after"}
          />
        </div>
      </PlayOnce>
    </section>
  );
}
