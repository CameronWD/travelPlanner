/** Square outlined checkbox; ink fill with a tick when done, label strikes through. */
export interface CheckboxProps {
  /** State */
  checked: boolean;
  /** Change handler */
  onChange?: (checked: boolean) => void;
  /** Label */
  label?: React.ReactNode;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
