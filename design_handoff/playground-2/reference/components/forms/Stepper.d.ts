/** Nights stepper — pill with − and + buttons. */
export interface StepperProps {
  /** Current value */
  value: number;
  /** Default 0 */
  min?: number;
  /** Default 99 */
  max?: number;
  /** Change handler */
  onChange?: (value: number) => void;
  /** Suffix like "n" for nights */
  unit?: string;
}
export declare function Stepper(props: StepperProps): JSX.Element;
