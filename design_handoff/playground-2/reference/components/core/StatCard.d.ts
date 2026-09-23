/** Coloured stat block: caps label, big Bricolage number, optional progress bar. */
export interface StatCardProps {
  /** Tracked caps label, e.g. SPENT */
  label: string;
  /** Big display number */
  value: React.ReactNode;
  /** Small line under the value */
  sub?: string;
  /** Default sun */
  tone?: 'white' | 'coral' | 'sun' | 'teal' | 'lilac';
  /** 0–100 renders a ProgressBar */
  progress?: number;
  /** 56px display number (sleeps to go) */
  big?: boolean;
}
export declare function StatCard(props: StatCardProps): JSX.Element;
