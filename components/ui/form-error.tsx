export function FormError({
  children,
  id,
}: {
  children?: React.ReactNode;
  id?: string;
}): React.ReactNode | null {
  if (!children) {
    return null;
  }

  return (
    <p role="alert" id={id} className="text-sm font-medium text-destructive">
      {children}
    </p>
  );
}
