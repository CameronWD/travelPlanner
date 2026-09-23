/** Sticker toast that bounces in from the bottom. */
export interface ToastProps {
  /** Message */
  children: React.ReactNode;
  /** teal = done, coral = heads-up. Default teal */
  tone?: 'teal' | 'coral' | 'sun' | 'lilac' | 'ink';
  /** Optional action label (Undo) */
  action?: string;
  /** Action handler */
  onAction?: () => void;
}
export declare function Toast(props: ToastProps): JSX.Element;
