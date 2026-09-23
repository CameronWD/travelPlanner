/** The colour block. Every idea on a Playground screen is one Card: outline, hard shadow, chunky radius. */
export interface CardProps {
  /** Block colour — one colour per idea. Default white */
  tone?: 'white' | 'paper' | 'coral' | 'sun' | 'teal' | 'lilac' | 'ink';
  /** Hard shadow offset: 0, 3, 4, 5, 6, 8px. Default 2 */
  shadow?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Default l (20px) */
  radius?: 'm' | 'l' | 'xl' | '2xl';
  /** Default 14 */
  padding?: number | string;
  /** Dashed empty-slot card */
  dashed?: boolean;
  /** A Chip that overlaps the top edge (chapter label) */
  sticker?: React.ReactNode;
  /** Content */
  children: React.ReactNode;
  /** Tappable card */
  onClick?: () => void;
}
export declare function Card(props: CardProps): JSX.Element;
