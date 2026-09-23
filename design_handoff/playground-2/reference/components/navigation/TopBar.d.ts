/** Mobile page header: big Bricolage title with optional leading/trailing controls. */
export interface TopBarProps {
  /** Page title (Bricolage 800) */
  title: React.ReactNode;
  /** Back IconButton etc. */
  leading?: React.ReactNode;
  /** Right-side controls (Select, AvatarStack) */
  trailing?: React.ReactNode;
  /** 30px or 18px title. Default l */
  size?: 'l' | 'm';
}
export declare function TopBar(props: TopBarProps): JSX.Element;
