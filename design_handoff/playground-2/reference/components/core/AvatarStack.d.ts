/** Overlapping avatars for trip collaborators. */
export interface AvatarStackProps {
  /** Collaborators */
  people: { initials: string; tone?: 'coral' | 'sun' | 'teal' | 'lilac' | 'ink' }[];
  /** Default 30 */
  size?: number;
  /** Overflow to +N. Default 4 */
  max?: number;
}
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;
