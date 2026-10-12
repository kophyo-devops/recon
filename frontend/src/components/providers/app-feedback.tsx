"use client";

import { AlertDialog, Button, Toast, toast } from "@heroui/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ConfirmTone = "danger" | "warning" | "accent" | "success";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
};

type AppFeedbackContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  info: (title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

const defaultConfirm: ConfirmState = {
  open: false,
  title: "",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  tone: "accent",
};

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState>(defaultConfirm);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => ({ ...prev, open: false }));
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setConfirmState({
        open: true,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        tone: options.tone ?? "accent",
      });
    });
  }, []);

  const value = useMemo<AppFeedbackContextValue>(
    () => ({
      confirm,
      info: (title, description) =>
        toast.info(title, description ? { description } : undefined),
      success: (title, description) =>
        toast.success(title, description ? { description } : undefined),
      warning: (title, description) =>
        toast.warning(title, description ? { description } : undefined),
      error: (title, description) =>
        toast.danger(title, description ? { description } : undefined),
    }),
    [confirm],
  );

  const iconStatus =
    confirmState.tone === "danger"
      ? "danger"
      : confirmState.tone === "warning"
        ? "warning"
        : confirmState.tone === "success"
          ? "success"
          : "accent";

  return (
    <AppFeedbackContext.Provider value={value}>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        {children}
      </div>

      <div aria-live="polite" aria-relevant="additions" className="contents">
        <Toast.Provider placement="top end" />
      </div>

      <AlertDialog.Backdrop
        isOpen={confirmState.open}
        onOpenChange={(open) => {
          if (!open) closeConfirm(false);
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status={iconStatus} />
              <AlertDialog.Heading>{confirmState.title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-[14px] leading-relaxed text-[var(--muted)]">
                {confirmState.message}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                slot="close"
                variant="tertiary"
                onPress={() => closeConfirm(false)}
              >
                {confirmState.cancelLabel}
              </Button>
              <Button
                variant={confirmState.tone === "danger" ? "danger" : "primary"}
                onPress={() => closeConfirm(true)}
              >
                {confirmState.confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) {
    throw new Error("useAppFeedback must be used within AppFeedbackProvider");
  }
  return ctx;
}
