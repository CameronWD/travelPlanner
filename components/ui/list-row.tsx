import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

const TILE = { coral: "bg-coral text-on-accent", sun: "bg-sun text-on-accent", teal: "bg-teal text-on-accent", lilac: "bg-lilac text-on-accent", ink: "bg-primary text-primary-foreground", white: "bg-card text-foreground" } as const;

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  tile?: React.ReactNode;
  tileTone?: keyof typeof TILE;
  title: React.ReactNode;
  sub?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Render as a Link/button yourself and pass it here, e.g. asChild-style: <ListRow as={Link} href=…> */
  as?: React.ElementType;
  href?: string;
}

/**
 * Server Component (renders a <div> by default). Pass as={Link} + href to make it navigable.
 * Pass as="button" + onClick only from a Client Component.
 */
function ListRow({ tile, tileTone = "lilac", title, sub, trailing, as: Comp = "div", className, ...props }: ListRowProps) {
  const interactive = Comp !== "div";
  return (
    <Comp className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-md text-left", interactive && "cursor-pointer", className)} {...props}>
      {tile != null ? <span aria-hidden="true" className={cn("grid size-[34px] shrink-0 place-items-center rounded-sm border-2 border-border text-[13px] font-extrabold", TILE[tileTone])}>{tile}</span> : null}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block">{title}</span>
        {sub ? <span className="block text-xs font-medium text-muted-foreground">{sub}</span> : null}
      </span>
      <span aria-hidden="true" className="flex shrink-0 text-muted-foreground">{trailing ?? (interactive ? <ChevronRight className="size-[18px]" strokeWidth={2.5} /> : null)}</span>
    </Comp>
  );
}

export { ListRow };
