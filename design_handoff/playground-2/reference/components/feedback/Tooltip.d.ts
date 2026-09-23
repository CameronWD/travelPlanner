/** Ink tooltip with a coral hard shadow; desktop only. */
export interface TooltipProps {
  /** Tooltip text */
  label: string;
  /** Trigger */
  children: React.ReactNode;
  /** Default top */
  side?: 'top' | 'bottom' | 'left' | 'right';
}
export declare function Tooltip(props: TooltipProps): JSX.Element;
