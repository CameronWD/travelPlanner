/** Bottom sheet (mobile) / centred dialog (desktop) for add-flows: add a place, add a cost. */
export interface SheetProps {
  /** Visibility */
  open: boolean;
  /** Sheet title */
  title: React.ReactNode;
  /** Dismiss handler */
  onClose: () => void;
  /** Body */
  children: React.ReactNode;
  /** Pinned action row (usually one primary Button) */
  footer?: React.ReactNode;
  /** Centered dialog instead of bottom sheet */
  desktop?: boolean;
}
export declare function Sheet(props: SheetProps): JSX.Element;
