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

    markAllRead(tripId).then(() => {
      router.refresh();
    });
  }, [tripId, router]);

  return null;
}
