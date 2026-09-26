/** Round count badge with outline — "2 things to sort". */
export interface BadgeProps {
  /** Number or short glyph */
  count: number | string;
  /** Default coral */
  tone?: 'coral' | 'sun' | 'teal' | 'lilac' | 'ink';
  /** Default 24 */
  size?: number;
}
export declare function Badge(props: BadgeProps): JSX.Element;
