export type MoveTarget =
  | { type: "TRIP" }
  | { type: "STOP" | "TRANSPORT" | "ACCOMMODATION" | "ITEM"; id: string };
