/** Task / list row with a coloured glyph tile, two lines of text and a trailing arrow. */
export interface ListRowProps {
  /** Glyph in the leading tile ("Zz", "→", "¥", an Icon) */
  tile?: React.ReactNode;
  /** Default lilac */
  tileTone?: 'coral' | 'sun' | 'teal' | 'lilac' | 'ink' | 'white';
  /** Main line */
  title: React.ReactNode;
  /** Muted second line */
  sub?: React.ReactNode;
  /** Default "→" */
  trailing?: React.ReactNode;
  /** Tappable */
  onClick?: () => void;
}
export declare function ListRow(props: ListRowProps): JSX.Element;
