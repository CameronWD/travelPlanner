"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markAllRead } from "@/server/actions/activity";

interface MarkReadOnViewProps {
  tripId: string;
}

export function MarkReadOnView({ tripId }: MarkReadOnViewProps) {
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    markAllRead(tripId)
      .then(() => {
        router.refresh();
      })
      .catch(() => {
        // Mark-read failed (network/auth). Allow a later render to retry
        // instead of leaving the unread dots stuck for the session.
        called.current = false;
      });
  }, [tripId, router]);

  return null;
}
