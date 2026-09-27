import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import {
  travellerImageUrl,
  travellerInitials,
  travellerName,
  type TravellerLike,
} from "@/lib/traveller";

/**
 * The one Avatar every surface that shows a Traveller renders — see
 * `lib/traveller.ts`'s header comment. Before this, half a dozen components
 * each carried their own copy of `initials()` and their own `Avatar` markup,
 * so a Traveller's uploaded Profile photo and Display name (CONTEXT.md
 * "Profile photo and display name") only ever showed up where someone had
 * remembered to wire it in — the Journal page, notably, never did.
 */

const SIZE_CLASS = {
  24: "size-6",
  32: "size-8",
  36: "size-9",
  40: "size-10",
} as const;

const FALLBACK_TEXT_CLASS = {
  24: "text-[9px]",
  32: "text-[11px]",
  36: "text-xs",
  40: "text-sm",
} as const;

export interface TravellerAvatarProps {
  traveller: TravellerLike;
  /** One of the kit's four fixed avatar steps. Default 36 (the top-bar size). */
  size?: 24 | 32 | 36 | 40;
  /** Escape hatch for a call site that needs a size or shape off the kit's
   * four steps (e.g. the Account card's large preview) — merged last, so it
   * wins over this component's own size class. */
  className?: string;
  /** A 2px ring in the page background, for avatars overlapped into a stack. */
  ring?: boolean;
}

export function TravellerAvatar({
  traveller,
  size = 36,
  className,
  ring = false,
}: TravellerAvatarProps) {
  const name = travellerName(traveller);
  const imageUrl = travellerImageUrl(traveller);

  return (
    <Avatar
      className={cn(SIZE_CLASS[size], ring && "ring-2 ring-background", className)}
      title={name}
    >
      {imageUrl ? <AvatarImage src={imageUrl} alt={name} /> : null}
      <AvatarFallback className={FALLBACK_TEXT_CLASS[size]}>
        {travellerInitials(traveller)}
      </AvatarFallback>
    </Avatar>
  );
}
