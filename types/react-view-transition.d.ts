import "react";

/**
 * React's <ViewTransition> and addTransitionType ship in the canary the Next
 * App Router bundles (node_modules/next/dist/compiled/react), not in the
 * stable `react` 19.2.4 in node_modules, whose @types/react therefore lack
 * them. This augmentation gives the App Router usage a type; the runtime
 * gap is bridged by components/ui/view-transition.tsx.
 */
declare module "react" {
  type ViewTransitionClassMap = string | { default?: string; [transitionType: string]: string | undefined };
  interface ViewTransitionProps {
    name?: string;
    default?: ViewTransitionClassMap;
    enter?: ViewTransitionClassMap;
    exit?: ViewTransitionClassMap;
    update?: ViewTransitionClassMap;
    share?: ViewTransitionClassMap;
    children?: ReactNode;
  }
  export const ViewTransition: ComponentType<ViewTransitionProps>;
  export function addTransitionType(type: string): void;
}
