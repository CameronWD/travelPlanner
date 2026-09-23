/** Desktop left dock — a 96px sun-coloured column with the mark on top, text tabs, and collaborators at the bottom. */
export interface DockProps {
  /** Nav items (text) */
  items: { key: string; label: string; muted?: boolean }[];
  /** Active key */
  value: string;
  /** Change handler */
  onChange?: (key: string) => void;
  /** Collaborator avatars pinned to the bottom */
  people?: { initials: string; tone?: 'coral' | 'sun' | 'teal' | 'lilac' | 'ink' }[];
  /** Dock colour. Default sun */
  tone?: 'sun' | 'teal' | 'lilac' | 'coral';
}
export declare function Dock(props: DockProps): JSX.Element;
