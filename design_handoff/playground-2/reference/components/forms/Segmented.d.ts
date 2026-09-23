/** Pill segmented control — Month / Week, Real plan / Fork. */
export interface SegmentedProps {
  /** 2–4 options */
  options: (string | { value: string; label: string })[];
  /** Selected */
  value: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Selected fill. Default coral */
  tone?: 'coral' | 'sun' | 'teal' | 'lilac' | 'ink';
}
export declare function Segmented(props: SegmentedProps): JSX.Element;
