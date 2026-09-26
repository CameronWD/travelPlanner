/** Lucide icon wrapper at stroke 2.5; requires lucide UMD on the page (see readme › Iconography). */
export interface IconProps {
  /** Lucide icon name in kebab-case, e.g. "bed", "train-front", "plus" */
  name: string;
  /** Pixel size. Default 18 */
  size?: number;
  /** Default 2.5 (matches 2px outlines) */
  strokeWidth?: number;
  /** Stroke colour. Default currentColor */
  color?: string;
  /** Extra styles */
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element;
