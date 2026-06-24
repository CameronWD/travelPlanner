"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moreNav, isNavActive } from "@/components/trip/trip-nav";
import { cn } from "@/lib/cn";

export function NavMoreMenu({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;
  const items = moreNav(tripId);
  const anyActive = items.some((i) => isNavActive(i.href, pathname, base));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative flex shrink-0 items-center gap-1 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          anyActive
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground/80",
        )}
      >
        More
        <ChevronDown className="size-4" aria-hidden="true" />
        {anyActive && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
