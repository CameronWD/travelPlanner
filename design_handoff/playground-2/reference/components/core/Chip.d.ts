/** Sticker chip — pill with a 2px outline; the workhorse for statuses, tags, transport legs and filters. */
export interface ChipProps {
  /** Sticker colour. Default white */
  tone?: 'white' | 'coral' | 'sun' | 'teal' | 'lilac' | 'ink';
  /** Default m */
  size?: 's' | 'm' | 'l';
  /** Dashed outline = "add one" affordance */
  dashed?: boolean;
  /** Tracked caps for labels like KANTO / PLANNING */
  uppercase?: boolean;
  /** Lifts with a 3px shadow (filter chips) */
  selected?: boolean;
  /** Content */
  children: React.ReactNode;
  /** Makes it tappable */
  onClick?: () => void;
}
export declare function Chip(props: ChipProps): JSX.Element;
