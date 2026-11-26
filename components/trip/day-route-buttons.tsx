import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { DayMapPoint } from "@/lib/day-map";
import { appleDirectionsUrl, googleDirectionsUrl } from "@/lib/map/maps";

export function DayRouteButtons({ routePoints, className }: { routePoints: DayMapPoint[]; className?: string }) {
  const google = googleDirectionsUrl(routePoints);
  const apple = appleDirectionsUrl(routePoints);
  if (!google && !apple) return null;
  const links = [
    { href: google, label: "Google Maps" },
    { href: apple, label: "Apple Maps" },
  ];
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-muted-foreground">Open today’s route in</span>
      <div className="flex gap-2">
        {links.map(({ href, label }) =>
          href ? (
            <Button key={label} asChild variant="secondary" size="md" className="min-h-11 flex-1 sm:flex-none">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Navigation aria-hidden="true" />
                {label}
              </a>
            </Button>
          ) : null,
        )}
      </div>
    </div>
  );
}
