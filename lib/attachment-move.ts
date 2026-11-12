export type MoveTarget =
  | { type: "TRIP" }
  | { type: "STOP" | "TRANSPORT" | "ACCOMMODATION" | "ITEM"; id: string };

export interface MoveTargetGroup {
  label: string;
  options: Array<{ value: string; label: string; target: MoveTarget }>;
}
