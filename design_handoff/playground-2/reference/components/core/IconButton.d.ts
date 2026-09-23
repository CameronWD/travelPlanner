/** Square, rounded icon button (44px hit target) with outline + hard shadow. */
export interface IconButtonProps {
  /** Icon or a single glyph like "+", "‹", "⋮" */
  children: React.ReactNode;
  /** Square size in px. Default 44 */
  size?: number;
  /** Fill. Default card (white) */
  tone?: 'card' | 'ink' | 'accent' | 'ghost';
  /** Accessible name */
  label: string;
  /** Click handler */
  onClick?: () => void;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
