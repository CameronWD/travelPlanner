import { formatDayLabel } from "@/lib/dates";
import { estimateRoadKm } from "@/lib/geo";
import { durationMinutes, formatDuration } from "@/lib/transport";
import { instantToZonedDateISO, instantToZonedTime } from "@/lib/tz";
import type { ResolvedHop } from "./hops";

export type DriveTime = { minutes: number; roadKm: number; estimated: boolean };
export type DriveFit = DriveTime & { allowedMinutes: number | null; tooShort: boolean; arriveAt: Date | null };

export function driveTimeOf(hop: ResolvedHop, windingFactor: number): DriveTime {
  return {
    minutes: Math.round(hop.minutes),
    roadKm: Math.round(hop.estimated ? estimateRoadKm(hop.distanceKm, windingFactor) : hop.distanceKm),
    estimated: hop.estimated,
  };
}

export function driveFit(drive: DriveTime, depAt: Date | null, arrAt: Date | null): DriveFit {
  const span = durationMinutes(depAt, arrAt);
  const allowedMinutes = span !== null && span > 0 ? span : null;
  return {
    ...drive,
    allowedMinutes,
    tooShort: !drive.estimated && allowedMinutes !== null && allowedMinutes < drive.minutes,
    arriveAt: depAt ? new Date(depAt.getTime() + drive.minutes * 60_000) : null,
  };
}

export function drivingMinutes(
  hop: Pick<ResolvedHop, "minutes" | "estimated">,
  depAt: Date | null,
  arrAt: Date | null,
): { minutes: number; estimated: boolean } {
  if (depAt && arrAt && arrAt > depAt) {
    const span = (arrAt.getTime() - depAt.getTime()) / 60_000;
    if (!hop.estimated && hop.minutes > 0 && hop.minutes < span) return { minutes: hop.minutes, estimated: false };
    return { minutes: span, estimated: false };
  }
  return { minutes: hop.minutes, estimated: hop.estimated };
}

export function planDriveLine(drive: DriveTime): string {
  return `${drive.roadKm} km · about ${formatDuration(drive.minutes)} driving${drive.estimated ? " (estimated)" : ""}`;
}

export function formDriveLine(fit: DriveFit): string {
  const base = `About ${formatDuration(fit.minutes)} · ${fit.roadKm} km by road${fit.estimated ? " (estimated)" : ""}`;
  return fit.tooShort && fit.allowedMinutes !== null ? `${base}. Your times allow ${formatDuration(fit.allowedMinutes)}.` : base;
}

export function setArrivalLabel(arriveAt: Date, arrZone: string, depDateISO: string): string {
  const date = instantToZonedDateISO(arriveAt, arrZone);
  const time = instantToZonedTime(arriveAt, arrZone);
  return `Set arrival to ${date === depDateISO ? "" : `${formatDayLabel(date)} `}${time}`;
}
