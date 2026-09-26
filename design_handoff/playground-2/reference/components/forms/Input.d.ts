/** Outlined text field; lifts with a hard shadow when focused. */
export interface InputProps {
  /** Caps label above */
  label?: string;
  /** Helper below */
  hint?: string;
  /** Controlled value */
  value?: string;
  /** Called with the string value */
  onChange?: (value: string) => void;
  /** Placeholder */
  placeholder?: string;
  /** 48 / 56px. Default m */
  size?: 'm' | 'l';
  /** Icon before */
  leading?: React.ReactNode;
  /** Element after */
  trailing?: React.ReactNode;
  /** Input type. Default text */
  type?: string;
}
export declare function Input(props: InputProps): JSX.Element;
