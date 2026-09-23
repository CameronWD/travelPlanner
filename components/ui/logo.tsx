import { cn } from "@/lib/cn";

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
  const word = <span className="whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.04em] text-foreground" style={{ fontSize: size }}>teepee<span className="text-coral">.</span></span>;
  if (variant === "mark") return <Mark size={size} onDark={onDark} />;
  if (variant === "wordmark") return <span className={className}>{word}</span>;
  return <span className={cn("inline-flex items-center gap-2", className)} aria-label="Teepee"><Mark size={size} onDark={onDark} />{word}</span>;
}

export { Logo };
