/** Native select dressed as an outlined field, or a small pill dropdown for headers. */
export interface SelectProps {
  /** Caps label */
  label?: string;
  /** Selected value */
  value?: string;
  /** Options */
  options: (string | { value: string; label: string })[];
  /** Change handler */
  onChange?: (value: string) => void;
  /** s = pill dropdown for headers ("Real plan ▾"). Default m */
  size?: 's' | 'm';
}
export declare function Select(props: SelectProps): JSX.Element;
