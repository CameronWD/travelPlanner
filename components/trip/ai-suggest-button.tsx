"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface AiSuggestButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Whether the AI feature is configured. When false the button is disabled with a tooltip. */
  aiConfigured: boolean;
  loading?: boolean;
  label: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Reusable "✨ [label]" button for AI-powered features.
 *
 * Renders disabled with an explanatory title when the key is absent.
 */
export function AiSuggestButton({
  aiConfigured,
  loading = false,
  label,
  size = "sm",
  className,
  ...props
}: AiSuggestButtonProps) {
  const disabled = !aiConfigured || loading || props.disabled;
  const title = !aiConfigured
    ? "Add an Anthropic API key to enable AI suggestions"
    : props.title;

  return (
    <Button
      {...props}
      variant="outline"
      size={size}
      loading={loading}
      disabled={disabled}
      title={title}
      className={cn(
        "gap-1.5 text-violet-600 hover:text-violet-700 hover:border-violet-300 dark:text-violet-400 dark:hover:text-violet-300",
        !aiConfigured && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </Button>
  );
}
