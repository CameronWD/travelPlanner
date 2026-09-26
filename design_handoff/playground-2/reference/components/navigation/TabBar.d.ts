/** Mobile bottom tab bar — the active tab is a coloured sticker tile with a hard shadow. */
export interface TabBarProps {
  /** 4–5 tabs, text labels */
  items: { key: string; label: string }[];
  /** Active key */
  value: string;
  /** Change handler */
  onChange?: (key: string) => void;
  /** Active sticker colour. Default coral */
  tone?: 'coral' | 'sun' | 'teal' | 'lilac';
}
export declare function TabBar(props: TabBarProps): JSX.Element;
