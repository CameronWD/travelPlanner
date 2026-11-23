"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { NotificationBell, type RecentActivity } from "@/components/trip/notification-bell";

const noop = () => () => {};
const findSlot = () => document.getElementById("top-bar-trip-slot");
const noSlotOnServer = () => null;

export function TopBarBell({ tripId, unreadCount, recent }: { tripId: string; unreadCount: number; recent: RecentActivity[] }) {
  const slot = useSyncExternalStore(noop, findSlot, noSlotOnServer);
  return (
    <>
      <span hidden data-top-bar-bell />
      {slot ? createPortal(<NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />, slot) : null}
    </>
  );
}
