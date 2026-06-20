"use client";

import * as React from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastData {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms. Defaults to 5000. */
  duration?: number;
  /** Optional action node (e.g. a <ToastAction>). */
  action?: React.ReactNode;
}

export type ToastOptions = Omit<ToastData, "id">;

type Listener = () => void;

let toasts: ToastData[] = [];
const listeners = new Set<Listener>();
let counter = 0;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

/** Imperatively show a toast from anywhere. Returns its id. */
export function toast(options: ToastOptions): string {
  const id = `toast-${++counter}`;
  toasts = [...toasts, { id, duration: 5000, ...options }];
  emit();
  return id;
}

/** Dismiss a toast by id, or all toasts when no id is given. */
export function dismissToast(id?: string) {
  toasts = id ? toasts.filter((t) => t.id !== id) : [];
  emit();
}

/** Subscribe to the toast store (used by the Toaster). */
export function useToast() {
  const state = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );
  return { toasts: state, toast, dismiss: dismissToast };
}
