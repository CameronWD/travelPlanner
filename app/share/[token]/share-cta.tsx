import Link from "next/link";
import type { ShareHrefs } from "@/lib/share-ref";
import type { ShareStage } from "@/lib/share-view";
import { ShareReveal } from "./share-reveal";
import { PendingLink } from "./pending-link";

// ---------------------------------------------------------------------------
// Share page CTA card (SHARE.md §9, spec §E.2, ADR 0057). Before/during and
// an After with no stops to copy all land on the same invite-only Request
// access card; only an After with stops offers the Use this route copy.
// ---------------------------------------------------------------------------

const CTA_BUTTON = "mt-4 h-14 w-full px-7 text-base lg:mt-0 lg:w-auto";

// The button pops once as the card comes into view (MOTION.md S10: the
// .tp-reveal-pop rule in globals.css) and shows its loading state on click (S11).
export function ShareCta({
  stage,
  stopCount,
  hrefs,
}: {
  stage: ShareStage;
  stopCount: number;
  hrefs: ShareHrefs;
}) {
  const showUseThisRoute = stage === "after" && stopCount > 0;

  return (
    <section
      data-slot="share-cta"
      data-share-cta
      aria-labelledby="share-cta-heading"
      className="rounded-[22px] border-2 border-border bg-sun p-4 shadow-hard-5 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:rounded-[28px] lg:p-7"
    >
      <div>
        <h2
          id="share-cta-heading"
          className="font-display text-2xl font-extrabold leading-tight tracking-[-0.03em] lg:text-4xl"
        >
          {showUseThisRoute ? (
            "Fancy doing this one?"
          ) : (
            <>
              <span className="lg:hidden">Got a trip of your own?</span>
              <span className="hidden lg:inline">Got a trip of your own coming up?</span>
            </>
          )}
        </h2>
        <p className="mt-2 max-w-[560px] text-[15px] font-semibold leading-[1.45] lg:text-[17px]">
          {showUseThisRoute
            ? `Start a trip with the same ${stopCount} stop${stopCount === 1 ? "" : "s"}. You pick the dates.`
            : "Teepee keeps the route, the days and the money in one place, for everyone who's going. It's invite-only for now — ask for a spot."}
        </p>
      </div>
      {showUseThisRoute ? (
        <div className="flex flex-col lg:items-end">
          <ShareReveal rise={false} className="tp-reveal-pop">
            <PendingLink href={hrefs.useRoute} className={CTA_BUTTON}>
              Use this route
            </PendingLink>
          </ShareReveal>
          <p className="mt-2 text-center text-sm font-bold lg:text-left">
            or{" "}
            <Link href={hrefs.fromScratch} className="text-coral-text underline underline-offset-2">
              start from scratch
            </Link>
          </p>
        </div>
      ) : (
        <ShareReveal rise={false} className="tp-reveal-pop">
          <PendingLink href={hrefs.requestAccess} className={CTA_BUTTON}>
            Request access
          </PendingLink>
        </ShareReveal>
      )}
    </section>
  );
}

export const SHARE_FOOTER_COPY =
  "View only. Costs, notes and booking references stay private to the people on the trip.";

export function ShareFooter() {
  return (
    <footer className="py-4 text-center text-[13px] font-semibold text-muted-foreground">
      {SHARE_FOOTER_COPY}
    </footer>
  );
}
