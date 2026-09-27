import { DetailSkeleton, HomeDesktopSkeleton } from "@/components/ui/skeletons";

/**
 * Loading state for the trip segment (trip home and any nested page without
 * its own boundary). Below lg: the detail archetype (the phone Home). At lg+:
 * the desktop Home's header + tile grid (spec 2026-09-27-desktop-home §9).
 * CSS picks one, so only one status is ever exposed.
 */
export default function TripLoading() {
  return (
    <>
      <div className="lg:hidden">
        <DetailSkeleton label="Loading trip" />
      </div>
      <HomeDesktopSkeleton className="hidden lg:flex" />
    </>
  );
}
