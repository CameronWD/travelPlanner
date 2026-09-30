import type { ReactNode } from "react";
import { ArrowLeft, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContinueButton({ label = "Continue" }: { label?: string }) {
  return (
    <Button type="submit" className="h-14 flex-1 px-8 text-[17px] md:flex-none">
      {label}
      <kbd aria-hidden="true" className="hidden rounded-md border-2 border-primary-foreground/40 px-1 py-0.5 md:inline-flex">
        <CornerDownLeft className="size-4" />
      </kbd>
    </Button>
  );
}

export function StepActions({ showBack, onBack, secondary, primary, hint, after }: {
  showBack: boolean;
  onBack?: () => void;
  secondary?: ReactNode;
  primary: ReactNode;
  hint?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-auto flex flex-wrap items-center gap-3 bg-background px-5 pb-[calc(34px+env(safe-area-inset-bottom))] pt-3.5 md:static md:mx-0 md:bg-transparent md:px-0 md:pb-0 md:pt-10">
      {showBack ? (
        <Button type="button" variant="outline" onClick={onBack} className="pressable hidden h-14 px-6 text-[17px] md:inline-flex">
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
      ) : null}
      {secondary}
      {primary}
      {hint ? <span className="hidden text-[15px] font-bold tabular-nums md:inline">{hint}</span> : null}
      {after ? <div className="basis-full text-center md:basis-auto md:text-left">{after}</div> : null}
    </div>
  );
}
