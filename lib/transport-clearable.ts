import type { TransportInput } from "@/lib/validations/transport";

// An edit's empty fields are clears (ADR 0075). `bookingState` is deliberately absent: a null would hand a choice back to automatic.
const CLEARABLE = ["fromStopId", "toStopId", "depPlace", "arrPlace", "depAt", "arrAt", "reference", "notes", "anchorStopId", "paidAt", "bookBy"] as const;

// A Home end owns no point the form can show, so an edit leaves the stored one out of the clear list (ADR 0075).
export function transportClearable(input: Pick<TransportInput, "depIsHome" | "arrIsHome">) {
  return CLEARABLE.filter((k) => !(k === "depPlace" && input.depIsHome) && !(k === "arrPlace" && input.arrIsHome));
}
