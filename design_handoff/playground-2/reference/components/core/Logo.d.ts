/** Teepee tent-pin mark and lowercase wordmark; use the lockup in headers, the mark alone at ≤24px. */
export interface LogoProps {
  /** Which part of the identity to render. Default lockup */
  variant?: 'lockup' | 'mark' | 'wordmark';
  /** Height of the mark / font-size of the wordmark in px. Default 28 */
  size?: number;
  /** Wordmark colour override (the full stop stays coral) */
  color?: string;
  /** Extra styles on the wrapper */
  style?: React.CSSProperties;
}
export declare function Logo(props: LogoProps): JSX.Element;
