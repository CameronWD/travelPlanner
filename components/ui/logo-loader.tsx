import { MARK_BODY_D, MARK_DOOR_D, MARK_POLES_D } from "@/components/ui/logo";
import { WORDMARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_TRANSFORM, WORDMARK_WORD_D, WORDMARK_DOT_D } from "@/lib/wordmark";

const MARK_SIZE = 56;
const WORD_HEIGHT = 40 * 0.814;

export function LogoLoader() {
  return (
    <div role="status" className="grid min-h-[60dvh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-foreground">
        <span className="tp-build-idle inline-flex">
          <svg width={MARK_SIZE} height={MARK_SIZE} viewBox="0 0 48 48" aria-hidden="true">
            <path className="tp-build-outline" pathLength={1} d={MARK_BODY_D} fill="#FF6B4A" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
            <path className="tp-build-door" d={MARK_DOOR_D} fill="currentColor" />
            <path className="tp-build-poles" pathLength={1} d={MARK_POLES_D} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
        <svg width={WORD_HEIGHT * WORDMARK_ASPECT} height={WORD_HEIGHT} viewBox={WORDMARK_VIEWBOX} aria-hidden="true">
          <g transform={WORDMARK_TRANSFORM}>
            <path className="tp-build-word" fill="currentColor" d={WORDMARK_WORD_D} />
            <path className="tp-build-dot" fill="#FF6B4A" d={WORDMARK_DOT_D} />
          </g>
        </svg>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
