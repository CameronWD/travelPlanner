import { REVIEW_STALE_ERROR } from "./types";

/**
 * What a Traveller reads about a Review that can't start or didn't finish
 * (spec 2026-10-17 R11, R12). The refusals come back from startReview; the
 * failures are stored on the Review row (Review.error) and shown in its
 * history.
 */
export const REVIEW_MESSAGES = {
  notSetUp: "Reviews are not set up.",
  off: "Reviews aren't switched on for your account.",
  badKind: "Choose a Standard Review or a Deep Review.",
  running: "A Review is already running on this trip.",
  limit: "You've used your Reviews for now.",
  busy: "Claude was busy, so this Review stopped. Start it again in a few minutes.",
  timeout: "This Review took too long and stopped.",
  unreadable: "Claude's reply couldn't be read, so this Review stopped.",
  stale: REVIEW_STALE_ERROR,
  failed: "Something went wrong, so this Review stopped.",
} as const;
