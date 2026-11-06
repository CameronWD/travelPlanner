export const GOOGLE_SHARE = 1;

export const GOOGLE_FREE_MONTHLY = {
  routes: 10_000,
  "venue-details": 1_000,
  "nearby-search": 1_000,
  "venue-status": 5_000,
  "static-maps": 10_000,
} as const;

export type GoogleSku = keyof typeof GOOGLE_FREE_MONTHLY;

export function dailyCap(sku: GoogleSku, share: number = GOOGLE_SHARE): number {
  return Math.floor((GOOGLE_FREE_MONTHLY[sku] * share) / 30);
}
