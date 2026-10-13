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

/** The breakpoint the rail appears from; below it a page keeps its in-flow contents. */
const FROM_CLASS = {
  lg: "hidden lg:-m-1 lg:block lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:p-1",
  xl: "hidden xl:-m-1 xl:block xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto xl:p-1",
} as const;

/**
 * The sticky "On this page" column (legal pages, the help guide). Plain `#id`
 * anchors and no client state, so each page's own hash handling (if any) does
 * the rest. Hidden below `from` (lg by default), where a page keeps its
 * in-flow contents instead. Capped to the viewport so a long list scrolls in
 * place; -m-1/p-1 keeps the links' focus rings inside the scroll clip.
 */
export function OnThisPage({
  groups,
  className,
  from = "lg",
}: {
  groups: OnThisPageGroup[];
  className?: string;
  /** `xl` for the Help guide, whose three-up cards need the room at lg (LA-139); legal pages keep `lg`. */
  from?: keyof typeof FROM_CLASS;
}) {
  const shown = groups.filter((group) => group.entries.length > 0);
  if (shown.length === 0) return null;
  return (
    <nav
      aria-label="On this page"
      className={cn(FROM_CLASS[from], className)}
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
