"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{cancelLabel}</Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "primary"}
            autoFocus
            onClick={() => {
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  resolver: ((value: boolean) => void) | null;
}

const DEFAULT_OPTIONS: ConfirmOptions = { title: "" };

export function useConfirm(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dialog: React.ReactNode;
} {
  const [state, setState] = React.useState<ConfirmState>({
    open: false,
    options: DEFAULT_OPTIONS,
    resolver: null,
  });

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, options: opts, resolver: resolve });
    });
  }, []);

  const handleOpenChange = React.useCallback((open: boolean) => {
    if (!open) {
      setState((prev) => {
        prev.resolver?.(false);
        return { open: false, options: prev.options, resolver: null };
      });
    }
  }, []);

  const handleConfirm = React.useCallback(() => {
    setState((prev) => {
      prev.resolver?.(true);
      return { open: false, options: prev.options, resolver: null };
    });
  }, []);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
      {...state.options}
    />
  );

  return { confirm, dialog };
}
