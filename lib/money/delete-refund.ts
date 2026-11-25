/** What happened to the money for a paid thing being deleted. `refundedAt` null = expected, "YYYY-MM-DD" = received. */
export interface DeleteRefundAnswer {
  costId: string;
  refundMinor: number;
  refundedAt: string | null;
}
