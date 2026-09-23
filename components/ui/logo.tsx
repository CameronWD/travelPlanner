import { cn } from "@/lib/cn";
import { WORDMARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_TRANSFORM, WORDMARK_WORD_D, WORDMARK_DOT_D } from "./logo-paths";

/** Server Component. Tent-pin mark + lowercase wordmark. Mark colours are fixed brand colours. */
function Mark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  const ink = "#1D1D1B", bone = "#EDE6D8";
  return (
    <svg width={size} height={size} viewBox={onDark ? "-2 0 52 50" : "0 0 48 48"} aria-hidden="true" className="shrink-0">
      {onDark ? <><path d="M24 5 L43 38 Q44.5 41 41 41 H30 L24 47 L18 41 H7 Q3.5 41 5 38 Z" fill="none" stroke={bone} strokeWidth="6" strokeLinejoin="round" /><path d="M18 5 L24 12 L30 5" fill="none" stroke={bone} strokeWidth="6" strokeLinecap="round" /></> : null}
      <path d="M24 5 L43 38 Q44.5 41 41 41 H30 L24 47 L18 41 H7 Q3.5 41 5 38 Z" fill="#FF6B4A" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 20 L32 41 H30 L24 47 L18 41 H16 Z" fill={ink} />
      <path d="M18 5 L24 12 L30 5" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export interface LogoProps { variant?: "lockup" | "mark" | "wordmark"; size?: number; onDark?: boolean; className?: string }

function Logo({ variant = "lockup", size = 28, onDark, className }: LogoProps) {
  // Outlined paths (Bricolage 800 @ font-size 100). size = the old font-size, so glyph box height = size × 0.814.
  const h = size * 0.814;
  const word = (
    <svg width={h * WORDMARK_ASPECT} height={h} viewBox={WORDMARK_VIEWBOX} aria-hidden="true" className="shrink-0 text-foreground">
      <g transform={WORDMARK_TRANSFORM}><path fill="currentColor" d={WORDMARK_WORD_D} /><path fill="#FF6B4A" d={WORDMARK_DOT_D} /></g>
    </svg>
  );
  if (variant === "mark") return <Mark size={size} onDark={onDark} />;
  if (variant === "wordmark") return <span role="img" aria-label="Teepee" className={cn("inline-flex", className)}>{word}</span>;
  return <span role="img" className={cn("inline-flex items-center gap-2", className)} aria-label="Teepee"><Mark size={size} onDark={onDark} />{word}</span>;
}

export { Logo };
