export type ConfirmationKind = "TRANSPORT" | "ACCOMMODATION" | "ITEM";

export interface ConfirmationSubject {
  kind: ConfirmationKind;
  id: string;
  bookingState: string;
  nothingToAttach: boolean;
  lastDay: string | null;
  photoAttachmentId?: string | null;
}

export function needsBookingConfirmation(
  s: ConfirmationSubject,
  attachmentIds: readonly string[],
  today: string,
): boolean {
  const filesBesidesPhoto = attachmentIds.filter((id) => id !== s.photoAttachmentId);
  return (
    s.bookingState === "BOOKED" &&
    !s.nothingToAttach &&
    filesBesidesPhoto.length === 0 &&
    (s.lastDay === null || s.lastDay >= today)
  );
}
