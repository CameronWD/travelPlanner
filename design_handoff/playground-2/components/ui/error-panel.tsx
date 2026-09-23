import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { CloudOff, SearchX, TriangleAlert, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";

type Kind = "error" | "offline" | "not-found" | "forbidden";

const PRESET: Record<Kind, { icon: LucideIcon; tone: string; title: string; body: string }> = {
  error:       { icon: TriangleAlert, tone: "bg-coral", title: "That didn\u2019t load", body: "Something broke on our side. Your trip is safe \u2014 nothing was lost." },
  offline:     { icon: WifiOff,       tone: "bg-sun",   title: "You\u2019re offline",   body: "This page wasn\u2019t saved for offline. Anything you\u2019ve opened before still works." },
  "not-found": { icon: SearchX,       tone: "bg-lilac", title: "Nothing here",        body: "This page doesn\u2019t exist, or you don\u2019t have access to it." },
  forbidden:   { icon: CloudOff,      tone: "bg-teal",  title: "Not your trip (yet)", body: "Ask someone on the trip to invite you." },
};

export interface ErrorPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  kind?: Kind;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons/links. First one is the primary action. Pass <Button onClick={reset}>Try again</Button> from error.tsx. */
  actions?: React.ReactNode;
  /** error.digest — shown small so it can be quoted in feedback. Never the message. */
  digest?: string;
  /** Full-height centred (route boundaries) vs inline card (inside a section). */
  layout?: "page" | "card";
}

/**
 * Server Component (no handlers of its own). Used by every error.tsx, not-found.tsx and the
 * share not-found. The caller passes actions, so error.tsx (a Client Component) owns `reset`.
 */
function ErrorPanel({ kind = "error", title, description, actions, digest, layout = "page", className, ...props }: ErrorPanelProps) {
  const p = PRESET[kind];
  const Icon = p.icon;
  return (
    <div role={kind === "error" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center gap-3 text-center",
        layout === "page" ? "min-h-[60vh] justify-center px-5 py-10" : "rounded-xl border-2 border-border bg-card px-6 py-8",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn("island grid size-16 -rotate-6 place-items-center rounded-lg border-2 border-border shadow-hard-2", p.tone)}>
        <Icon className="size-8" strokeWidth={2.5} />
      </span>
      <h1 className="mt-2 font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.03em]">{title ?? p.title}</h1>
      <p className="max-w-[20rem] text-sm font-medium text-muted-foreground text-pretty">{description ?? p.body}</p>
      {actions ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">{actions}</div> : null}
      {digest ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">ref {digest}</p> : null}
    </div>
  );
}

/** Inline, inside a card or form: one line + optional retry. */
function InlineError({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-center gap-2.5 rounded-md border-2 border-coral-text bg-card px-3 py-2.5 text-[13px] font-semibold", className)}>
      <TriangleAlert className="size-[18px] shrink-0 text-coral-text" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

export { ErrorPanel, InlineError };
