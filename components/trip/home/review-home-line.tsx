import type { Route } from "next";
import Link from "next/link";
import { ChevronRight, SearchCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Home's pointer to the latest Review (spec 2026-10-17 R10): "N open from
 * the <date> review". One node above both the phone and desktop trees, like
 * the What's new banner, so it reads the same at every width.
 */
export function ReviewHomeLine({ text, href, className }: { text: string; href: Route; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted",
        className,
      )}
    >
      <SearchCheck className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{text}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
