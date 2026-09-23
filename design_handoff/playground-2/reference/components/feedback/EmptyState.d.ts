/** Dashed empty slot with a tilted sticker tile, a headline and one action. */
export interface EmptyStateProps {
  /** Short, friendly headline */
  title: string;
  /** One sentence of encouragement */
  body?: string;
  /** Primary button label */
  action?: string;
  /** Handler */
  onAction?: () => void;
  /** Glyph tile colour. Default sun */
  tone?: 'sun' | 'teal' | 'lilac' | 'coral';
  /** A big glyph or Icon in the tilted tile */
  glyph?: React.ReactNode;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
