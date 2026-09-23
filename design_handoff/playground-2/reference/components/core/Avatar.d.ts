/** Initials avatar — a coloured circle with the 2px outline. No photos. */
export interface AvatarProps {
  /** 1–2 letters */
  initials: string;
  /** Each collaborator keeps one colour. Default teal */
  tone?: 'coral' | 'sun' | 'teal' | 'lilac' | 'ink';
  /** Default 30 */
  size?: number;
  /** Rounded square instead of circle */
  square?: boolean;
}
export declare function Avatar(props: AvatarProps): JSX.Element;
