import * as React from "react";

export type ViewTransitionClassMap = string | { default?: string; [transitionType: string]: string | undefined };

export interface ViewTransitionProps {
  name?: string;
  default?: ViewTransitionClassMap;
  enter?: ViewTransitionClassMap;
  exit?: ViewTransitionClassMap;
  update?: ViewTransitionClassMap;
  share?: ViewTransitionClassMap;
  children?: React.ReactNode;
}

// React's <ViewTransition> ships in the canary the App Router bundles, not in
// the stable `react` package vitest resolves (19.2.4 exports no such thing).
// Read it off the namespace once so the stable build — tests, and any future
// React that drops it — degrades to a plain passthrough: content still swaps,
// just without the animation. No "use client": usable from server pages and
// client components alike (props are plain strings/objects, so serialisable).
const Native = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }).ViewTransition;

export const hasNativeViewTransition = Native != null;

/** ADR 0063: the app's one route-motion primitive. */
export function ViewTransition(props: ViewTransitionProps) {
  if (!Native) return <>{props.children}</>;
  return <Native {...props} />;
}
