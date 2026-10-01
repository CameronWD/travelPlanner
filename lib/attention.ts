"use client";

/**
 * "Look here." A one-shot nudge from one part of the UI to a control that
 * lives somewhere it cannot reach by props — the Welcome dialog on the Trips
 * page pointing at the Feedback launcher in the app shell (spec 2026-10-01
 * §G). Same shape as lib/feedback-trip-store.ts: a module-level listener set,
 * nothing stored, nothing replayed to late subscribers.
 */

export type AttentionTarget = "feedback";

type Listener = (target: AttentionTarget) => void;

const listeners = new Set<Listener>();

export function requestAttention(target: AttentionTarget): void {
  for (const listener of listeners) listener(target);
}

export function subscribeAttention(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
