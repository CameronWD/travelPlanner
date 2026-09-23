/** Switch with an ink knob; teal when on. */
export interface ToggleProps {
  /** State */
  checked: boolean;
  /** Change handler */
  onChange?: (checked: boolean) => void;
  /** Label to the right */
  label?: React.ReactNode;
}
export declare function Toggle(props: ToggleProps): JSX.Element;
