import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * Server Component. Wraps lucide-react with Teepee defaults (2.5 stroke, 18px).
 * Usage: <Icon icon={MapPin} />. For 12–16px, pass strokeWidth={3}.
 */
function Icon({ icon: I, size = 18, strokeWidth = 2.5, ...props }: LucideProps & { icon: LucideIcon }) {
  return <I size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
}

export { Icon };
