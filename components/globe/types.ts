/** A Marker as rendered by the Globe UI (subset of the Prisma Marker row). */
export interface MarkerView {
  id: string;
  title: string;
  category: string;
  note: string | null;
  link: string | null;
  timing: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

/** A Globe member for the sharing UI. */
export interface GlobeMemberView {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
}

/** A located Trip Stop drawn as a numbered pin on `?added=` arrival (Task 15). */
export interface ArrivalPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** The Trip whose Stops just landed on the Globe, and the pins to draw for it. */
export interface GlobeArrival {
  tripId: string;
  pins: ArrivalPin[];
}
