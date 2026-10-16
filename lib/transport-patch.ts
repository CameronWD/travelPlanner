/**
 * A Transport's PATCH rules (ADR 0075, spec 2026-10-14 card 3.L). Each end
 * is a Stop, a Stop plus its exact point (`depPlace`/`arrPlace`: the station,
 * airport or pier), a point alone, Home, or nothing. `""` and `null` both
 * mean "none" for a Stop or a point; `undefined` keeps it.
 *
 *  - Home with a non-empty Stop or point is refused; Home alone (or with
 *    empty ones, as the form sends it) clears both.
 *  - Stop and point given together set the end as given — the form's save;
 *    both empty and not Home is an end with neither, which the app allows.
 *  - A Stop alone: empty unlinks it (the point stays; nothing left is
 *    refused); a new Stop clears a stale point, the same Stop keeps it.
 *  - A point alone keeps the end's Stop (unless it is Home); an empty point
 *    leaves a Home end Home, and on a point-alone end is refused.
 *  - `isHome: false` alone keeps the Stop and point (nothing to fall back on
 *    is refused). A patch that touches none of these keeps the end.
 *
 * Times stay as the row's instants unless the patch sends one. Pure.
 */
import type { ActionFailure } from "@/lib/action-result";
import type { TransportInput } from "@/lib/validations/transport";
import { patched, type Patch } from "@/lib/patch";

export type TransportPatch = Patch<TransportInput>;
export type TransportPatchRow = {
  mode: string;
  fromStopId: string | null;
  toStopId: string | null;
  anchorStopId: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  reference: string | null;
  notes: string | null;
};

type Endpoint = { stopId: string | null; place: string | null; isHome: boolean };
type EndpointPatch = { stopId?: string | null; place?: string | null; isHome?: boolean | null };
type EndpointFields = { stopField: string; placeField: string; homeField: string; label: string };

/** The one "Home plus a Stop/point" refusal (spec B2), shared with `add_transport`. */
export function homeContradictionError(fields: { stopField: string; placeField: string; homeField: string }): ActionFailure {
  return {
    success: false,
    errors: { [fields.homeField]: [`${fields.homeField} can't be true together with ${fields.stopField} or ${fields.placeField}.`] },
  };
}

function mergeEndpoint(current: Endpoint, patch: EndpointPatch, fields: EndpointFields): Endpoint | ActionFailure {
  const stopGiven = patch.stopId !== undefined;
  const placeGiven = patch.place !== undefined;
  const stopId = patch.stopId || null;
  const place = patch.place || null;
  const neither: ActionFailure = { success: false, errors: { [fields.stopField]: [`${fields.label} needs a stop or a place.`] } };

  if (patch.isHome === true) {
    if (stopId !== null || place !== null) return homeContradictionError(fields);
    return { stopId: null, place: null, isHome: true };
  }
  if (stopGiven && placeGiven) return { stopId, place, isHome: false };
  if (stopGiven) {
    if (stopId === null) {
      if (current.place == null) return neither;
      return { stopId: null, place: current.place, isHome: false };
    }
    return { stopId, place: stopId === current.stopId ? current.place : null, isHome: false };
  }
  if (placeGiven) {
    if (current.isHome && place === null) return { stopId: null, place: null, isHome: true };
    const keptStop = current.stopId != null && !current.isHome ? current.stopId : null;
    if (keptStop === null && place === null) return neither;
    return { stopId: keptStop, place, isHome: false };
  }
  if (patch.isHome === false) {
    if (current.stopId == null && current.place == null) {
      return { success: false, errors: { [fields.stopField]: [`${fields.label} needs a stop or a place when it isn't Home.`] } };
    }
    return { stopId: current.stopId, place: current.place, isHome: false };
  }
  return current;
}

const isFailure = (v: object): v is ActionFailure => "success" in v;

/** Merge a patch onto a Transport row (inline Cost fields are not merged here; `completeInlineCost` completes them). */
export function mergeTransportPatch(current: TransportPatchRow, patch: TransportPatch): Partial<TransportInput> | ActionFailure {
  const dep = mergeEndpoint(
    { stopId: current.fromStopId, place: current.depPlace, isHome: current.depIsHome },
    { stopId: patch.fromStopId, place: patch.depPlace, isHome: patch.depIsHome },
    { stopField: "fromStopId", placeField: "depPlace", homeField: "depIsHome", label: "Departure" },
  );
  if (isFailure(dep)) return dep;
  const arr = mergeEndpoint(
    { stopId: current.toStopId, place: current.arrPlace, isHome: current.arrIsHome },
    { stopId: patch.toStopId, place: patch.arrPlace, isHome: patch.arrIsHome },
    { stopField: "toStopId", placeField: "arrPlace", homeField: "arrIsHome", label: "Arrival" },
  );
  if (isFailure(arr)) return arr;

  return {
    mode: (patch.mode ?? current.mode) as TransportInput["mode"],
    fromStopId: dep.stopId ?? undefined,
    toStopId: arr.stopId ?? undefined,
    anchorStopId: patched(patch.anchorStopId, current.anchorStopId),
    depIsHome: dep.isHome,
    arrIsHome: arr.isHome,
    depPlace: dep.place ?? undefined,
    arrPlace: arr.place ?? undefined,
    depAt: patched(patch.depAt, current.depAt),
    arrAt: patched(patch.arrAt, current.arrAt),
    reference: patched(patch.reference, current.reference),
    notes: patched(patch.notes, current.notes),
  };
}
