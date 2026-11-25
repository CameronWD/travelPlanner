export type ConfirmationKind = "TRANSPORT" | "ACCOMMODATION" | "ITEM";

export interface ConfirmationSubject {
  kind: ConfirmationKind;
  id: string;
  bookingState: string;
  nothingToAttach: boolean;
  lastDay: string | null;
  photoAttachmentId?: string | null;
}

/** CONTEXT.md "Booking confirmation": any Attachment but the Item photo. */
export function hasBookingConfirmation(attachmentIds: readonly string[], photoAttachmentId?: string | null): boolean {
  return attachmentIds.some((id) => id !== photoAttachmentId);
}

export function needsBookingConfirmation(
  s: ConfirmationSubject,
  attachmentIds: readonly string[],
  today: string,
): boolean {
  return (
    s.bookingState === "BOOKED" &&
    !s.nothingToAttach &&
    !hasBookingConfirmation(attachmentIds, s.photoAttachmentId) &&
    (s.lastDay === null || s.lastDay >= today)
  );
}
