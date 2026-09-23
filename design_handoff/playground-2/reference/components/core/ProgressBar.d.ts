/** Outlined pill track with a solid ink fill. */
export interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** Default 10 */
  height?: number;
  /** Bar colour. Default ink */
  fill?: string;
}
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
