import { highlightAttrs } from "./card-highlight";
import { refundLabel, slotLabel } from "@/lib/slot-time";

/**
 * CONTEXT.md "Slot time" on a row or card (spec 2026-10-17 R3): "Slot 12:00 ·
 * be there 11:45" and, only for a non-refundable ticket, "Non-refundable".
 * A fragment, so it joins the caller's own flex-wrap meta row. Nothing for an
 * Item with no slot (a Surprise placeholder is masked to none).
 */
export function SlotFacts({
  item,
  highlight,
}: {
  item: { slotTime?: string | null; arriveByMinutes?: number | null; refundable?: boolean | null };
  highlight?: readonly string[];
}) {
  const slot = slotLabel(item);
  const refund = refundLabel(item.refundable);
  return (
    <>
      {slot && (
        <span data-slot-time {...highlightAttrs(highlight, ["slotTime", "arriveBy"], "tabular-nums")}>
          {slot}
        </span>
      )}
      {refund && (
        <span data-refund {...highlightAttrs(highlight, "refundable", "shrink-0 whitespace-nowrap font-bold text-foreground")}>
          {refund}
        </span>
      )}
    </>
  );
}
