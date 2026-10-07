import * as React from "react";
import { cn } from "@/lib/cn";

interface OnThisPageEntry {
  id: string;
  title: string;
}

export interface OnThisPageGroup {
  /** A small heading over this run of links; the first run usually has none. */
  label?: string;
  entries: OnThisPageEntry[];
}

/** Lowercases and replaces runs of non-alphanumerics with a single "-", trimmed. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The sticky "On this page" column (legal pages, the help guide). Plain `#id`
 * anchors and no client state, so each page's own hash handling (if any) does
 * the rest. Hidden below lg, where a page keeps its in-flow contents instead.
 * Capped to the viewport so a long list scrolls in place; -m-1/p-1 keeps the
 * links' focus rings inside the scroll clip.
 */
export function OnThisPage({
  groups,
  className,
}: {
  groups: OnThisPageGroup[];
  className?: string;
}) {
  const shown = groups.filter((group) => group.entries.length > 0);
  if (shown.length === 0) return null;
  return (
    <nav
      aria-label="On this page"
      className={cn(
        "hidden lg:-m-1 lg:block lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:p-1",
        className,
      )}
    >
      <p className="text-label text-muted-foreground">On this page</p>
      <ul className="mt-3 flex flex-col gap-4">
        {shown.map((group, i) => {
          // No useId() here (this stays a server component): derived from the
          // label's own slug plus the group index, so a list navigated by a
          // screen reader announces which group it belongs to instead of a
          // bare "list, N items".
          const labelId = group.label ? `on-this-page-${i}-${slugify(group.label)}` : undefined;
          return (
            <li key={group.label ?? `run-${i}`}>
              {group.label ? (
                <p id={labelId} className="mb-2 text-[13px] font-extrabold text-foreground">
                  {group.label}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2" aria-labelledby={labelId}>
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className="text-[13px] font-semibold text-muted-foreground underline decoration-transparent underline-offset-2 hover:text-foreground hover:decoration-current"
                    >
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
