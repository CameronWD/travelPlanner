import { Logo } from "@/components/ui/logo";

export function LogoLoader() {
  return (
    <div role="status" className="grid min-h-[60dvh] place-items-center">
      <span className="animate-spin motion-reduce:animate-none">
        <Logo variant="mark" size={56} />
      </span>
      <span className="sr-only">Loading</span>
    </div>
  );
}
