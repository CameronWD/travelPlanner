export const MAX_FEEDBACK_PICTURES = 4;

export const FEEDBACK_PICTURE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export function feedbackPictureUrl(id: string): string {
  return `/api/feedback-pictures/${id}`;
}
