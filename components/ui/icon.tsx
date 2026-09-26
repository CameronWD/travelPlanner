import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * Server Component. Wraps lucide-react with Teepee defaults (2.5 stroke, 18px).
 * Usage: <Icon icon={MapPin} />. For 12–16px, pass strokeWidth={3}.
 */
function Icon({ icon: I, size = 18, strokeWidth = 2.5, ...props }: LucideProps & { icon: LucideIcon }) {
  return <I size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
}

/** Custom brand icon: tent. Same grid/stroke as lucide. */
function TentIcon({ size = 18, strokeWidth = 2.5, ...props }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 2.5 21.5 19a1 1 0 0 1-.9 1.5H15l-3 3-3-3H3.4a1 1 0 0 1-.9-1.5z" /><path d="M12 10l4 10.5" /><path d="M12 10 8 20.5" /><path d="M9 2.5l3 3.5 3-3.5" />
    </svg>
  );
}

export { Icon, TentIcon };
