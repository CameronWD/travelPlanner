/** Pill button with a 2px outline and a hard offset shadow that collapses on press. */
export interface ButtonProps {
  /** primary = ink with coral hard shadow (one per screen); secondary = white; accent = coral; dashed = "add" affordance */
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'dashed';
  /** 36 / 44 / 52px tall. Default m */
  size?: 's' | 'm' | 'l';
  /** Full width */
  block?: boolean;
  /** 45% opacity, no press */
  disabled?: boolean;
  /** Icon or glyph before the label */
  leading?: React.ReactNode;
  /** Label */
  children: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
}
export declare function Button(props: ButtonProps): JSX.Element;
